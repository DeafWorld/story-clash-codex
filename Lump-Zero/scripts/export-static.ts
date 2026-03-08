import { buildStaticSite, resolveRequestedSites } from "./lib/factory.ts";

async function main() {
  const sites = await resolveRequestedSites(process.argv.slice(2));
  for (const site of sites) {
    await buildStaticSite(site);
    console.log(`Static export is available at ${site.distDir}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
