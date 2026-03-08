import { buildStaticSite, resolveRequestedSites } from "./lib/factory.ts";

async function main() {
  const sites = await resolveRequestedSites(process.argv.slice(2));
  for (const site of sites) {
    const siteContent = await buildStaticSite(site);
    console.log(`Built ${siteContent.routes.length} prerendered routes for ${site.slug}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
