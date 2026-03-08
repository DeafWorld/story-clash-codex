import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import { loadBrief } from "@factory/niche-config";
import { buildStaticSite, hasAllFlag, parseSiteArg } from "./lib/factory.ts";
import { getSiteRecord, listSiteRecords } from "./lib/site-registry.ts";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const rootDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function parseMobileFlag(args) {
  return args.includes("--mobile");
}

async function resolveSites(args) {
  if (!args.length || hasAllFlag(args)) {
    return listSiteRecords();
  }

  return [await getSiteRecord(parseSiteArg(args))];
}

async function ensureStaticOutput(site) {
  try {
    await access(path.join(site.distDir, "index.html"));
  } catch {
    await buildStaticSite(site);
  }
}

async function startStaticServer(rootPath) {
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const normalized = decodeURIComponent(requestPath).replace(/^\/+/, "");
      const candidatePaths = normalized
        ? [normalized, path.join(normalized, "index.html"), `${normalized}.html`]
        : ["index.html"];

      let filePath = null;
      for (const candidate of candidatePaths) {
        const resolved = path.resolve(rootPath, candidate);
        if (!resolved.startsWith(path.resolve(rootPath))) {
          continue;
        }

        try {
          await access(resolved);
          filePath = resolved;
          break;
        } catch {
          // Continue to the next candidate path.
        }
      }

      if (!filePath) {
        response.statusCode = 404;
        response.end("Not Found");
        return;
      }

      const body = await readFile(filePath);
      response.setHeader("Content-Type", MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream");
      response.end(body);
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "Unexpected server error.");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve smoke server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function verifyChromiumInstalled() {
  try {
    await access(chromium.executablePath());
  } catch {
    throw new Error(`Playwright Chromium is not installed. Run \`npx playwright install chromium\` from ${rootDir}.`);
  }
}

async function runStep(siteSlug, stepName, fn) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[${siteSlug}] ${stepName} failed: ${message}`);
  }
}

async function assertVisible(page, text) {
  await page.getByText(text, { exact: true }).waitFor();
}

async function clickPrimaryCta(page, brief) {
  await page.getByRole("link", { name: brief.site_config.cta_labels.primary }).click();
  await page.waitForURL("**/tool/");
}

async function runEtsyFlow(page, siteSlug) {
  await runStep(siteSlug, "select Etsy banner preset", async () => {
    await page.getByLabel("Surface preset").selectOption("big-banner");
  });
  await runStep(siteSlug, "fill Etsy dimensions", async () => {
    await page.getByLabel("Source width (px)").fill("2200");
    await page.getByLabel("Source height (px)").fill("500");
  });
  await runStep(siteSlug, "verify Etsy result", async () => {
    await page.getByText("1600 x 400px").waitFor();
  });
  await runStep(siteSlug, "copy Etsy summary", async () => {
    await page.getByRole("button", { name: "Copy summary" }).click();
    await page.getByRole("button", { name: "Summary copied" }).waitFor();
  });
  await runStep(siteSlug, "verify Etsy checklist link", async () => {
    await page.getByRole("link", { name: "Open checklist" }).waitFor();
  });
}

async function runCleaningFlow(page, siteSlug) {
  await runStep(siteSlug, "enter invalid cleaning square footage", async () => {
    await page.getByLabel("Square footage").fill("0");
    await page.getByText("Use a square footage greater than zero and room counts that are zero or higher.").waitFor();
  });
  await runStep(siteSlug, "enter valid cleaning square footage", async () => {
    await page.getByLabel("Square footage").fill("1800");
    await page.getByText("Working price range").waitFor();
  });
  await runStep(siteSlug, "copy cleaning estimate", async () => {
    await page.getByRole("button", { name: "Copy estimate" }).click();
    await page.getByRole("button", { name: "Estimate copied" }).waitFor();
  });
  await runStep(siteSlug, "verify cleaning checklist link", async () => {
    await page.getByRole("link", { name: "Open checklist" }).waitFor();
  });
}

const toolFlowRegistry = {
  "etsy-image-helper": runEtsyFlow,
  "cleaning-pricing-estimator": runCleaningFlow
};

async function newContext(isMobile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(isMobile ? devices["iPhone 13"] : {});

  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          window.__lumpZeroClipboard = value;
        }
      }
    });

    Object.defineProperty(window, "print", {
      configurable: true,
      value() {
        window.__lumpZeroPrinted = true;
      }
    });
  });

  return { browser, context };
}

async function smokeDesktopSite(site, brief, baseUrl) {
  const { browser, context } = await newContext(false);
  const page = await context.newPage();

  try {
    await runStep(site.slug, "load homepage", async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await assertVisible(page, brief.site_config.homepage.hero_title);
    });
    await runStep(site.slug, "click homepage CTA", async () => {
      await clickPrimaryCta(page, brief);
    });
    await toolFlowRegistry[brief.site_config.tool.component](page, site.slug);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function smokeMobileSite(site, brief, baseUrl) {
  const { browser, context } = await newContext(true);
  const page = await context.newPage();

  try {
    await runStep(site.slug, "load mobile homepage", async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await assertVisible(page, brief.site_config.homepage.hero_title);
    });
    await runStep(site.slug, "verify mobile CTA", async () => {
      await page.getByRole("link", { name: brief.site_config.cta_labels.primary }).waitFor();
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const includeMobile = parseMobileFlag(args);
  const sites = await resolveSites(args);

  await verifyChromiumInstalled();

  for (const site of sites) {
    await ensureStaticOutput(site);
    const brief = await loadBrief(site.briefPath);
    const server = await startStaticServer(site.distDir);

    try {
      await smokeDesktopSite(site, brief, server.baseUrl);
      if (includeMobile) {
        await smokeMobileSite(site, brief, server.baseUrl);
      }
      console.log(`[${site.slug}] Smoke passed${includeMobile ? " (desktop + mobile)" : " (desktop)"}.`);
    } finally {
      await server.close();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
