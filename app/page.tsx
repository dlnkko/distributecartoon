import { Landing } from "@/components/Landing";
import { StudioApp } from "@/components/StudioApp";
import { META } from "@/components/landing/copy";
import { getAuthUser } from "@/lib/auth";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
  },
};

export default async function Home() {
  const user = await getAuthUser();
  if (!user) return <Landing />;
  return <StudioApp />;
}
