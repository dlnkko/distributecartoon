import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { CONTACT_EMAIL } from "@/lib/site";

export function LegalDocument({
  title,
  current,
  children,
}: {
  title: string;
  current: "privacy" | "terms";
  children: ReactNode;
}) {
  return (
    <main className="library-shell min-h-screen text-[var(--cf-ink)]">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <a href="/" aria-label="Clickframes home">
          <Brand tone="accent" />
        </a>
        <nav className="flex items-center gap-4 text-sm" aria-label="Legal">
          <a href="/privacy" aria-current={current === "privacy" ? "page" : undefined} className={current === "privacy" ? "font-medium text-white" : "text-[var(--cf-muted)]"}>
            Privacy
          </a>
          <a href="/terms" aria-current={current === "terms" ? "page" : undefined} className={current === "terms" ? "font-medium text-white" : "text-[var(--cf-muted)]"}>
            Terms
          </a>
        </nav>
      </header>
      <article className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h1 className="land-display text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-[var(--cf-muted)]">Last updated October 2, 2026</p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--cf-muted)]">{children}</div>
        <p className="mt-10 text-sm text-[var(--cf-muted)]">
          Questions: <a className="text-[#ffb089]" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-[var(--cf-ink)]">{title}</h2>
      {children}
    </section>
  );
}
