import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PageManifest, RouteManifest, SiteContent } from "@factory/niche-config";

export interface QualityIssue {
  level: "error" | "warning";
  message: string;
}

function collectInternalLinksFromPage(page: PageManifest): string[] {
  const sectionLinks = page.sections.flatMap((section) => section.links?.map((link) => link.href) ?? []);
  const relatedLinks = page.relatedLinks.map((link) => link.href);
  const ctaLinks = page.cta ? [page.cta.href] : [];
  return [...sectionLinks, ...relatedLinks, ...ctaLinks].filter((href) => href.startsWith("/"));
}

export function findDuplicateMetadata(pages: PageManifest[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();

  for (const page of pages) {
    const titleOwner = titles.get(page.metaTitle);
    if (titleOwner) {
      issues.push({ level: "error", message: `Duplicate meta title between ${titleOwner} and ${page.href}` });
    } else {
      titles.set(page.metaTitle, page.href);
    }

    const descriptionOwner = descriptions.get(page.metaDescription);
    if (descriptionOwner) {
      issues.push({ level: "error", message: `Duplicate meta description between ${descriptionOwner} and ${page.href}` });
    } else {
      descriptions.set(page.metaDescription, page.href);
    }
  }

  return issues;
}

export function findPlaceholderCopy(pages: PageManifest[]): QualityIssue[] {
  const placeholders = ["lorem ipsum", "todo", "coming soon", "TBD"];
  const issues: QualityIssue[] = [];

  for (const page of pages) {
    const text = [
      page.title,
      page.description,
      page.heroIntro,
      ...page.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])
    ]
      .join(" ")
      .toLowerCase();

    for (const placeholder of placeholders) {
      if (text.includes(placeholder.toLowerCase())) {
        issues.push({ level: "error", message: `Placeholder copy detected on ${page.href}: ${placeholder}` });
      }
    }
  }

  return issues;
}

export function findBrokenInternalLinks(siteContent: SiteContent): QualityIssue[] {
  const validHrefs = new Set(siteContent.pages.map((page) => page.href));
  if (siteContent.resourceDownloadHref) {
    validHrefs.add(siteContent.resourceDownloadHref);
  }
  const issues: QualityIssue[] = [];

  for (const page of siteContent.pages) {
    for (const href of collectInternalLinksFromPage(page)) {
      if (!validHrefs.has(href)) {
        issues.push({ level: "error", message: `Broken internal link on ${page.href}: ${href}` });
      }
    }
  }

  return issues;
}

export function findThinPages(pages: PageManifest[]): QualityIssue[] {
  return pages
    .filter((page) => {
      const visibleContent = page.sections
        .flatMap((section) => [
          ...section.paragraphs,
          ...(section.bullets ?? []),
          ...(section.links?.flatMap((link) => [link.label, link.description]) ?? [])
        ])
        .join(" ");

      return page.sections.length < 1 || visibleContent.length < 180;
    })
    .map((page) => ({ level: "warning" as const, message: `Thin page content on ${page.href}` }));
}

export async function verifyPrerenderOutput(distDir: string, routes: RouteManifest[]): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];

  for (const route of routes) {
    const filePath = path.join(distDir, route.outputPath);
    try {
      const html = await readFile(filePath, "utf8");
      if (!html.includes("<title>")) {
        issues.push({ level: "error", message: `Missing title tag in ${route.outputPath}` });
      }
    } catch {
      issues.push({ level: "error", message: `Missing prerendered file for ${route.path}` });
    }
  }

  return issues;
}

export async function runQualityChecks(siteContent: SiteContent, distDir?: string): Promise<QualityIssue[]> {
  const issues = [
    ...findDuplicateMetadata(siteContent.pages),
    ...findPlaceholderCopy(siteContent.pages),
    ...findBrokenInternalLinks(siteContent),
    ...findThinPages(siteContent.pages)
  ];

  if (distDir) {
    issues.push(...(await verifyPrerenderOutput(distDir, siteContent.routes)));
  }

  return issues;
}
