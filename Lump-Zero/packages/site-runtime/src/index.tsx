import React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsProvider, buildEvent, createAnalyticsAdapter, createNoopAnalyticsAdapter } from "@factory/analytics";
import type { PageManifest, RouteManifest, SiteContent } from "@factory/niche-config";
import { buildSeoTags, escapeHtml } from "@factory/seo";
import { toolComponentRegistry } from "@factory/tool-widgets";
import { ContentColumn, FooterBand, PageShell } from "@factory/ui";

export interface ClientAssets {
  scriptHref: string;
  styleHrefs: string[];
}

function renderToolIsland(siteContent: SiteContent, page: PageManifest) {
  if (page.type !== "tool") {
    return null;
  }

  const ToolComponent = toolComponentRegistry[siteContent.tool.component];
  return (
    <div className="tool-card">
      <div data-tool-root={siteContent.tool.id}>
        <AnalyticsProvider adapter={createNoopAnalyticsAdapter()}>
          <ToolComponent
            siteId={siteContent.brief.id}
            pageId={page.id}
            defaultValues={siteContent.tool.default_values}
            resourceHref={siteContent.resourceDownloadHref ? `/resources/${siteContent.brief.content_plan.resource.slug}/` : undefined}
          />
        </AnalyticsProvider>
      </div>
    </div>
  );
}

function renderFallbackSidebar(siteContent: SiteContent, page: PageManifest) {
  return (
    <aside className="tool-card">
      <p className="eyebrow">Primary next action</p>
      <h2 className="section-title" style={{ marginTop: "0.45rem" }}>
        Keep the workflow moving
      </h2>
      <p className="section-copy">Every page routes back to the main tool or the resource pack so visitors can move from question to action without hunting through the site.</p>
      {page.cta ? (
        <a className="button button-primary" href={page.cta.href}>
          {page.cta.label}
        </a>
      ) : null}
      <a className="button button-secondary" href={`/resources/${siteContent.brief.content_plan.resource.slug}/`}>
        {siteContent.brief.site_config.resource_label}
      </a>
    </aside>
  );
}

export function renderRouteHtml(siteContent: SiteContent, route: RouteManifest, assets: ClientAssets): string {
  const page = siteContent.pages.find((item) => item.id === route.pageId);
  if (!page) {
    throw new Error(`Unknown page for route ${route.path}`);
  }

  const seo = buildSeoTags(siteContent.brief, page);
  const appMarkup = renderToStaticMarkup(
    <PageShell brief={siteContent.brief} navigation={siteContent.navigation} page={page} theme={siteContent.runtime.theme}>
      <div className="page-grid">
        <ContentColumn page={page} />
        {route.layout === "tool" ? renderToolIsland(siteContent, page) : renderFallbackSidebar(siteContent, page)}
      </div>
      <FooterBand
        notes={[
          `Guidance is independent planning support for ${siteContent.brief.target_user.toLowerCase()}, not platform endorsement or regulated advice.`,
          "The primary tool runs entirely in the browser so visitors can use it without accounts, uploads, or a backend.",
          ...siteContent.brief.risk_notes.slice(0, 1)
        ]}
      />
    </PageShell>
  );

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(seo.title)}</title>`,
    `  <meta name="description" content="${escapeHtml(seo.description)}" />`,
    `  <link rel="canonical" href="${escapeHtml(seo.canonicalPath)}" />`,
    `  <meta name="keywords" content="${escapeHtml(seo.keywords.join(", "))}" />`,
    ...assets.styleHrefs.map((href) => `  <link rel="stylesheet" href="${escapeHtml(href)}" />`),
    "</head>",
    `<body data-site-id="${escapeHtml(siteContent.brief.id)}" data-page-id="${escapeHtml(page.id)}">`,
    `  ${appMarkup}`,
    `  <script type="module" src="${escapeHtml(assets.scriptHref)}"></script>`,
    "</body>",
    "</html>"
  ].join("\n");
}

export function bootstrapSiteClient(siteContent: SiteContent) {
  const adapter = createAnalyticsAdapter(siteContent.runtime.analytics);
  const pageId = document.body.dataset.pageId;
  const siteId = document.body.dataset.siteId;

  if (pageId && siteId) {
    adapter.track(
      buildEvent({
        type: "page_view",
        siteId,
        pageId
      })
    );
  }

  const toolRoot = document.querySelector<HTMLElement>(`[data-tool-root='${siteContent.tool.id}']`);
  if (!toolRoot) {
    return;
  }

  const ToolComponent = toolComponentRegistry[siteContent.tool.component];
  hydrateRoot(
    toolRoot,
    <AnalyticsProvider adapter={adapter}>
      <ToolComponent
        siteId={siteContent.brief.id}
        pageId={pageId ?? `${siteContent.brief.id}-tool`}
        defaultValues={siteContent.tool.default_values}
        resourceHref={`/resources/${siteContent.brief.content_plan.resource.slug}/`}
      />
    </AnalyticsProvider>
  );
}
