import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { META } from "@/components/landing/copy";

export const metadata: Metadata = {
  title: META.title,
  description: META.description,
  openGraph: {
    title: META.title,
    description: META.description,
    url: "/landing",
  },
};

export default function LandingRoute() {
  return <Landing />;
}
