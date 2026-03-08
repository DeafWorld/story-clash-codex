import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ContentSection, LinkCard, NicheBrief, PageManifest, RouteManifest, SiteContent, ToolDefinition, SiteRuntimeMeta } from "@factory/niche-config";

function rootDir() {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

async function loadTemplate(name: string) {
  return readFile(path.join(rootDir(), "templates", name), "utf8");
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value), template);
}

function parseTemplate(template: string): { title: string; heroIntro: string; sections: ContentSection[] } {
  const lines = template.split(/\r?\n/);
  let title = "";
  const sections: ContentSection[] = [];
  let heroIntro = "";
  let current: ContentSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("# ")) {
      title = line.slice(2);
      continue;
    }

    if (!heroIntro && !line.startsWith("## ")) {
      heroIntro = line;
      continue;
    }

    if (line.startsWith("## ")) {
      current = {
        id: line.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        heading: line.slice(3),
        paragraphs: []
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("- ")) {
      current.bullets = [...(current.bullets ?? []), line.slice(2)];
      continue;
    }

    current.paragraphs.push(line);
  }

  return { title, heroIntro, sections };
}

function dedupeLinks(links: LinkCard[]): LinkCard[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) {
      return false;
    }
    seen.add(link.href);
    return true;
  });
}

function routeForPage(page: PageManifest): RouteManifest {
  return {
    path: page.href,
    outputPath: page.href === "/" ? "index.html" : `${page.href.slice(1)}index.html`,
    pageId: page.id,
    layout: page.type === "tool" ? "tool" : "default"
  };
}

function makePageBase(page: Omit<PageManifest, "relatedLinks">, relatedLinks: LinkCard[]): PageManifest {
  return {
    ...page,
    relatedLinks: dedupeLinks(relatedLinks).filter((link) => link.href !== page.href).slice(0, 4)
  };
}

function buildNavigation(brief: NicheBrief): LinkCard[] {
  return [
    { href: "/", label: brief.site_config.navigation_labels.home, description: `Return to the ${brief.name} homepage.`, eyebrow: "Base" },
    { href: "/tool/", label: brief.site_config.navigation_labels.tool, description: brief.tool_output, eyebrow: "Tool" },
    {
      href: `/guides/${brief.content_plan.guides[0].slug}/`,
      label: brief.site_config.navigation_labels.guides,
      description: brief.content_plan.guides[0].lede,
      eyebrow: "Guides"
    },
    {
      href: `/resources/${brief.content_plan.resource.slug}/`,
      label: brief.site_config.navigation_labels.resource,
      description: brief.content_plan.resource.lede,
      eyebrow: "Resource"
    },
    {
      href: "/feedback/",
      label: brief.site_config.navigation_labels.feedback,
      description: brief.site_config.feedback_page.intro,
      eyebrow: "Feedback"
    }
  ];
}

function buildCoreLinks(brief: NicheBrief): LinkCard[] {
  return [
    { href: "/tool/", label: brief.site_config.cta_labels.primary, description: brief.tool_output, eyebrow: "Primary" },
    {
      href: `/guides/${brief.content_plan.guides[0].slug}/`,
      label: brief.content_plan.guides[0].title,
      description: brief.content_plan.guides[0].lede,
      eyebrow: "Guide"
    },
    {
      href: `/comparisons/${brief.content_plan.comparisons[0].slug}/`,
      label: brief.content_plan.comparisons[0].title,
      description: brief.content_plan.comparisons[0].lede,
      eyebrow: "Compare"
    },
    {
      href: `/resources/${brief.content_plan.resource.slug}/`,
      label: brief.site_config.resource_label,
      description: brief.content_plan.resource.lede,
      eyebrow: "Resource"
    }
  ];
}

function topicLinks<T extends { slug: string }>(
  topics: T[],
  builder: (topic: T) => LinkCard,
  count: number
) {
  return topics.slice(0, count).map(builder);
}

export async function buildSiteContent(brief: NicheBrief, runtime: SiteRuntimeMeta): Promise<SiteContent> {
  const navigation = buildNavigation(brief);
  const coreLinks = buildCoreLinks(brief);

  const landingTemplate = await loadTemplate("landing-page-template.md");
  const calculatorTemplate = await loadTemplate("calculator-template.md");
  const faqTemplate = await loadTemplate("faq-template.md");
  const articleTemplate = await loadTemplate("article-template.md");
  const comparisonTemplate = await loadTemplate("comparison-template.md");
  const resourceTemplate = await loadTemplate("resource-template.md");

  const pages: PageManifest[] = [];

  const homeTemplate = fillTemplate(landingTemplate, {
    title: brief.site_config.homepage.hero_title,
    lede: brief.site_config.homepage.lede,
    value_intro: brief.site_config.homepage.value_intro,
    value_point_one: brief.site_config.homepage.value_points[0],
    value_point_two: brief.site_config.homepage.value_points[1],
    value_point_three: brief.site_config.homepage.value_points[2],
    next_step: brief.site_config.homepage.next_step
  });
  const parsedHome = parseTemplate(homeTemplate);
  pages.push(
    makePageBase(
      {
        id: `${brief.slug}-home`,
        type: "home",
        slug: "",
        href: "/",
        navLabel: brief.site_config.navigation_labels.home,
        title: brief.name,
        description: brief.core_problem,
        heroKicker: brief.site_config.homepage.hero_kicker,
        heroTitle: brief.site_config.homepage.hero_title,
        heroIntro: brief.site_config.homepage.hero_intro,
        metaTitle: `${brief.name} | ${brief.primary_intent[0]}`,
        metaDescription: brief.site_config.homepage.hero_intro,
        sections: [
          ...parsedHome.sections,
          {
            id: "who-this-is-for",
            heading: brief.site_config.homepage.who_for_title,
            paragraphs: [brief.site_config.homepage.who_for_body, `Core problem: ${brief.core_problem}`],
            bullets: brief.content_clusters.slice(0, 4)
          },
          {
            id: "tool-preview",
            heading: brief.site_config.homepage.tool_preview_title,
            paragraphs: [brief.site_config.homepage.tool_preview_body],
            bullets: brief.site_config.tool_page.input_labels.slice(0, 3),
            links: coreLinks.slice(0, 2)
          },
          {
            id: "workflow",
            heading: "Three-step workflow",
            paragraphs: ["The factory standard is speed to value in one visit: inputs first, result second, next action third."],
            bullets: brief.site_config.homepage.workflow_steps
          },
          {
            id: "faq-preview",
            heading: brief.site_config.homepage.faq_preview_title,
            paragraphs: [brief.site_config.homepage.faq_preview_intro],
            links: topicLinks(
              brief.content_plan.faq_topics,
              (topic) => ({ href: `/faq/${topic.slug}/`, label: topic.question, description: topic.short_answer, eyebrow: "FAQ" }),
              3
            )
          },
          {
            id: "comparison-preview",
            heading: brief.site_config.homepage.comparison_preview_title,
            paragraphs: [brief.site_config.homepage.comparison_preview_intro],
            links: topicLinks(
              brief.content_plan.comparisons,
              (topic) => ({ href: `/comparisons/${topic.slug}/`, label: topic.title, description: topic.lede, eyebrow: "Compare" }),
              2
            )
          },
          {
            id: "resource-preview",
            heading: brief.site_config.homepage.resource_preview_title,
            paragraphs: [brief.site_config.homepage.resource_preview_intro],
            links: [
              {
                href: `/resources/${brief.content_plan.resource.slug}/`,
                label: brief.site_config.resource_label,
                description: brief.content_plan.resource.lede,
                eyebrow: "Resource"
              }
            ]
          }
        ],
        cta: {
          label: brief.site_config.cta_labels.primary,
          href: "/tool/",
          variant: "primary"
        }
      },
      coreLinks
    )
  );

  const toolTemplateText = fillTemplate(calculatorTemplate, {
    title: brief.site_config.tool_page.title,
    lede: brief.site_config.tool_page.intro,
    inputs_intro: brief.site_config.tool_page.inputs_intro,
    input_one: brief.site_config.tool_page.input_labels[0],
    input_two: brief.site_config.tool_page.input_labels[1],
    input_three: brief.site_config.tool_page.input_labels[2],
    result_intro: brief.site_config.tool_page.result_intro,
    result_detail: brief.site_config.tool_page.result_detail
  });
  const parsedTool = parseTemplate(toolTemplateText);
  pages.push(
    makePageBase(
      {
        id: `${brief.slug}-tool`,
        type: "tool",
        slug: "tool",
        href: "/tool/",
        navLabel: brief.site_config.navigation_labels.tool,
        title: brief.site_config.tool_page.title,
        description: brief.tool_output,
        heroKicker: brief.site_config.tool_page.hero_kicker,
        heroTitle: brief.site_config.tool_page.title,
        heroIntro: brief.site_config.tool_page.intro,
        metaTitle: `${brief.site_config.tool_page.title} | ${brief.name}`,
        metaDescription: brief.tool_output,
        sections: [
          ...parsedTool.sections,
          {
            id: "tool-trust",
            heading: brief.site_config.tool_page.trust_title,
            paragraphs: brief.site_config.tool_page.trust_paragraphs,
            bullets: brief.site_config.tool_page.next_steps,
            callout: brief.site_config.tool_page.trust_callout
          }
        ],
        cta: {
          label: brief.site_config.cta_labels.resource,
          href: `/resources/${brief.content_plan.resource.slug}/`,
          variant: "secondary"
        },
        toolMountId: brief.tool_type
      },
      coreLinks
    )
  );

  const aboutTemplate = fillTemplate(articleTemplate, {
    title: brief.site_config.about_page.title,
    lede: brief.site_config.about_page.lede,
    takeaway: brief.site_config.about_page.takeaway,
    detail: brief.site_config.about_page.detail,
    next_action: brief.site_config.about_page.next_action
  });
  const parsedAbout = parseTemplate(aboutTemplate);
  pages.push(
    makePageBase(
      {
        id: `${brief.slug}-about`,
        type: "about",
        slug: "why-this-tool-matters",
        href: "/about/why-this-tool-matters/",
        title: parsedAbout.title,
        description: brief.core_problem,
        heroKicker: "Problem explainer",
        heroTitle: parsedAbout.title,
        heroIntro: parsedAbout.heroIntro,
        metaTitle: `${parsedAbout.title} | ${brief.name}`,
        metaDescription: brief.site_config.about_page.lede,
        sections: parsedAbout.sections,
        cta: {
          label: brief.site_config.cta_labels.primary,
          href: "/tool/",
          variant: "primary"
        }
      },
      coreLinks
    )
  );

  for (const topic of brief.content_plan.faq_topics) {
    const parsed = parseTemplate(
      fillTemplate(faqTemplate, {
        title: topic.question,
        lede: "A short answer is useful, but the real leverage comes from understanding the decision behind it.",
        answer: topic.short_answer,
        reason: topic.reason,
        next_step: topic.next_step
      })
    );

    pages.push(
      makePageBase(
        {
          id: `${brief.slug}-faq-${topic.slug}`,
          type: "faq",
          slug: topic.slug,
          href: `/faq/${topic.slug}/`,
          title: topic.question,
          description: topic.short_answer,
          heroKicker: "FAQ",
          heroTitle: parsed.title,
          heroIntro: parsed.heroIntro,
          metaTitle: `${topic.question} | ${brief.name}`,
          metaDescription: topic.short_answer,
          sections: parsed.sections,
          cta: {
            label: brief.site_config.cta_labels.primary,
            href: "/tool/",
            variant: "primary"
          }
        },
        coreLinks
      )
    );
  }

  for (const topic of brief.content_plan.guides) {
    const parsed = parseTemplate(
      fillTemplate(articleTemplate, {
        title: topic.title,
        lede: topic.lede,
        takeaway: topic.takeaway,
        detail: topic.detail,
        next_action: topic.next_action
      })
    );

    pages.push(
      makePageBase(
        {
          id: `${brief.slug}-guide-${topic.slug}`,
          type: "guide",
          slug: topic.slug,
          href: `/guides/${topic.slug}/`,
          title: topic.title,
          description: topic.lede,
          heroKicker: "Guide",
          heroTitle: parsed.title,
          heroIntro: parsed.heroIntro,
          metaTitle: `${topic.title} | ${brief.name}`,
          metaDescription: topic.lede,
          sections: parsed.sections,
          cta: {
            label: brief.site_config.cta_labels.primary,
            href: "/tool/",
            variant: "primary"
          }
        },
        coreLinks
      )
    );
  }

  for (const topic of brief.content_plan.comparisons) {
    const parsed = parseTemplate(
      fillTemplate(comparisonTemplate, {
        title: topic.title,
        lede: topic.lede,
        option_one: topic.option_one,
        option_one_body: topic.option_one_body,
        option_two: topic.option_two,
        option_two_body: topic.option_two_body,
        decision_shortcut: topic.decision_shortcut
      })
    );

    pages.push(
      makePageBase(
        {
          id: `${brief.slug}-comparison-${topic.slug}`,
          type: "comparison",
          slug: topic.slug,
          href: `/comparisons/${topic.slug}/`,
          title: topic.title,
          description: topic.lede,
          heroKicker: "Comparison",
          heroTitle: parsed.title,
          heroIntro: parsed.heroIntro,
          metaTitle: `${topic.title} | ${brief.name}`,
          metaDescription: topic.lede,
          sections: parsed.sections,
          cta: {
            label: brief.site_config.cta_labels.primary,
            href: "/tool/",
            variant: "primary"
          }
        },
        coreLinks
      )
    );
  }

  const resource = brief.content_plan.resource;
  const parsedResource = parseTemplate(
    fillTemplate(resourceTemplate, {
      title: resource.title,
      lede: resource.lede,
      resource_contents: resource.resource_contents,
      usage_steps: resource.usage_steps,
      next_action: resource.next_action
    })
  );
  const resourceDownloadHref = `/downloads/${resource.slug}.txt`;

  pages.push(
    makePageBase(
      {
        id: `${brief.slug}-resource-${resource.slug}`,
        type: "resource",
        slug: resource.slug,
        href: `/resources/${resource.slug}/`,
        navLabel: brief.site_config.navigation_labels.resource,
        title: resource.title,
        description: resource.lede,
        heroKicker: "Downloadable resource",
        heroTitle: parsedResource.title,
        heroIntro: parsedResource.heroIntro,
        metaTitle: `${resource.title} | ${brief.name}`,
        metaDescription: resource.lede,
        sections: [
          ...parsedResource.sections,
          {
            id: "download-cta",
            heading: "Download it now",
            paragraphs: ["The resource is delivered as a plain-text checklist so it stays portable across notes apps, CRMs, project trackers, and print workflows."],
            links: [
              {
                href: resourceDownloadHref,
                label: brief.site_config.resource_label,
                description: `Download ${resource.title.toLowerCase()}.`,
                eyebrow: "Download"
              }
            ]
          }
        ],
        cta: {
          label: brief.site_config.resource_label,
          href: resourceDownloadHref,
          variant: "primary"
        }
      },
      coreLinks
    )
  );

  const feedback = brief.site_config.feedback_page;
  pages.push(
    makePageBase(
      {
        id: `${brief.slug}-feedback`,
        type: "feedback",
        slug: "feedback",
        href: "/feedback/",
        title: feedback.title,
        description: feedback.intro,
        heroKicker: feedback.hero_kicker,
        heroTitle: feedback.title,
        heroIntro: feedback.intro,
        metaTitle: `${feedback.title} | ${brief.name}`,
        metaDescription: feedback.intro,
        sections: [
          {
            id: "feedback-prompts",
            heading: feedback.prompts_title,
            paragraphs: [
              "This route stays static-first in the initial release, but it still defines the exact prompts worth collecting once the winning asset earns a lightweight form integration.",
              "The real job of this page is operator clarity: if the site starts attracting repeat tool use or resource downloads, these prompts tell the next build exactly what friction is still slowing the user down."
            ],
            bullets: feedback.prompts,
            callout: feedback.callout,
            links: brief.expansion_paths.slice(0, 3).map((pathName) => ({ href: "/tool/", label: pathName, description: `Possible next expansion: ${pathName}.`, eyebrow: "Expansion" }))
          },
          {
            id: "launch-gating",
            heading: "What earns the next feature",
            paragraphs: [
              "A new feature only ships when the current tool shows repeat usage, the supporting pages keep pulling visitors toward the utility, and the next build clearly reduces quoting or preparation friction instead of adding decorative complexity."
            ],
            bullets: brief.success_signals.slice(0, 3)
          }
        ],
        cta: {
          label: brief.site_config.cta_labels.primary,
          href: "/tool/",
          variant: "secondary"
        }
      },
      coreLinks
    )
  );

  const tool: ToolDefinition = {
    id: `${brief.slug}-${brief.site_config.tool.component}`,
    name: brief.site_config.tool_page.title,
    description: brief.tool_output,
    component: brief.site_config.tool.component,
    default_values: brief.site_config.tool.default_values,
    fields: [
      {
        id: "primary",
        label: brief.site_config.tool_page.input_labels[0],
        inputType: "number",
        required: true
      },
      {
        id: "secondary",
        label: brief.site_config.tool_page.input_labels[1],
        inputType: "number",
        required: true
      },
      {
        id: "tertiary",
        label: brief.site_config.tool_page.input_labels[2],
        inputType: "radio",
        required: true
      }
    ]
  };

  return {
    brief,
    navigation,
    pages,
    routes: pages.map(routeForPage),
    tool,
    resourceDownloadHref,
    runtime
  };
}
