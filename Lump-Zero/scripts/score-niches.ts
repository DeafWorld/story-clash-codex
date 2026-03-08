import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Scorecard, SiteContent } from "@factory/niche-config";
import { getRootDir, listSiteRecords } from "./lib/site-registry.ts";
import { scoreSite } from "./lib/factory.ts";

function renderDashboard(scorecards: Array<Scorecard & { siteTitle: string; localHref: string; lastBuildAt: string }>) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>Lump Zero Operator View</title>",
    "  <style>",
    "    body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#f4efe8;color:#1f2630;padding:2rem;}",
    "    .grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}",
    "    .card{background:white;border-radius:1rem;padding:1.25rem;box-shadow:0 16px 40px rgba(0,0,0,.08);}",
    "    .pill{display:inline-block;padding:.3rem .6rem;border-radius:999px;background:#e8f4f5;color:#074d54;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;}",
    "    a{color:#0e7c86;text-decoration:none;font-weight:600;}",
    "    table{width:100%;border-collapse:collapse;margin-top:1rem;background:white;border-radius:1rem;overflow:hidden;}",
    "    th,td{text-align:left;padding:.9rem;border-bottom:1px solid #ece6de;}",
    "  </style>",
    "</head>",
    "<body>",
    "  <h1>Lump Zero Operator View</h1>",
    "  <p>Current factory status for local static builds.</p>",
    "  <div class='grid'>",
    ...scorecards.map(
      (scorecard) =>
        `    <section class='card'><span class='pill'>${scorecard.recommendation}</span><h2>${scorecard.siteTitle}</h2><p>Last build: ${scorecard.lastBuildAt}</p><p>Niche clarity: ${scorecard.nicheClarity}/10<br/>Tool usefulness: ${scorecard.toolUsefulness}/10<br/>Static feasibility: ${scorecard.staticFeasibility}/10</p><p><a href='${scorecard.localHref}'>Open local site build</a></p></section>`
    ),
    "  </div>",
    "  <table><thead><tr><th>Site</th><th>Recommendation</th><th>Content depth</th><th>Conversion</th><th>Maintenance</th></tr></thead><tbody>",
    ...scorecards.map(
      (scorecard) =>
        `    <tr><td>${scorecard.siteTitle}</td><td>${scorecard.recommendation}</td><td>${scorecard.contentDepth}</td><td>${scorecard.conversionPotential}</td><td>${scorecard.maintenanceBurden}</td></tr>`
    ),
    "  </tbody></table>",
    "</body>",
    "</html>"
  ].join("\n");
}

async function main() {
  const sites = await listSiteRecords();
  const scorecards: Array<Scorecard & { siteTitle: string; localHref: string; lastBuildAt: string }> = [];

  for (const site of sites) {
    const raw = await readFile(site.generatedContentPath, "utf8");
    const siteContent = JSON.parse(raw) as SiteContent;
    scorecards.push({
      ...scoreSite(siteContent),
      siteTitle: siteContent.brief.name,
      localHref: `../../${path.relative(path.join(getRootDir(), "data", "outputs"), path.join(site.distDir, "index.html"))}`,
      lastBuildAt: siteContent.runtime.lastBuildAt
    });
  }

  const outputDir = path.join(getRootDir(), "data", "outputs");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "scoreboard.json"), JSON.stringify(scorecards, null, 2));
  await writeFile(path.join(outputDir, "operator-view.html"), renderDashboard(scorecards));
  console.table(scorecards.map(({ siteId, recommendation, nicheClarity, toolUsefulness, staticFeasibility }) => ({ siteId, recommendation, nicheClarity, toolUsefulness, staticFeasibility })));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
