"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { CreditRange } from "@/components/pricing/CreditRange";
import { DFY_PLANS, LEAD_PLANS, SLIDER_PLANS, formatPlanPrice } from "@/lib/plans";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { startCheckout } from "@/components/landing/checkout";
import {
  BRAND_PAIN,
  COPY,
  EXAMPLES,
  HERO_CLIPS,
  PERSONAL_STORY,
  STEPS,
  STYLES,
  ZOOM_URL,
  faqFor,
  type Mode,
} from "@/components/landing/copy";
import { track } from "@/components/landing/track";
import { VideoCard } from "@/components/landing/VideoCard";

export function LandingPage({ mode, base }: { mode: Mode; base: string }) {
  const copy = COPY[mode];
  const [clip, setClip] = useState(0);
  const [offer, setOffer] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setClip(0);
  }, [mode]);

  useEffect(() => {
    const clips = HERO_CLIPS[mode];
    const timer = window.setInterval(() => {
      setClip((current) => (current + 1) % clips.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (sessionStorage.getItem("cf-offer-bar")) return;
    const timer = window.setTimeout(() => setOffer(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const update = () => setSticky(hero.getBoundingClientRect().bottom < 80);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  async function buy(planId: string, event: string) {
    setBusy(planId);
    track(event, { plan: planId, mode });
    try {
      await startCheckout(planId);
    } catch {
      setBusy("");
    }
  }

  const hero = HERO_CLIPS[mode][clip] ?? HERO_CLIPS[mode][0];

  return (
    <main className={`library-shell min-h-screen text-[var(--cf-ink)] ${offer || sticky ? "pb-36" : ""}`}>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Brand tone="accent" />
        <ModeToggle mode={mode} base={base} />
        <nav className="flex items-center gap-2">
          <a href="#pricing" className="hidden rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold sm:inline-flex">
            Pricing
          </a>
          <a href="/login" className="cf-btn btn-primary px-4 py-2 text-sm font-semibold">
            Sign in
          </a>
        </nav>
      </header>

      <section id="hero" className="relative isolate min-h-[100svh] overflow-hidden">
        <HeroVideo key={`${mode}-${hero.label}`} clip={hero} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0b0d] via-[#0b0b0d]/70 to-[#0b0b0d]/25" />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-[#ff8a3d]/25 blur-3xl land-orb" />
        <div className="relative mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-4xl flex-col items-start justify-end px-4 pb-16 sm:px-6">
          <h1 className="land-display max-w-3xl text-5xl leading-[0.95] text-white sm:text-7xl">{copy.title}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">{copy.sub}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            {mode === "brands" ? (
              <a href={ZOOM_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("book_call_click", { mode, place: "hero" })} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
                {copy.cta}
              </a>
            ) : (
              <a href="#pricing" onClick={() => track("hero_cta_click", { mode })} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
                {copy.cta}
              </a>
            )}
            <a href="#examples" className="land-link text-sm font-semibold text-white">
              {copy.secondary}
            </a>
          </div>
          <p className="mt-4 text-sm text-white/70">{copy.trust}</p>
        </div>
      </section>

      {mode === "personal" ? <PersonalBody /> : <BrandBody />}

      <section id="examples" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="land-display text-4xl sm:text-5xl">{mode === "brands" ? "Brand examples" : "Examples"}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {EXAMPLES[mode].map((item, index) => (
            <VideoCard key={item.label} clip={item} frame={String(index + 1).padStart(2, "0")} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h2 className="land-display text-4xl sm:text-5xl">How it works</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <article key={step.title} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-4">
              <VideoCard clip={step.media} frame={String(index + 1).padStart(2, "0")} />
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <Pricing mode={mode} busy={busy} onBuy={(id) => void buy(id, "pricing_pack_click")} />

      <Faq mode={mode} open={openFaq} onToggle={(q) => {
        setOpenFaq((current) => (current === q ? null : q));
        track("faq_open", { question: q, mode });
      }} />

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-4 py-10 text-xs text-[var(--cf-muted)] sm:px-6">
        <span>Clickframes</span>
        <span>Monthly plans from $19.99.</span>
      </footer>

      {offer ? (
        <div className={`land-offer fixed inset-x-0 z-[90] px-3 sm:px-6 ${sticky ? "bottom-20 md:bottom-3" : "bottom-3"}`}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#141417]/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
            <p className="text-sm">Plans from $19.99 a month.</p>
            <div className="flex shrink-0 items-center gap-2">
              <a href="#pricing" onClick={() => track("offer_bar_click", { mode })} className="cf-btn btn-primary px-3 py-2 text-sm font-semibold">
                See plans
              </a>
              <button
                type="button"
                className="px-2 text-sm text-[var(--cf-muted)]"
                onClick={() => {
                  sessionStorage.setItem("cf-offer-bar", "1");
                  setOffer(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sticky ? (
        <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-white/10 bg-[#0b0b0d]/95 p-3 md:hidden">
          {mode === "brands" ? (
            <a href={ZOOM_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("book_call_click", { mode, place: "sticky" })} className="cf-btn btn-primary w-full py-3 text-center text-sm font-semibold">
              {copy.cta}
            </a>
          ) : (
            <a href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "sticky" })} className="cf-btn btn-primary w-full py-3 text-center text-sm font-semibold">
              {copy.cta}
            </a>
          )}
        </div>
      ) : null}
    </main>
  );
}

function ModeToggle({ mode, base }: { mode: Mode; base: string }) {
  return (
    <div className="inline-flex rounded-xl bg-white/5 p-1" role="group" aria-label="Audience">
      {(["personal", "brands"] as const).map((item) => (
        <a
          key={item}
          href={item === "brands" ? `${base}?mode=brands` : base}
          aria-current={mode === item ? "true" : undefined}
          onClick={() => track("mode_toggle", { mode: item })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium sm:px-4 ${mode === item ? "cf-grad text-white" : "text-[var(--cf-muted)]"}`}
        >
          {COPY[item].label}
        </a>
      ))}
    </div>
  );
}

function HeroVideo({ clip }: { clip: (typeof HERO_CLIPS)["personal"][number] }) {
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = video.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => {
      node.style.transform = `translate3d(0, ${window.scrollY * 0.12}px, 0) scale(1.08)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clip.label]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {failed ? (
        <div className="h-full w-full bg-[url('/media/poster.svg')] bg-cover" />
      ) : (
        <video
          ref={video}
          className="h-full w-full scale-105 object-cover"
          poster={clip.poster}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-hidden="true"
          onError={() => setFailed(true)}
        >
          <source src={clip.webm} type="video/webm" />
          <source src={clip.mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}

function PersonalBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-6">
      <BeforeAfter />
      {PERSONAL_STORY.map((block, index) => (
        <article key={block.title} className={`grid items-center gap-8 lg:grid-cols-2 ${index % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
          <div>
            <h2 className="land-display text-4xl sm:text-5xl">{block.title}</h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--cf-muted)]">{block.text}</p>
          </div>
          <VideoCard clip={block.media} frame={String(index + 1).padStart(2, "0")} />
        </article>
      ))}
      <div className="flex flex-wrap gap-3">
        {STYLES.map((style) => (
          <span key={style} className="rounded-full border border-white/15 px-4 py-2 text-sm">
            {style}
          </span>
        ))}
      </div>
    </div>
  );
}

function BrandBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-6">
      <section>
        <h2 className="land-display text-4xl sm:text-5xl">Sound familiar?</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {BRAND_PAIN.map((line) => (
            <article key={line} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6 text-lg leading-snug">
              {line}
            </article>
          ))}
        </div>
      </section>
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="land-display text-4xl sm:text-5xl">Clickframes locks the details.</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--cf-muted)]">
            Characters, products, places and logos stay identical from shot to shot, so the ad looks like it was planned, not generated.
          </p>
        </div>
        <VideoCard clip={EXAMPLES.brands[0]} frame="01" />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
          <h3 className="text-lg font-semibold">Traditional studio</h3>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--cf-muted)]">
            <li>Weeks of production.</li>
            <li>Thousands of dollars.</li>
            <li>Round after round of revisions.</li>
          </ul>
        </article>
        <article className="cf-grad rounded-3xl p-6 text-white">
          <h3 className="text-lg font-semibold">Clickframes</h3>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-white/90">
            <li>A fast first generation.</li>
            <li>A few dollars.</li>
            <li>A finished cut, with the voices already in.</li>
          </ul>
        </article>
      </section>
      <section>
        <h2 className="land-display text-4xl sm:text-5xl">Test ten creatives, not one.</h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">
          Cheap enough to try different hooks, characters and styles until one wins.
        </p>
      </section>
    </div>
  );
}

function Pricing({ mode, busy, onBuy }: { mode: Mode; busy: string; onBuy: (id: string) => void }) {
  const [tier, setTier] = useState(0);
  const flex = SLIDER_PLANS[tier] ?? SLIDER_PLANS[0];
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="land-display text-4xl sm:text-5xl">Pricing</h2>
      <p className="mt-3 max-w-xl text-sm text-[var(--cf-muted)]">Monthly plans. 1 credit is 1 second of video. The month starts the day you pay.</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {LEAD_PLANS.map((plan) => (
          <article key={plan.id} className="flex flex-col rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
            <h3 className="text-lg font-semibold">{plan.seconds} credits</h3>
            <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(plan.price)}<span className="text-lg font-medium">/mo</span></p>
            <p className="mt-1 text-sm text-[var(--cf-muted)]">{plan.perCredit} per credit</p>
            <p className="mt-3 flex-1 text-sm text-[var(--cf-muted)]">{plan.blurb}</p>
            <button type="button" onClick={() => onBuy(plan.id)} className="cf-btn btn-primary mt-5 rounded-xl px-3 py-2 text-sm font-semibold">
              {busy === plan.id ? "Opening…" : "Start plan"}
            </button>
          </article>
        ))}
        <article className="cf-grad flex flex-col rounded-3xl p-6 text-white">
          <h3 className="text-lg font-semibold">{flex.badge || `${flex.seconds} credits`}</h3>
          <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(flex.price)}<span className="text-lg font-medium">/mo</span></p>
          <p className="mt-1 text-sm text-white/85">{flex.seconds.toLocaleString("en-US")} credits · {flex.perCredit} per credit</p>
          <div className="mt-5">
            <CreditRange labels={["250", "Max", "Ultra"]} index={tier} onChange={setTier} label="Monthly plan size" idleClass="text-white/70" />
          </div>
          <p className="mt-3 flex-1 text-sm text-white/90">{flex.blurb}</p>
          <button type="button" onClick={() => onBuy(flex.id)} className="btn-primary mt-5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">
            {busy === flex.id ? "Opening…" : "Start plan"}
          </button>
        </article>
      </div>
      {mode === "brands" ? (
        <div className="mt-14">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">Done for you</h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--cf-muted)]">A monthly crew. Book a call first. Nothing is charged on this page.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {DFY_PLANS.map((plan) => (
              <article key={plan.id} className={`flex flex-col rounded-3xl p-6 ${plan.featured ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-2 text-4xl font-semibold">${plan.price.toLocaleString("en-US")}<span className="text-lg font-medium">/mo</span></p>
                <p className={`mt-3 flex-1 text-sm leading-relaxed ${plan.featured ? "text-white/90" : "text-[var(--cf-muted)]"}`}>
                  {plan.id === "dfy-studio"
                    ? "30 animations a month. You send the scripts. We adapt them and deliver the animations."
                    : "50 animations a month. We write from what has worked, build the angles, and run the creative."}
                </p>
                <a
                  href={ZOOM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("book_call_click", { mode, place: plan.id })}
                  className={`btn-primary mt-5 inline-flex justify-center rounded-xl px-3 py-2 text-sm font-semibold ${plan.featured ? "bg-white text-black" : "cf-btn text-white"}`}
                >
                  Book a call
                </a>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Faq({
  mode,
  open,
  onToggle,
}: {
  mode: Mode;
  open: string | null;
  onToggle: (question: string) => void;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h2 className="land-display text-4xl">Questions</h2>
      <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
        {faqFor(mode).map((item) => {
          const shown = open === item.q;
          return (
            <div key={item.q}>
              <button type="button" className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-medium" aria-expanded={shown} onClick={() => onToggle(item.q)}>
                {item.q}
                <span aria-hidden="true">{shown ? "-" : "+"}</span>
              </button>
              {shown ? <p className="pb-4 text-sm leading-relaxed text-[var(--cf-muted)]">{item.a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
