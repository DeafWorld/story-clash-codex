import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import type { ClientAssets } from "@factory/site-runtime";
import type { Scorecard, SiteContent, SiteRuntimeMeta } from "@factory/niche-config";
import { loadBrief } from "@factory/niche-config";
import { buildSiteContent } from "@factory/content-engine";
import { runQualityChecks } from "@factory/quality-checks";
import { getRootDir, getSiteRecord, listSiteRecords, type SiteRecord } from "./site-registry.ts";

export function parseSiteArg(args: string[]): string {
  const siteFlag = args.find((arg) => arg.startsWith("--site="));
  if (siteFlag) {
    return siteFlag.split("=")[1] ?? "";
  }

  const siteIndex = args.indexOf("--site");
  if (siteIndex >= 0) {
    return args[siteIndex + 1] ?? "";
  }

  return "etsy-image-helper";
}

export function parseBriefArg(args: string[]): string {
  const briefFlag = args.find((arg) => arg.startsWith("--brief="));
  if (briefFlag) {
    return briefFlag.split("=")[1] ?? "";
  }

  const briefIndex = args.indexOf("--brief");
  return briefIndex >= 0 ? args[briefIndex + 1] ?? "" : "";
}

export function hasAllFlag(args: string[]): boolean {
  return args.includes("--all");
}

export async function resolveRequestedSites(args: string[]): Promise<SiteRecord[]> {
  if (hasAllFlag(args)) {
    return listSiteRecords();
  }

  return [await getSiteRecord(parseSiteArg(args))];
}

function buildRuntimeMeta(site: SiteRecord): SiteRuntimeMeta {
  return {
    analytics: site.analytics,
    lastBuildAt: new Date().toISOString(),
    cloudflareProjectName: site.cloudflareProjectName
  };
}

export async function generateSiteContent(site: SiteRecord): Promise<SiteContent> {
  const brief = await loadBrief(site.briefPath);
  const siteContent = await buildSiteContent(brief, {
    ...buildRuntimeMeta(site),
    theme: brief.site_config.theme
  });
  await mkdir(path.dirname(site.generatedContentPath), { recursive: true });
  await writeFile(site.generatedContentPath, JSON.stringify(siteContent, null, 2));
  return siteContent;
}

async function loadClientAssets(site: SiteRecord): Promise<ClientAssets> {
  const manifestPath = path.join(site.clientDir, ".vite", "manifest.json");
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(rawManifest) as Record<string, { file: string; css?: string[] }>;
  const entry = Object.values(manifest).find((item) => item.file.endsWith(".js"));

  if (!entry) {
    throw new Error(`Unable to resolve Vite entry for ${site.slug}`);
  }

  return {
    scriptHref: `/${entry.file}`,
    styleHrefs: (entry.css ?? []).map((item) => `/${item}`)
  };
}

export async function buildStaticSite(site: SiteRecord): Promise<SiteContent> {
  await generateSiteContent(site);

  await rm(site.clientDir, { recursive: true, force: true });
  await rm(site.distDir, { recursive: true, force: true });

  await viteBuild({
    configFile: site.viteConfigPath,
    mode: "production"
  });

  const assets = await loadClientAssets(site);
  const moduleUrl = pathToFileURL(path.join(site.appDir, "src", "site-definition.tsx")).href;
  const module = (await import(moduleUrl)) as {
    renderRouteHtml: (route: SiteContent["routes"][number], clientAssets: ClientAssets) => string;
    siteContent: SiteContent;
  };

  await mkdir(site.distDir, { recursive: true });
  for (const route of module.siteContent.routes) {
    const html = module.renderRouteHtml(route, assets);
    const outputPath = path.join(site.distDir, route.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html);
  }

  const assetsOutputDir = path.join(site.distDir, "assets");
  await mkdir(assetsOutputDir, { recursive: true });
  await cp(path.join(site.clientDir, "assets"), assetsOutputDir, { recursive: true });
  await cp(path.join(site.appDir, "public"), site.distDir, { recursive: true });
  return module.siteContent;
}

export async function checkSite(site: SiteRecord): Promise<{ siteContent: SiteContent; issues: Awaited<ReturnType<typeof runQualityChecks>> }> {
  const raw = await readFile(site.generatedContentPath, "utf8");
  const siteContent = JSON.parse(raw) as SiteContent;
  const issues = await runQualityChecks(siteContent, site.distDir);
  return { siteContent, issues };
}

export function scoreSite(siteContent: SiteContent): Scorecard {
  const faqCount = siteContent.pages.filter((page) => page.type === "faq").length;
  const guideCount = siteContent.pages.filter((page) => page.type === "guide").length;
  const comparisonCount = siteContent.pages.filter((page) => page.type === "comparison").length;
  const supportingContent = faqCount + guideCount + comparisonCount;
  const calculatorBonus = siteContent.tool.component === "cleaning-pricing-estimator" ? 1 : 0;

  const scorecard: Scorecard = {
    siteId: siteContent.brief.id,
    nicheClarity: 8 + calculatorBonus,
    problemUrgency: siteContent.brief.slug === "cleaning-pricing" ? 8 : 7,
    toolUsefulness: 8 + calculatorBonus,
    contentDepth: Math.min(10, 4 + supportingContent / 2),
    conversionPotential: 6 + calculatorBonus,
    expansionPotential: 8,
    maintenanceBurden: 3,
    staticFeasibility: 10,
    recommendation: "launch",
    rationale: [
      `Support content covers ${supportingContent} intent pages.`,
      `Primary tool component: ${siteContent.tool.component}.`,
      "No backend or account system is required for the first launch phase."
    ]
  };

  if (scorecard.contentDepth < 7 || scorecard.toolUsefulness < 7) {
    scorecard.recommendation = "revise";
  }

  return scorecard;
}

export async function archiveSite(site: SiteRecord): Promise<string> {
  const archiveDir = path.join(getRootDir(), "archive", `${site.slug}-${new Date().toISOString().slice(0, 10)}`);
  await mkdir(path.dirname(archiveDir), { recursive: true });
  await rename(site.appDir, archiveDir);
  return archiveDir;
}
