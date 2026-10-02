import { LandingPage } from "@/components/landing/LandingPage";
import type { Mode } from "@/components/landing/copy";

export function Landing({ mode, base }: { mode: Mode; base: string }) {
  return <LandingPage mode={mode} base={base} />;
}
