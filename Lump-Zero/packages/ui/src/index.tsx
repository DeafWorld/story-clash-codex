import React from "react";
import type { LinkCard, NicheBrief, PageManifest } from "@factory/niche-config";

function buildThemeStyle(theme?: NicheBrief["site_config"]["theme"]): React.CSSProperties | undefined {
  if (!theme) {
    return undefined;
  }

  return {
    ["--accent" as string]: theme.accent,
    ["--accent-strong" as string]: theme.accent_strong,
    ["--accent-warm" as string]: theme.accent_warm,
    ["--accent-rose" as string]: theme.accent_rose,
    ["--text" as string]: theme.text,
    ["--muted" as string]: theme.muted,
    ["--background-start" as string]: theme.background_start,
    ["--background-mid" as string]: theme.background_mid,
    ["--background-end" as string]: theme.background_end,
    ["--glow-one" as string]: theme.glow_one,
    ["--glow-two" as string]: theme.glow_two
  };
}

export function PageShell({
  brief,
  navigation,
  page,
  theme,
  children
}: {
  brief: NicheBrief;
  navigation: LinkCard[];
  page: PageManifest;
  theme?: NicheBrief["site_config"]["theme"];
  children: React.ReactNode;
}) {
  return (
    <div className="site-shell" style={buildThemeStyle(theme)}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="shell-inner">
        <header className="topbar">
          <a className="brand-mark" href="/">
            <span className="brand-mark-badge" aria-hidden />
            <span>{brief.name}</span>
          </a>
          <nav aria-label="Primary">
            <div className="nav-list">
              {navigation.map((item) => (
                <a key={item.href} className="nav-link" href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          </nav>
        </header>

        <main id="main-content">
          <section className="hero-card">
            <div className="hero-grid">
              <div>
                <p className="eyebrow">{page.heroKicker}</p>
                <h1 className="hero-title">{page.heroTitle}</h1>
                <p className="hero-intro">{page.heroIntro}</p>
                {page.cta ? (
                  <div className="action-row" style={{ marginTop: "1.4rem" }}>
                    <a className="button button-primary" href={page.cta.href}>
                      {page.cta.label}
                    </a>
                    <a className="button button-secondary" href={`/resources/${brief.content_plan.resource.slug}/`}>
                      {brief.site_config.resource_label}
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="stat-grid" aria-label="Quick facts">
                <StatPill label="Target user" value={brief.target_user} />
                <StatPill label="Core problem" value={brief.core_problem} />
                <StatPill label="Tool output" value={brief.tool_output} />
              </div>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}

export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function ContentColumn({ page }: { page: PageManifest }) {
  return (
    <article className="content-card">
      <div className="section-stack">
        {page.sections.map((section) => (
          <section key={section.id} className="section-block" aria-labelledby={section.id}>
            <h2 id={section.id} className="section-title">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="section-copy">
                {paragraph}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="section-list">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            {section.callout ? <div className="callout-strip">{section.callout}</div> : null}
            {section.links?.length ? <LinkGrid links={section.links} /> : null}
          </section>
        ))}
      </div>
      {page.relatedLinks.length ? (
        <section className="section-block" aria-labelledby="related-links">
          <h2 id="related-links" className="section-title">
            Keep Moving
          </h2>
          <LinkGrid links={page.relatedLinks} />
        </section>
      ) : null}
    </article>
  );
}

export function LinkGrid({ links }: { links: LinkCard[] }) {
  return (
    <div className="link-grid">
      {links.map((link) => (
        <a key={link.href} className="link-tile" href={link.href}>
          {link.eyebrow ? <span className="link-eyebrow">{link.eyebrow}</span> : null}
          <span className="link-title">{link.label}</span>
          <p className="link-description">{link.description}</p>
        </a>
      ))}
    </div>
  );
}

export function FooterBand({ notes }: { notes: string[] }) {
  return (
    <footer className="footer-card">
      <div className="footer-grid">
        {notes.map((note) => (
          <p key={note} className="footer-note">
            {note}
          </p>
        ))}
      </div>
    </footer>
  );
}
