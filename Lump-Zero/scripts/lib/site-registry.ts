import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AnalyticsRuntimeConfig } from "@factory/niche-config";

const rootDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const siteRecordSchema = z.object({
  slug: z.string().min(1),
  app_dir: z.string().min(1),
  package_name: z.string().min(1),
  brief_path: z.string().min(1),
  cloudflare: z.object({
    project_name: z.string().min(1),
    production_branch: z.string().min(1),
    analytics_provider: z.enum(["cloudflare", "noop"]),
    manual_token_env: z.string().optional(),
    custom_event_endpoint_env: z.string().optional()
  })
});

const siteManifestSchema = z.array(siteRecordSchema);

type SiteManifestRecord = z.infer<typeof siteRecordSchema>;

export interface SiteRecord {
  slug: string;
  appDir: string;
  packageName: string;
  briefPath: string;
  generatedContentPath: string;
  distDir: string;
  clientDir: string;
  viteConfigPath: string;
  cloudflareProjectName: string;
  productionBranch: string;
  analytics: AnalyticsRuntimeConfig;
  manualTokenEnv?: string;
  customEventEndpointEnv?: string;
}

function toAbsolute(relativePath: string) {
  return path.join(rootDir, relativePath);
}

function resolveAnalytics(manifest: SiteManifestRecord): AnalyticsRuntimeConfig {
  if (manifest.cloudflare.analytics_provider === "noop") {
    return { provider: "noop" };
  }

  const manualToken = manifest.cloudflare.manual_token_env ? process.env[manifest.cloudflare.manual_token_env] : undefined;
  const customEventEndpoint = manifest.cloudflare.custom_event_endpoint_env ? process.env[manifest.cloudflare.custom_event_endpoint_env] : undefined;

  return {
    provider: "cloudflare",
    webAnalyticsMode: manualToken ? "manual" : "pages",
    webAnalyticsToken: manualToken,
    customEventEndpoint
  };
}

function hydrateSiteRecord(manifest: SiteManifestRecord): SiteRecord {
  const appDir = toAbsolute(manifest.app_dir);
  return {
    slug: manifest.slug,
    appDir,
    packageName: manifest.package_name,
    briefPath: toAbsolute(manifest.brief_path),
    generatedContentPath: path.join(appDir, "content", "generated", "site-content.json"),
    distDir: path.join(appDir, "dist"),
    clientDir: path.join(appDir, "dist-client"),
    viteConfigPath: path.join(appDir, "vite.config.ts"),
    cloudflareProjectName: manifest.cloudflare.project_name,
    productionBranch: manifest.cloudflare.production_branch,
    analytics: resolveAnalytics(manifest),
    manualTokenEnv: manifest.cloudflare.manual_token_env,
    customEventEndpointEnv: manifest.cloudflare.custom_event_endpoint_env
  };
}

async function loadManifest(): Promise<SiteRecord[]> {
  const raw = await readFile(path.join(rootDir, "data", "sites.json"), "utf8");
  const parsed = siteManifestSchema.parse(JSON.parse(raw));
  return parsed.map(hydrateSiteRecord);
}

export function getRootDir() {
  return rootDir;
}

export async function getSiteRecord(slug: string): Promise<SiteRecord> {
  const sites = await loadManifest();
  const site = sites.find((item) => item.slug === slug);
  if (!site) {
    throw new Error(`Unknown site slug: ${slug}`);
  }
  return site;
}

export async function listSiteRecords(): Promise<SiteRecord[]> {
  return loadManifest();
}
