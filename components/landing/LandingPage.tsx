"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { CreditRange } from "@/components/pricing/CreditRange";
import { INTRO_OFFER, LEAD_PLANS, SLIDER_PLANS, formatPlanPrice } from "@/lib/plans";
import { CONTACT_EMAIL } from "@/lib/site";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { startCheckout } from "@/components/landing/checkout";
import {
  AGENCY_PLANS,
  BRAND_AGENCY,
  BRAND_CLOSE,
  BRAND_FORMATS,
  BRAND_PAIN,
  BRAND_TECH,
  COPY,
  EXAMPLES,
  HERO_CLIPS,
  PERSONAL_EDGE,
  PERSONAL_IDEA,
  PERSONAL_OWN,
  PERSONAL_USES,
  STEPS,
  TRIAL_OFFERS,
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
    if (sessionStorage.getItem(offerKey(mode))) return;
    const timer = window.setTimeout(() => {
      setOffer(true);
      track("trial_offer_shown", { mode });
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!offer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOffer();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [offer]);

  function closeOffer() {
    sessionStorage.setItem(offerKey(mode), "1");
    setOffer(false);
  }

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
  const trial = TRIAL_OFFERS[mode];

  return (
    <main className={`library-shell min-h-screen text-[var(--cf-ink)] ${sticky ? "pb-24 md:pb-0" : ""}`}>
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
              <a href="#pricing" onClick={() => track("hero_cta_click", { mode })} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
                {copy.cta}
              </a>
            ) : (
              <button type="button" onClick={() => void buy(INTRO_OFFER.id, "hero_cta_click")} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
                {busy === INTRO_OFFER.id ? "Opening…" : copy.cta}
              </button>
            )}
            <a href={mode === "brands" ? "#agency" : "#examples"} className="land-link text-sm font-semibold text-white">
              {copy.secondary}
            </a>
          </div>
          <p className="mt-4 text-sm text-white/70">{copy.trust}</p>
        </div>
      </section>

      {mode === "personal" ? (
        <PersonalBody />
      ) : (
        <BrandBody />
      )}

      <section id="examples" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="land-display text-4xl sm:text-5xl">{mode === "brands" ? "Brand examples" : "Examples"}</h2>
        <div className={`mt-8 grid gap-4 ${mode === "brands" ? "mx-auto max-w-3xl md:grid-cols-2" : "md:grid-cols-3"}`}>
          {EXAMPLES[mode].map((item, index) => (
            <VideoCard key={item.label} clip={item} ratio={mode === "brands" ? "aspect-[9/16]" : "aspect-video"} frame={String(index + 1).padStart(2, "0")} />
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

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-xs text-[var(--cf-muted)] sm:px-6">
        <span>Clickframes</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
          <a href="/privacy" className="hover:text-white">Privacy</a>
          <a href="/terms" className="hover:text-white">Terms</a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a>
        </nav>
      </footer>

      {sticky && !offer ? (
        <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-white/10 bg-[#0b0b0d]/95 p-3 md:hidden">
          {mode === "brands" ? (
            <a href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "sticky" })} className="cf-btn btn-primary block w-full py-3 text-center text-sm font-semibold">
              {copy.cta}
            </a>
          ) : (
            <button type="button" onClick={() => void buy(INTRO_OFFER.id, "sticky_cta_click")} className="cf-btn btn-primary w-full py-3 text-center text-sm font-semibold">
              {busy === INTRO_OFFER.id ? "Opening…" : copy.cta}
            </button>
          )}
        </div>
      ) : null}

      {offer ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-offer-title"
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeOffer();
          }}
        >
          <div className="land-offer relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-[#141417] p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:p-10">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#ff8a3d]/30 blur-3xl" />
            <h2 id="trial-offer-title" className="land-display relative text-4xl leading-[1.02] text-white sm:text-5xl">
              {trial.title}
            </h2>
            <p className="relative mx-auto mt-4 max-w-sm text-base leading-relaxed text-white/75">{trial.text}</p>
            <p className="relative mt-6 flex items-baseline justify-center gap-3">
              <s className="text-xl text-white/45">{trial.was}</s>
              <span className="text-5xl font-semibold text-white">{trial.now}</span>
              <span className="text-sm text-white/60">one time</span>
            </p>
            <p className="relative mt-2 text-sm font-medium text-white">{INTRO_OFFER.seconds} credits</p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(offerKey(mode), "1");
                void buy(INTRO_OFFER.id, "trial_offer_accept");
              }}
              className="cf-btn btn-primary relative mt-7 w-full rounded-2xl py-3.5 text-base font-semibold"
            >
              {busy === INTRO_OFFER.id ? "Opening…" : trial.yes}
            </button>
            <button
              type="button"
              onClick={() => {
                track("trial_offer_decline", { mode });
                closeOffer();
              }}
              className="relative mt-3 w-full py-2 text-sm text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
            >
              {trial.no}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function offerKey(mode: Mode) {
  return mode === "brands" ? "cf-trial-offer-brands" : "cf-trial-offer";
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
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="land-display text-4xl sm:text-5xl">{PERSONAL_IDEA.title}</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--cf-muted)]">{PERSONAL_IDEA.text}</p>
        </div>
        <BeforeAfter />
      </section>

      <section>
        <h2 className="land-display text-4xl sm:text-5xl">What will you make?</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PERSONAL_USES.map((use, index) => (
            <article key={use.title} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-4">
              <VideoCard clip={use.media} frame={String(index + 1).padStart(2, "0")} />
              <h3 className="mt-4 text-lg font-semibold">{use.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{use.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="land-display text-4xl sm:text-5xl">What no other tool gives you.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PERSONAL_EDGE.map((item, index) => (
            <article key={item.title} className={`rounded-3xl p-6 ${index === 0 ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${index === 0 ? "text-white/90" : "text-[var(--cf-muted)]"}`}>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-[var(--cf-surface)] p-8 sm:p-12">
        <h2 className="land-display text-4xl sm:text-5xl">{PERSONAL_OWN.title}</h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">{PERSONAL_OWN.text}</p>
      </section>

    </div>
  );
}

function BrandBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6">
      <section>
        <h2 className="land-display max-w-3xl text-4xl sm:text-5xl">Making the ads that win has never been this easy.</h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">
          A script or storyboard with your idea, story, or angle. Your product. One click. A professional ad.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {BRAND_PAIN.map((item) => (
            <article key={item.title} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
              <h3 className="text-lg font-semibold line-through decoration-[#ff8a3d]/70">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{item.text}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-xl text-lg leading-relaxed">The ad you had in mind, in minutes, with no third party.</p>
      </section>

      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="land-display text-4xl sm:text-5xl">{BRAND_TECH.title}</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--cf-muted)]">{BRAND_TECH.text}</p>
        </div>
        <VideoCard clip={EXAMPLES.brands[0]} ratio="aspect-[9/16]" frame="01" className="mx-auto w-full max-w-sm" />
      </section>

      <section>
        <h2 className="land-display text-4xl sm:text-5xl">From drama ads to Suno ads.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {BRAND_FORMATS.map((format, index) => (
            <article key={format.title} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-4">
              <VideoCard clip={format.media} frame={String(index + 1).padStart(2, "0")} />
              <h3 className="mt-4 text-lg font-semibold">{format.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{format.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cf-grad flex flex-col items-start justify-between gap-6 rounded-[2rem] p-8 text-white sm:flex-row sm:items-center sm:p-10">
        <div>
          <h2 className="land-display text-3xl sm:text-4xl">{BRAND_AGENCY.title}</h2>
          <p className="mt-2 max-w-md text-white/90">{BRAND_AGENCY.text}</p>
        </div>
        <a href="#agency" onClick={() => track("agency_jump_click", { mode: "brands" })} className="btn-primary shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
          {BRAND_AGENCY.cta}
        </a>
      </section>

      <section className="text-center">
        <h2 className="land-display mx-auto max-w-3xl text-4xl leading-[1.02] sm:text-6xl">{BRAND_CLOSE.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">{BRAND_CLOSE.text}</p>
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
        <div id="agency" className="mt-14 scroll-mt-24">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">Agency plans</h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--cf-muted)]">We come up with the concepts and make the ads for you. Book a call first.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {AGENCY_PLANS.map((plan, index) => (
              <article key={plan.id} className={`flex flex-col rounded-3xl p-6 ${index === 1 ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className={`mt-3 flex-1 text-sm leading-relaxed ${index === 1 ? "text-white/90" : "text-[var(--cf-muted)]"}`}>{plan.text}</p>
                <a
                  href={ZOOM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("book_call_click", { mode, place: plan.id })}
                  className={`btn-primary mt-5 inline-flex justify-center rounded-xl px-3 py-2 text-sm font-semibold ${index === 1 ? "bg-white text-black" : "cf-btn text-white"}`}
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
