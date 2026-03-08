import type { NicheBrief, PageManifest } from "@factory/niche-config";

export interface SeoTags {
  title: string;
  description: string;
  canonicalPath: string;
  keywords: string[];
}

export function buildSeoTags(brief: NicheBrief, page: PageManifest): SeoTags {
  const keywords = [...brief.primary_intent, ...brief.secondary_intent].slice(0, 6);

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    canonicalPath: page.href,
    keywords
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
