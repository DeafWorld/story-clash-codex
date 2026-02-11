#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

cd "${ROOT_DIR}"

function detect_wrangler_bin() {
  if [[ -n "${WRANGLER_BIN:-}" && -x "${WRANGLER_BIN}" ]]; then
    printf "%s" "${WRANGLER_BIN}"
    return
  fi
  if [[ -x "${ROOT_DIR}/node_modules/.bin/wrangler" ]]; then
    printf "%s" "${ROOT_DIR}/node_modules/.bin/wrangler"
    return
  fi
  if command -v wrangler >/dev/null 2>&1; then
    command -v wrangler
    return
  fi
  local cached
  cached="$(ls -d "${HOME}"/.npm/_npx/*/node_modules/.bin/wrangler 2>/dev/null | tail -n 1 || true)"
  if [[ -n "${cached}" && -x "${cached}" ]]; then
    printf "%s" "${cached}"
    return
  fi
  printf "npx --yes wrangler"
}

WRANGLER_CMD="$(detect_wrangler_bin)"

function run_wrangler() {
  if [[ "${WRANGLER_CMD}" == "npx --yes wrangler" ]]; then
    npx --yes wrangler "$@"
  else
    "${WRANGLER_CMD}" "$@"
  fi
}

function detect_python() {
  if command -v python3.13 >/dev/null 2>&1; then
    command -v python3.13
    return
  fi
  command -v python3
}

PYTHON_BIN="$(detect_python)"

function ensure_account_id() {
  if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    return
  fi

  # Extract the first 32-hex account id from `wrangler whoami`.
  local id
  id="$(printf "%s\n" "${WHOAMI_OUTPUT:-}" | grep -Eo '[a-f0-9]{32}' | head -n 1 || true)"
  if [[ -n "${id}" ]]; then
    export CLOUDFLARE_ACCOUNT_ID="${id}"
  fi
}

function ensure_workers_dev_subdomain() {
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    return
  fi
  if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    return
  fi

  local desired="${CLOUDFLARE_WORKERS_SUBDOMAIN:-storyclashcodex}"
  # Create/enable the workers.dev subdomain for this account (idempotent).
  curl -fsS -X PUT \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
    --data "{\"enabled\":true,\"subdomain\":\"${desired}\"}" >/dev/null 2>&1 || true
}

function verify_worker_health() {
  local worker_url="$1"

  # Prefer curl, but fall back to Python+OpenSSL (curl+LibreSSL fails in some macOS setups).
  if curl -fsS "${worker_url}/healthz" >/dev/null 2>&1; then
    return
  fi

  "${PYTHON_BIN}" - <<PY
import ssl, socket, sys
host="${worker_url#https://}"
host=host.split("/")[0]
ctx=ssl.create_default_context()
ctx.set_alpn_protocols(["http/1.1"])
with socket.create_connection((host,443),timeout=10) as sock:
  with ctx.wrap_socket(sock, server_hostname=host) as ssock:
    req=(
      "GET /healthz HTTP/1.1\\r\\n"
      f"Host: {host}\\r\\n"
      "User-Agent: story-clash-cutover\\r\\n"
      "Connection: close\\r\\n\\r\\n"
    )
    ssock.sendall(req.encode("ascii"))
    data=b""
    while True:
      chunk=ssock.recv(65536)
      if not chunk:
        break
      data+=chunk
text=data.decode("utf-8","replace")
if " 200 " not in text.split("\\r\\n",1)[0]:
  print(text)
  sys.exit(1)
sys.exit(0)
PY
}

function upsert_env() {
  local key="$1"
  local value="$2"

  touch "${ENV_FILE}"

  if grep -q "^${key}=" "${ENV_FILE}"; then
    awk -v k="${key}" -v v="${value}" '
      BEGIN { FS = OFS = "=" }
      $1 == k { $0 = k "=" v }
      { print }
    ' "${ENV_FILE}" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

echo "[1/4] Checking Cloudflare auth..."
WHOAMI_OUTPUT="$(run_wrangler whoami 2>&1 || true)"
printf "%s\n" "${WHOAMI_OUTPUT}"
ensure_account_id
ensure_workers_dev_subdomain

if printf "%s\n" "${WHOAMI_OUTPUT}" | grep -qi "not authenticated"; then
  echo
  echo "Cloudflare auth is required. Run:"
  echo "  npx wrangler login --browser=false"
  echo "Then re-run this script."
  exit 1
fi

echo
echo "[2/4] Deploying Worker from cloudflare/wrangler.toml..."
DEPLOY_OUTPUT="$(run_wrangler deploy --config cloudflare/wrangler.toml 2>&1)"
printf "%s\n" "${DEPLOY_OUTPUT}"

WORKER_URL="$(printf "%s\n" "${DEPLOY_OUTPUT}" | grep -Eo 'https://[A-Za-z0-9.-]+\.workers\.dev' | head -n 1)"
if [[ -z "${WORKER_URL}" ]]; then
  echo "Could not detect workers.dev URL from deploy output."
  exit 1
fi
WS_URL="${WORKER_URL/https:\/\//wss://}"

echo
echo "[3/4] Updating frontend env in .env.local..."
upsert_env "NEXT_PUBLIC_REALTIME_TRANSPORT" "ws"
upsert_env "NEXT_PUBLIC_API_BASE_URL" "${WORKER_URL}"
upsert_env "NEXT_PUBLIC_WS_BASE_URL" "${WS_URL}"

echo
echo "[4/4] Verifying Worker health..."
verify_worker_health "${WORKER_URL}"

echo
echo "Cutover complete."
echo "Worker domain: ${WORKER_URL}"
echo "WebSocket base: ${WS_URL}"
echo "Updated env file: ${ENV_FILE}"
echo
echo "Next steps:"
echo "  1) Restart Next dev server (or redeploy frontend host)."
echo "  2) Frontend free domain can be your provider subdomain (e.g. *.vercel.app)."
echo "  3) Keep backend on this free *.workers.dev domain."
