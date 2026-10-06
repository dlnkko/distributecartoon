"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { CreditRange } from "@/components/pricing/CreditRange";
import { DFY_PLANS, INTRO_OFFER, LEAD_PLANS, SLIDER_PLANS, formatPlanPrice } from "@/lib/plans";
import { CONTACT_EMAIL } from "@/lib/site";
import { startCheckout } from "@/components/landing/checkout";
import {
  BRAND_AGENCY,
  BRAND_FILMS,
  BRAND_HERO,
  BRAND_PAIN,
  COPY,
  PERSONAL_EDGE,
  PERSONAL_FILMS,
  PERSONAL_HERO,
  STEPS,
  TRIAL_OFFERS,
  ZOOM_URL,
  faqFor,
  type Film,
  type Mode,
} from "@/components/landing/copy";
import { track } from "@/components/landing/track";
import { VideoCard } from "@/components/landing/VideoCard";

export function LandingPage({ mode: initialMode, base }: { mode: Mode; base: string }) {
  const [mode, setMode] = useState(initialMode);
  const copy = COPY[mode];
  const [offer, setOffer] = useState(false);
  const [closing, setClosing] = useState(false);
  const [left, setLeft] = useState(OFFER_SECONDS);
  const barRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [sticky, setSticky] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const sync = () => {
      const next = new URLSearchParams(window.location.search).get("mode") === "brands" ? "brands" : "personal";
      setMode(next);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    setOffer(false);
    setClosing(false);
    closingRef.current = false;
    document.title = COPY[mode].metaTitle;
  }, [mode]);

  useEffect(() => {
    if (offerSeen(mode)) return;
    const timer = window.setTimeout(() => {
      rememberOffer(mode);
      setLeft(OFFER_SECONDS);
      setOffer(true);
      track("trial_offer_shown", { mode });
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!offer || closing) return;
    const started = Date.now();
    let frame = 0;
    let shown = OFFER_SECONDS;
    const tick = () => {
      const remainingMs = OFFER_SECONDS * 1000 - (Date.now() - started);
      const bar = barRef.current;
      if (remainingMs <= 0) {
        if (bar) bar.style.transform = "scaleX(0)";
        setLeft(0);
        closeOffer();
        return;
      }
      if (bar) bar.style.transform = `scaleX(${remainingMs / (OFFER_SECONDS * 1000)})`;
      const next = Math.ceil(remainingMs / 1000);
      if (next !== shown) {
        shown = next;
        setLeft(next);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [offer, closing]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setOffer(false);
      setClosing(false);
      closingRef.current = false;
    }, 340);
    return () => window.clearTimeout(timer);
  }, [closing]);

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
    if (closingRef.current) return;
    closingRef.current = true;
    rememberOffer(mode);
    setClosing(true);
  }

  function pickMode(next: Mode) {
    if (next === mode) return;
    const url = next === "brands" ? `${base}?mode=brands` : base;
    window.history.pushState(null, "", url);
    setMode(next);
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

  const trial = TRIAL_OFFERS[mode];

  return (
    <main className={`library-shell min-h-screen text-[var(--cf-ink)] ${sticky ? "pb-24 md:pb-0" : ""}`}>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Brand tone="accent" />
        <ModeToggle mode={mode} base={base} onPick={pickMode} />
        <nav className="flex items-center gap-2">
          <a href="#pricing" className="hidden rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold sm:inline-flex">
            Pricing
          </a>
          <a href="/login" className="cf-btn btn-primary whitespace-nowrap px-3 py-2 text-sm font-semibold sm:px-4">
            Sign in
          </a>
        </nav>
      </header>

      <div key={mode} className="land-swap">
      <section id="hero" className={mode === "brands" ? "relative isolate min-h-[100svh] overflow-hidden" : "relative overflow-hidden"}>
        {mode === "brands" ? <HeroVideo clip={BRAND_HERO} /> : null}
        <div className={`pointer-events-none absolute inset-0 ${mode === "brands" ? "bg-gradient-to-t from-[#0b0b0d] via-[#0b0b0d]/70 to-[#0b0b0d]/25" : ""}`} />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-[#ff8a3d]/25 blur-3xl land-orb" />
        {mode === "personal" ? (
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
            <Reveal>
              <HeroCopy copy={copy} mode={mode} busy={busy} onBuy={() => void buy(INTRO_OFFER.id, "hero_cta_click")} />
            </Reveal>
            <Reveal delay={120}>
              <VideoCard clip={PERSONAL_HERO} ratio="aspect-[9/16]" play="always" frame="01" className="land-film mx-auto w-full max-w-[280px] sm:max-w-xs" />
            </Reveal>
          </div>
        ) : (
          <Reveal className="relative mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-4xl flex-col items-start justify-end px-4 pb-16 sm:px-6">
            <HeroCopy copy={copy} mode={mode} busy={busy} onBuy={() => void buy(INTRO_OFFER.id, "hero_cta_click")} light />
          </Reveal>
        )}
      </section>

      {mode === "personal" ? (
        <PersonalBody />
      ) : (
        <BrandBody />
      )}

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Reveal>
          <h2 className="land-display text-4xl sm:text-5xl">How it works</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 80}>
              <article className="h-full rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{step.text}</p>
              </article>
            </Reveal>
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
      </div>

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
          className={`fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md ${closing ? "land-veil-out" : "land-veil-in"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeOffer();
          }}
        >
          <div className={`relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-[#141417] p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:p-10 ${closing ? "land-offer-out" : "land-offer-in"}`}>
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
            <div className="relative mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">One time offer</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <div ref={barRef} className="cf-grad h-full w-full origin-left rounded-full" style={{ transform: "scaleX(1)" }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">{formatOfferTime(left)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                rememberOffer(mode);
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

const OFFER_SECONDS = 60;

function offerSeenKey(mode: Mode) {
  return mode === "brands" ? "cf-offer-once-brands" : "cf-offer-once-personal";
}

function offerSeen(mode: Mode) {
  try {
    return localStorage.getItem(offerSeenKey(mode)) === "1";
  } catch {
    return false;
  }
}

function rememberOffer(mode: Mode) {
  try {
    localStorage.setItem(offerSeenKey(mode), "1");
  } catch {
    /* The browser blocked storage. The offer still closes for this view. */
  }
}

function formatOfferTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function ModeToggle({ mode, base, onPick }: { mode: Mode; base: string; onPick: (mode: Mode) => void }) {
  return (
    <div className="relative grid grid-cols-2 rounded-xl bg-white/5 p-1" role="group" aria-label="Audience">
      <span
        aria-hidden
        className={`pointer-events-none col-start-1 row-start-1 rounded-lg cf-grad transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${mode === "brands" ? "translate-x-full" : "translate-x-0"}`}
      />
      {(["personal", "brands"] as const).map((item, index) => (
        <a
          key={item}
          href={item === "brands" ? `${base}?mode=brands` : base}
          aria-current={mode === item ? "true" : undefined}
          onClick={(event) => {
            event.preventDefault();
            track("mode_toggle", { mode: item });
            onPick(item);
          }}
          className={`relative z-10 row-start-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors duration-300 sm:px-4 ${index === 0 ? "col-start-1" : "col-start-2"} ${mode === item ? "text-white" : "text-[var(--cf-muted)]"}`}
        >
          {COPY[item].label}
        </a>
      ))}
    </div>
  );
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOn(Boolean(entry?.isIntersecting)),
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`land-reveal ${on ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function HeroCopy({
  copy,
  mode,
  busy,
  onBuy,
  light = false,
}: {
  copy: (typeof COPY)[Mode];
  mode: Mode;
  busy: string;
  onBuy: () => void;
  light?: boolean;
}) {
  return (
    <>
      <h1 className={`land-display max-w-3xl text-5xl leading-[0.95] sm:text-7xl ${light ? "text-white" : ""}`}>{copy.title}</h1>
      <p className={`mt-5 max-w-xl text-lg leading-relaxed ${light ? "text-white/80" : "text-[var(--cf-muted)]"}`}>{copy.sub}</p>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        {mode === "brands" ? (
          <a href="#pricing" onClick={() => track("hero_cta_click", { mode })} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
            {copy.cta}
          </a>
        ) : (
          <button type="button" onClick={onBuy} className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
            {busy === INTRO_OFFER.id ? "Opening…" : copy.cta}
          </button>
        )}
        <a href={mode === "brands" ? "#agency" : "#films"} className={`land-link text-sm font-semibold ${light ? "text-white" : ""}`}>
          {copy.secondary}
        </a>
      </div>
      <p className={`mt-4 text-sm ${light ? "text-white/70" : "text-[var(--cf-muted)]"}`}>{copy.trust}</p>
    </>
  );
}

function HeroVideo({ clip }: { clip: Film }) {
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    node.muted = true;
    node.defaultMuted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void node.play().catch(() => undefined);
    const onScroll = () => {
      node.style.transform = `translate3d(0, ${window.scrollY * 0.12}px, 0) scale(1.08)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clip.mp4]);

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
          preload="auto"
          aria-hidden="true"
          onError={() => setFailed(true)}
        >
          {clip.webm ? <source src={clip.webm} type="video/webm" /> : null}
          <source src={clip.mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}

function FilmRail({ films, start }: { films: Film[]; start: number }) {
  return (
    <div className="land-rail -mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
      {films.map((item, index) => (
        <Reveal key={item.mp4} delay={index * 90} className="w-[84%] shrink-0 snap-center md:w-auto">
          <article className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-3 sm:p-4">
            <VideoCard clip={item} ratio="aspect-[9/16]" play="view" frame={String(start + index).padStart(2, "0")} className="land-film mx-auto w-full max-w-xs" />
            <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{item.text}</p>
          </article>
        </Reveal>
      ))}
    </div>
  );
}

function PersonalBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-10 sm:px-6">
      <section id="films" className="scroll-mt-24">
        <Reveal>
          <h2 className="land-display text-4xl sm:text-5xl">Stories, ready to watch.</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">
            Write it the way you would tell a friend. These films started that way.
          </p>
        </Reveal>
        <FilmRail films={PERSONAL_FILMS} start={2} />
      </section>

      <section>
        <Reveal>
          <h2 className="land-display text-4xl sm:text-5xl">What no other tool gives you.</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PERSONAL_EDGE.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <article className={`rounded-3xl p-6 ${index === 0 ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${index === 0 ? "text-white/90" : "text-[var(--cf-muted)]"}`}>{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 text-sm text-[var(--cf-muted)]">You own all the rights to every video you create.</p>
      </section>
    </div>
  );
}

function BrandBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-16 sm:px-6">
      <section>
        <Reveal>
          <h2 className="land-display max-w-3xl text-4xl sm:text-5xl">Making the ads that win has never been this easy.</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">
            A script or storyboard with your idea, story, or angle. Your product. One click. A professional ad.
          </p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {BRAND_PAIN.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <article className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
                <h3 className="text-lg font-semibold line-through decoration-[#ff8a3d]/70">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-6 max-w-xl text-lg leading-relaxed">The ad you had in mind, in minutes, with no third party.</p>
        </Reveal>
      </section>

      <section id="films" className="scroll-mt-24">
        <Reveal>
          <h2 className="land-display text-4xl sm:text-5xl">Ads, ready to run.</h2>
        </Reveal>
        <FilmRail films={BRAND_FILMS} start={2} />
      </section>

      <Reveal className="cf-grad flex flex-col items-start justify-between gap-6 rounded-[2rem] p-8 text-white sm:flex-row sm:items-center sm:p-10">
        <div>
          <h2 className="land-display text-3xl sm:text-4xl">{BRAND_AGENCY.title}</h2>
          <p className="mt-2 max-w-md text-white/90">{BRAND_AGENCY.text}</p>
        </div>
        <a href="#agency" onClick={() => track("agency_jump_click", { mode: "brands" })} className="btn-primary shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
          {BRAND_AGENCY.cta}
        </a>
      </Reveal>
    </div>
  );
}

function Pricing({ mode, busy, onBuy }: { mode: Mode; busy: string; onBuy: (id: string) => void }) {
  const [tier, setTier] = useState(0);
  const flex = SLIDER_PLANS[tier] ?? SLIDER_PLANS[0];
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <Reveal>
        <h2 className="land-display text-4xl sm:text-5xl">Pricing</h2>
        <p className="mt-3 max-w-xl text-sm text-[var(--cf-muted)]">1 credit = 1 second of video. Monthly plans. The month starts the day you pay.</p>
      </Reveal>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {LEAD_PLANS.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 80} className="flex">
          <article className="flex flex-1 flex-col rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
            <h3 className="text-lg font-semibold">{plan.seconds.toLocaleString("en-US")} credits</h3>
            <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(plan.price)}<span className="text-lg font-medium">/mo</span></p>
            <p className="mt-3 flex-1 text-sm text-[var(--cf-muted)]">{plan.blurb}</p>
            <button type="button" onClick={() => onBuy(plan.id)} className="cf-btn btn-primary mt-5 rounded-xl px-3 py-2 text-sm font-semibold">
              {busy === plan.id ? "Opening…" : "Start plan"}
            </button>
          </article>
          </Reveal>
        ))}
        <Reveal delay={160} className="flex">
        <article className="cf-grad flex flex-1 flex-col rounded-3xl p-6 text-white">
          <h3 className="text-lg font-semibold">{flex.seconds.toLocaleString("en-US")} credits</h3>
          <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(flex.price)}<span className="text-lg font-medium">/mo</span></p>
          <div className="mt-5">
            <CreditRange labels={["250", "Max", "Ultra"]} index={tier} onChange={setTier} label="Monthly plan size" idleClass="text-white/70" />
          </div>
          <p className="mt-3 flex-1 text-sm text-white/90">{flex.blurb}</p>
          <button type="button" onClick={() => onBuy(flex.id)} className="btn-primary mt-5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black">
            {busy === flex.id ? "Opening…" : "Start plan"}
          </button>
        </article>
        </Reveal>
      </div>
      {mode === "brands" ? (
        <div id="agency" className="mt-14 scroll-mt-24">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">Agency plans</h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--cf-muted)]">We come up with the concepts and make the ads for you. Book a call first.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {DFY_PLANS.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 80}>
              <article className={`flex flex-col rounded-3xl p-6 ${index === 1 ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-3 text-3xl font-semibold">{formatPlanPrice(plan.price)}<span className="text-lg font-medium">/mo</span></p>
                <p className={`mt-3 flex-1 text-sm leading-relaxed ${index === 1 ? "text-white/90" : "text-[var(--cf-muted)]"}`}>{plan.blurb}</p>
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
              </Reveal>
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
    <Reveal>
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
    </Reveal>
  );
}
