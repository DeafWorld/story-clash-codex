import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function unique(values) {
  return [...new Set(values)];
}

function extractUnionValues(source, typeName) {
  const re = new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?);`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find type union: ${typeName}`);
  }
  return unique([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}

function extractObjectFieldsFromPayloadMap(source, objectName) {
  const re = new RegExp(`${objectName}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\};`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find payload object: ${objectName}`);
  }
  return unique([...match[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\??\s*:/g)].map((entry) => entry[1]));
}

function extractObjectFieldsFromType(source, typeName) {
  const re = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find type object: ${typeName}`);
  }
  return unique([...match[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\??\s*:/g)].map((entry) => entry[1]));
}

function extractConstString(source, constName) {
  const re = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*"([^"]+)"`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find const string: ${constName}`);
  }
  return match[1];
}

function extractConstNumber(source, constName) {
  const re = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*(\\d+)`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find const number: ${constName}`);
  }
  return Number(match[1]);
}

function arraysEqualOrdered(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, idx) => value === right[idx]);
}

function missingValues(required, actual) {
  const set = new Set(actual);
  return required.filter((value) => !set.has(value));
}

const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const gmSchema = readJson("protocol/gm-events.schema.json");
const snapshotSchema = readJson("protocol/snapshot.schema.json");
const unityEvents = readJson("unity/client-stubs/gm-events.stub.json");
const unitySnapshot = readJson("unity/client-stubs/snapshot.stub.json");
const unityMeta = readJson("unity/client-stubs/protocol-meta.stub.json");

const protocolVersionSource = readText("protocol/protocol-version.ts");
const webRealtime = readText("src/types/realtime.ts");
const cloudflareTypes = readText("cloudflare/src/types.ts");

const schemaClientEvents = gmSchema?.properties?.clientEvents?.items?.enum ?? [];
const schemaServerEvents = gmSchema?.properties?.serverEvents?.items?.enum ?? [];
const schemaSnapshotRequired = snapshotSchema?.required ?? [];

assert(Array.isArray(schemaClientEvents) && schemaClientEvents.length > 0, "Schema clientEvents enum is missing/empty.");
assert(Array.isArray(schemaServerEvents) && schemaServerEvents.length > 0, "Schema serverEvents enum is missing/empty.");
assert(Array.isArray(schemaSnapshotRequired) && schemaSnapshotRequired.length > 0, "Snapshot schema required[] is missing/empty.");

assert(
  arraysEqualOrdered(schemaClientEvents, unityEvents.clientEvents ?? []),
  "Unity client event stub drift: unity/client-stubs/gm-events.stub.json does not match protocol/gm-events.schema.json clientEvents."
);
assert(
  arraysEqualOrdered(schemaServerEvents, unityEvents.serverEvents ?? []),
  "Unity server event stub drift: unity/client-stubs/gm-events.stub.json does not match protocol/gm-events.schema.json serverEvents."
);
assert(
  arraysEqualOrdered(schemaSnapshotRequired, unitySnapshot.required ?? []),
  "Unity snapshot stub drift: unity/client-stubs/snapshot.stub.json does not match protocol/snapshot.schema.json required fields."
);

const webClientEvents = extractUnionValues(webRealtime, "ClientEventName");
const webServerEvents = extractUnionValues(webRealtime, "ServerEventName");
const cfClientEvents = extractUnionValues(cloudflareTypes, "ClientEventName");
const cfServerEvents = extractUnionValues(cloudflareTypes, "ServerEventName");

const webClientMissing = missingValues(schemaClientEvents, webClientEvents);
const webServerMissing = missingValues(schemaServerEvents, webServerEvents);
const cfClientMissing = missingValues(schemaClientEvents, cfClientEvents);
const cfServerMissing = missingValues(schemaServerEvents, cfServerEvents);

assert(webClientMissing.length === 0, `Web realtime client events missing schema values: ${webClientMissing.join(", ")}`);
assert(webServerMissing.length === 0, `Web realtime server events missing schema values: ${webServerMissing.join(", ")}`);
assert(cfClientMissing.length === 0, `Cloudflare client events missing schema values: ${cfClientMissing.join(", ")}`);
assert(cfServerMissing.length === 0, `Cloudflare server events missing schema values: ${cfServerMissing.join(", ")}`);

const webSnapshotFields = extractObjectFieldsFromPayloadMap(webRealtime, "gm_state_update");
const cfSnapshotFields = extractObjectFieldsFromType(cloudflareTypes, "GMStateUpdatePayload");

const webSnapshotMissing = missingValues(schemaSnapshotRequired, webSnapshotFields);
const cfSnapshotMissing = missingValues(schemaSnapshotRequired, cfSnapshotFields);

assert(webSnapshotMissing.length === 0, `Web gm_state_update payload missing fields: ${webSnapshotMissing.join(", ")}`);
assert(cfSnapshotMissing.length === 0, `Cloudflare GMStateUpdatePayload missing fields: ${cfSnapshotMissing.join(", ")}`);

const protocolVersion = extractConstString(protocolVersionSource, "PROTOCOL_VERSION");
const snapshotVersion = extractConstNumber(protocolVersionSource, "SNAPSHOT_VERSION");

assert(
  unityMeta.protocolVersion === protocolVersion,
  `Unity protocol meta drift: expected protocolVersion=${protocolVersion}, got ${unityMeta.protocolVersion}`
);
assert(
  Number(unityMeta.snapshotVersion) === snapshotVersion,
  `Unity protocol meta drift: expected snapshotVersion=${snapshotVersion}, got ${unityMeta.snapshotVersion}`
);
assert(unityMeta.clientType === "unity", `Unity protocol meta drift: expected clientType=unity, got ${unityMeta.clientType}`);

if (errors.length > 0) {
  console.error("Protocol parity check failed:");
  errors.forEach((entry, index) => {
    console.error(`${index + 1}. ${entry}`);
  });
  process.exit(1);
}

console.log("protocol-parity-check: ok");
console.log(`clientEvents=${schemaClientEvents.length} serverEvents=${schemaServerEvents.length} snapshotFields=${schemaSnapshotRequired.length}`);
