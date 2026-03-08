import { archiveSite, resolveRequestedSites } from "./lib/factory.ts";

async function main() {
  const sites = await resolveRequestedSites(process.argv.slice(2));
  for (const site of sites) {
    const archivePath = await archiveSite(site);
    console.log(`Archived ${site.slug} to ${archivePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
