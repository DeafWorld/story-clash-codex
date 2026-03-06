export const PROTOCOL_VERSION = "1.0.0" as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export const SNAPSHOT_VERSION = 1 as const;
export type SnapshotVersion = typeof SNAPSHOT_VERSION;

export type ClientType = "web" | "unity";

export const CAPABILITY_FLAGS = [
  "gm_mode_v1",
  "reconnect_snapshot_v1",
  "vote_lock_deterministic_v1",
  "freeform_v1",
] as const;

export type CapabilityFlag = (typeof CAPABILITY_FLAGS)[number];

export const SERVER_CAPABILITIES: CapabilityFlag[] = [...CAPABILITY_FLAGS];

export type ClientHelloPayload = {
  clientType: ClientType;
  protocolVersion: string;
  buildId: string;
};

export type ServerHelloPayload = {
  accepted: boolean;
  protocolVersion: ProtocolVersion;
  capabilities: CapabilityFlag[];
  snapshotVersion: SnapshotVersion;
  serverTimeMs: number;
  buildId: string;
  reason?: string;
};

export function isSupportedProtocolVersion(value: string): value is ProtocolVersion {
  return value === PROTOCOL_VERSION;
}
