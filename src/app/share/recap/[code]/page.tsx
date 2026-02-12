import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SITE_TAGLINE } from "@/lib/app-meta";
import { verifyShareToken } from "@/lib/share-token";
import { getRecapState } from "@/lib/store";

type ShareRecapPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ token?: string }>;
};

const paramsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^[A-Za-z0-9]+$/),
});

function endingLabel(type: string): string {
  if (type === "triumph") {
    return "Victory";
  }
  if (type === "survival") {
    return "Escaped";
  }
  return "Game Over";
}

export async function generateMetadata({ params, searchParams }: ShareRecapPageProps): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const query = await searchParams;
  const token = query.token ?? "";
  if (!parsed.success) {
    return {};
  }

  const code = parsed.data.code.toUpperCase();
  const payload = await verifyShareToken(token);
  if (!payload || payload.code !== code) {
    return {
      title: "Story Clash",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  try {
    const recap = getRecapState(code);
    const image = `/api/og/recap?token=${encodeURIComponent(token)}`;
    const description = `${recap.storyTitle} ended in ${endingLabel(recap.endingType)}. ${SITE_TAGLINE}`;
    return {
      title: `Story Clash • ${endingLabel(recap.endingType)}`,
      description,
      openGraph: {
        title: `Story Clash • ${endingLabel(recap.endingType)}`,
        description,
        images: [image],
      },
      twitter: {
        card: "summary_large_image",
        title: `Story Clash • ${endingLabel(recap.endingType)}`,
        description,
        images: [image],
      },
    };
  } catch {
    return {
      title: "Story Clash",
      robots: {
        index: false,
        follow: false,
      },
    };
  }
}

export default async function ShareRecapPage({ params, searchParams }: ShareRecapPageProps) {
  const parsed = paramsSchema.safeParse(await params);
  const query = await searchParams;
  const token = query.token ?? "";
  if (!parsed.success) {
    notFound();
  }

  const code = parsed.data.code.toUpperCase();
  const payload = await verifyShareToken(token);
  if (!payload || payload.code !== code) {
    notFound();
  }

  const recap = getRecapState(code);

  return (
    <main className="page-shell">
      <div className="content-wrap grid min-h-dvh place-items-center">
        <section className="panel w-full max-w-xl space-y-4 p-6 text-center sm:p-8">
          <p className="badge mx-auto">Shared Recap</p>
          <h1 className="hero-title text-4xl sm:text-5xl">{endingLabel(recap.endingType)}</h1>
          <p className="text-zinc-200">{recap.storyTitle}</p>
          <p className="text-sm text-zinc-300">MVP: {recap.mvp.player}</p>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Room {code}</p>
        </section>
      </div>
    </main>
  );
}
