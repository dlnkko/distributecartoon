import { Landing } from "@/components/Landing";
import { StudioApp } from "@/components/StudioApp";
import { COPY, modeFromQuery } from "@/components/landing/copy";
import { getAuthUser } from "@/lib/auth";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mode?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { mode: raw } = await searchParams;
  const mode = modeFromQuery(Array.isArray(raw) ? raw[0] : raw);
  const copy = COPY[mode];
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function Home({ searchParams }: Props) {
  const user = await getAuthUser();
  if (!user) {
    const { mode: raw } = await searchParams;
    const mode = modeFromQuery(Array.isArray(raw) ? raw[0] : raw);
    return <Landing mode={mode} base="/" />;
  }
  return <StudioApp />;
}
