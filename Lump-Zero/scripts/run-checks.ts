import { checkSite, resolveRequestedSites } from "./lib/factory.ts";

async function main() {
  const sites = await resolveRequestedSites(process.argv.slice(2));
  let hasErrors = false;

  for (const site of sites) {
    const { issues } = await checkSite(site);
    if (!issues.length) {
      console.log(`No issues found for ${site.slug}`);
      continue;
    }

    for (const issue of issues) {
      console.log(`[${site.slug}] [${issue.level}] ${issue.message}`);
    }

    if (issues.some((issue) => issue.level === "error")) {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
