import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

const faqTopicSchema = z.object({
  slug: z.string().min(1),
  question: z.string().min(1),
  short_answer: z.string().min(1),
  reason: z.string().min(1),
  next_step: z.string().min(1)
});

const guideTopicSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  lede: z.string().min(1),
  takeaway: z.string().min(1),
  detail: z.string().min(1),
  next_action: z.string().min(1)
});

const comparisonTopicSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  lede: z.string().min(1),
  option_one: z.string().min(1),
  option_one_body: z.string().min(1),
  option_two: z.string().min(1),
  option_two_body: z.string().min(1),
  decision_shortcut: z.string().min(1)
});

const resourceTopicSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  lede: z.string().min(1),
  resource_contents: z.string().min(1),
  usage_steps: z.string().min(1),
  next_action: z.string().min(1)
});

const navigationLabelsSchema = z.object({
  home: z.string().min(1),
  tool: z.string().min(1),
  guides: z.string().min(1),
  resource: z.string().min(1),
  feedback: z.string().min(1)
});

const ctaLabelsSchema = z.object({
  primary: z.string().min(1),
  resource: z.string().min(1)
});

const homepageSchema = z.object({
  hero_kicker: z.string().min(1),
  hero_title: z.string().min(1),
  hero_intro: z.string().min(1),
  lede: z.string().min(1),
  value_intro: z.string().min(1),
  value_points: z.array(z.string().min(1)).min(3).max(5),
  next_step: z.string().min(1),
  workflow_steps: z.array(z.string().min(1)).min(3).max(5),
  who_for_title: z.string().min(1),
  who_for_body: z.string().min(1),
  tool_preview_title: z.string().min(1),
  tool_preview_body: z.string().min(1),
  faq_preview_title: z.string().min(1),
  faq_preview_intro: z.string().min(1),
  comparison_preview_title: z.string().min(1),
  comparison_preview_intro: z.string().min(1),
  resource_preview_title: z.string().min(1),
  resource_preview_intro: z.string().min(1)
});

const toolPageSchema = z.object({
  hero_kicker: z.string().min(1),
  title: z.string().min(1),
  intro: z.string().min(1),
  inputs_intro: z.string().min(1),
  input_labels: z.array(z.string().min(1)).min(3),
  result_intro: z.string().min(1),
  result_detail: z.string().min(1),
  trust_title: z.string().min(1),
  trust_paragraphs: z.array(z.string().min(1)).min(2),
  trust_callout: z.string().min(1),
  next_steps: z.array(z.string().min(1)).min(2).max(4)
});

const aboutPageSchema = z.object({
  title: z.string().min(1),
  lede: z.string().min(1),
  takeaway: z.string().min(1),
  detail: z.string().min(1),
  next_action: z.string().min(1)
});

const feedbackPageSchema = z.object({
  hero_kicker: z.string().min(1),
  title: z.string().min(1),
  intro: z.string().min(1),
  prompts_title: z.string().min(1),
  prompts: z.array(z.string().min(1)).min(3).max(5),
  callout: z.string().min(1)
});

const themeSchema = z
  .object({
    accent: z.string().optional(),
    accent_strong: z.string().optional(),
    accent_warm: z.string().optional(),
    accent_rose: z.string().optional(),
    text: z.string().optional(),
    muted: z.string().optional(),
    background_start: z.string().optional(),
    background_mid: z.string().optional(),
    background_end: z.string().optional(),
    glow_one: z.string().optional(),
    glow_two: z.string().optional()
  })
  .optional();

const toolComponentSchema = z.enum(["etsy-image-helper", "cleaning-pricing-estimator"]);

const toolConfigSchema = z.object({
  component: toolComponentSchema,
  default_values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
});

const siteConfigSchema = z.object({
  navigation_labels: navigationLabelsSchema,
  cta_labels: ctaLabelsSchema,
  resource_label: z.string().min(1),
  homepage: homepageSchema,
  tool_page: toolPageSchema,
  about_page: aboutPageSchema,
  feedback_page: feedbackPageSchema,
  tool: toolConfigSchema,
  theme: themeSchema
});

export const nicheBriefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  target_user: z.string().min(1),
  core_problem: z.string().min(1),
  primary_intent: z.array(z.string().min(1)).min(1),
  secondary_intent: z.array(z.string().min(1)).min(1),
  tool_type: z.string().min(1),
  tool_output: z.string().min(1),
  content_clusters: z.array(z.string().min(1)).min(1),
  monetization_path: z.array(z.string().min(1)).min(1),
  expansion_paths: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).min(1),
  success_signals: z.array(z.string().min(1)).min(1),
  risk_notes: z.array(z.string().min(1)).min(1),
  site_config: siteConfigSchema,
  content_plan: z.object({
    faq_topics: z.array(faqTopicSchema).min(5),
    guides: z.array(guideTopicSchema).min(5),
    comparisons: z.array(comparisonTopicSchema).min(2),
    resource: resourceTopicSchema
  })
});

export type NicheBrief = z.infer<typeof nicheBriefSchema>;
export type ToolComponentKey = z.infer<typeof toolComponentSchema>;

export interface LinkCard {
  href: string;
  label: string;
  description: string;
  eyebrow?: string;
}

export interface PageCta {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface ContentSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: string;
  links?: LinkCard[];
}

export type PageType = "home" | "tool" | "about" | "resource" | "feedback" | "faq" | "guide" | "comparison";

export interface PageManifest {
  id: string;
  type: PageType;
  slug: string;
  href: string;
  navLabel?: string;
  title: string;
  description: string;
  heroKicker: string;
  heroTitle: string;
  heroIntro: string;
  metaTitle: string;
  metaDescription: string;
  sections: ContentSection[];
  cta?: PageCta;
  relatedLinks: LinkCard[];
  toolMountId?: string;
}

export interface RouteManifest {
  path: string;
  outputPath: string;
  pageId: string;
  layout: "default" | "tool";
}

export interface ToolFieldDefinition {
  id: string;
  label: string;
  inputType: "select" | "number" | "radio" | "checkbox";
  helpText?: string;
  required?: boolean;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  component: ToolComponentKey;
  default_values: Record<string, string | number | boolean>;
  fields: ToolFieldDefinition[];
}

export interface ToolMetric {
  label: string;
  value: string;
}

export interface ToolResult {
  headline: string;
  summary: string;
  metrics: ToolMetric[];
  guidance: string[];
  warnings?: string[];
}

export type AnalyticsEventType =
  | "page_view"
  | "tool_used"
  | "summary_copied"
  | "tool_printed"
  | "resource_download_clicked"
  | "feedback_clicked";

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  siteId: string;
  pageId?: string;
  detail?: string;
  timestamp: string;
}

export interface CloudflareAnalyticsConfig {
  provider: "cloudflare";
  webAnalyticsMode: "pages" | "manual";
  webAnalyticsToken?: string;
  customEventEndpoint?: string;
}

export interface NoopAnalyticsConfig {
  provider: "noop";
}

export type AnalyticsRuntimeConfig = CloudflareAnalyticsConfig | NoopAnalyticsConfig;

export interface Scorecard {
  siteId: string;
  nicheClarity: number;
  problemUrgency: number;
  toolUsefulness: number;
  contentDepth: number;
  conversionPotential: number;
  expansionPotential: number;
  maintenanceBurden: number;
  staticFeasibility: number;
  recommendation: "launch" | "revise" | "archive" | "kill";
  rationale: string[];
}

export interface SiteRuntimeMeta {
  analytics: AnalyticsRuntimeConfig;
  theme?: NicheBrief["site_config"]["theme"];
  lastBuildAt: string;
  cloudflareProjectName?: string;
}

export interface SiteContent {
  brief: NicheBrief;
  navigation: LinkCard[];
  pages: PageManifest[];
  routes: RouteManifest[];
  tool: ToolDefinition;
  resourceDownloadHref?: string;
  runtime: SiteRuntimeMeta;
}

export async function loadBrief(briefPath: string): Promise<NicheBrief> {
  const raw = await readFile(briefPath, "utf8");
  const parsed = YAML.parse(raw);
  return nicheBriefSchema.parse(parsed);
}

export function siteSlugFromBriefPath(briefPath: string): string {
  return path.basename(briefPath, path.extname(briefPath));
}
