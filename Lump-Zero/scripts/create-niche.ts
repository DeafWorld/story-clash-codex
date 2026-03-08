import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadBrief } from "@factory/niche-config";
import { parseBriefArg } from "./lib/factory.ts";
import { getRootDir } from "./lib/site-registry.ts";

async function main() {
  const briefPath = parseBriefArg(process.argv.slice(2));
  if (!briefPath) {
    throw new Error("Pass --brief <path-to-yaml>");
  }

  const resolvedBriefPath = path.isAbsolute(briefPath) ? briefPath : path.join(getRootDir(), briefPath);
  const brief = await loadBrief(resolvedBriefPath);
  const appDir = path.join(getRootDir(), "apps", `site-${brief.slug}`);

  await mkdir(path.join(appDir, "src"), { recursive: true });
  await mkdir(path.join(appDir, "content", "generated"), { recursive: true });
  await mkdir(path.join(appDir, "public", "downloads"), { recursive: true });

  const manifestPath = path.join(getRootDir(), "data", "sites.json");
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(rawManifest) as Array<Record<string, unknown>>;
  if (!manifest.some((record) => record.slug === brief.slug)) {
    manifest.push({
      slug: brief.slug,
      app_dir: `apps/site-${brief.slug}`,
      package_name: `@factory/site-${brief.slug}`,
      brief_path: path.relative(getRootDir(), resolvedBriefPath),
      cloudflare: {
        project_name: `lump-zero-${brief.slug}`,
        production_branch: "main",
        analytics_provider: "cloudflare"
      }
    });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  console.log(`Scaffolded ${appDir} and updated data/sites.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
