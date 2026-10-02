import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { COPY, modeFromQuery } from "@/components/landing/copy";

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
      url: mode === "brands" ? "/landing?mode=brands" : "/landing",
    },
  };
}

export default async function LandingRoute({ searchParams }: Props) {
  const { mode: raw } = await searchParams;
  const mode = modeFromQuery(Array.isArray(raw) ? raw[0] : raw);
  return <Landing mode={mode} base="/landing" />;
}
