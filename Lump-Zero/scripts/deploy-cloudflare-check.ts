import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { getRootDir, listSiteRecords, type SiteRecord } from "./lib/site-registry.ts";
import { hasAllFlag, parseSiteArg } from "./lib/factory.ts";

interface CloudflareProjectListResponse {
  success: boolean;
  errors: Array<{ message?: string }>;
  result: Array<{ name: string }>;
  result_info?: {
    page?: number;
    per_page?: number;
    total_pages?: number;
  };
}

const requiredEnvVars = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;

function getRequestedSites(args: string[], allSites: SiteRecord[]) {
  if (!args.length || hasAllFlag(args)) {
    return allSites;
  }

  const slug = parseSiteArg(args);
  return allSites.filter((site) => site.slug === slug);
}

async function runCommand(command: string, commandArgs: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function verifyWranglerAvailable() {
  const localWrangler = path.join(getRootDir(), "node_modules", ".bin", "wrangler");
  await access(localWrangler);
}

async function verifyRequiredEnv() {
  const missing = requiredEnvVars.filter((envName) => !process.env[envName]);
  if (missing.length) {
    throw new Error(`Missing required Cloudflare env vars: ${missing.join(", ")}`);
  }
}

async function verifyAuth() {
  const result = await runCommand("npx", ["wrangler", "whoami"]);
  if (result.code !== 0) {
    const message = (result.stderr || result.stdout || "Cloudflare auth check failed.").trim();
    throw new Error(`Wrangler auth check failed: ${message}`);
  }
}

async function fetchPagesProjects(accountId: string, apiToken: string) {
  const projects = new Set<string>();
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects?page=${page}&per_page=100`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Cloudflare Pages project lookup failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as CloudflareProjectListResponse;
    if (!payload.success) {
      throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare Pages project lookup failed.");
    }

    for (const project of payload.result) {
      projects.add(project.name);
    }

    totalPages = payload.result_info?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return projects;
}

function reportOptionalEnv(site: SiteRecord) {
  const notices: string[] = [];

  if (site.manualTokenEnv && !process.env[site.manualTokenEnv]) {
    notices.push(`${site.manualTokenEnv} not set. Manual beacon injection stays disabled; Pages dashboard Web Analytics is still valid.`);
  }

  if (site.customEventEndpointEnv && !process.env[site.customEventEndpointEnv]) {
    notices.push(`${site.customEventEndpointEnv} not set. Custom tool events remain disabled by design for v1.`);
  }

  return notices;
}

async function main() {
  await verifyWranglerAvailable();
  await verifyRequiredEnv();

  const allSites = await listSiteRecords();
  const sites = getRequestedSites(process.argv.slice(2), allSites);
  if (!sites.length) {
    throw new Error(`Unknown site slug: ${parseSiteArg(process.argv.slice(2))}`);
  }

  await verifyAuth();
  const projectNames = await fetchPagesProjects(process.env.CLOUDFLARE_ACCOUNT_ID!, process.env.CLOUDFLARE_API_TOKEN!);

  for (const site of sites) {
    if (!projectNames.has(site.cloudflareProjectName)) {
      throw new Error(`Missing Cloudflare Pages project: ${site.cloudflareProjectName}. Create it in Cloudflare Pages before deploying ${site.slug}.`);
    }

    console.log(`[${site.slug}] Cloudflare Pages project found: ${site.cloudflareProjectName}`);
    for (const notice of reportOptionalEnv(site)) {
      console.log(`[${site.slug}] ${notice}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
