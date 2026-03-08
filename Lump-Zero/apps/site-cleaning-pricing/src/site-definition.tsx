import type { RouteManifest, SiteContent } from "@factory/niche-config";
import { renderRouteHtml as renderSiteRouteHtml } from "@factory/site-runtime";
import type { ClientAssets } from "@factory/site-runtime";
import generatedSiteContent from "../content/generated/site-content.json";

export const siteContent = generatedSiteContent as SiteContent;

export function renderRouteHtml(route: RouteManifest, assets: ClientAssets) {
  return renderSiteRouteHtml(siteContent, route, assets);
}
