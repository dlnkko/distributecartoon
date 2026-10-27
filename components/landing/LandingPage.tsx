"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  BRAND_AGENCY,
  BRAND_HERO,
  BRAND_PAIN,
  COPY,
  FILMS,
  PERSONAL_EDGE,
  PERSONAL_HERO,
  STEPS,
  ZOOM_URL,
  faqFor,
  type Film,
  type Mode,
} from "@/components/landing/copy";
import { startCheckout } from "@/components/landing/checkout";
import { track } from "@/components/landing/track";
import { VideoCard } from "@/components/landing/VideoCard";
import { MEMBERSHIP_MINUTES } from "@/lib/plans";

export function LandingPage({ mode: initialMode, base }: { mode: Mode; base: string }) {
  const [mode, setMode] = useState(initialMode);
  const copy = COPY[mode];
  const [sticky, setSticky] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = new URLSearchParams(window.location.search).get("mode") === "brands" ? "brands" : "personal";
      setMode(next);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    document.title = COPY[mode].metaTitle;
  }, [mode]);

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
        {mode === "personal" ? (
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
            <Reveal>
              <HeroCopy copy={copy} mode={mode} />
            </Reveal>
            <Reveal delay={120}>
              <VideoCard clip={PERSONAL_HERO} ratio="aspect-[9/16]" play="always" quiet className="land-film mx-auto w-full max-w-[280px] sm:max-w-xs" />
            </Reveal>
          </div>
        ) : (
          <Reveal className="relative mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-4xl flex-col items-start justify-end px-4 pb-16 sm:px-6">
            <HeroCopy copy={copy} mode={mode} light />
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
          <h2 className="land-display text-3xl sm:text-4xl">How it works</h2>
        </Reveal>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 80}>
              <article className="border-t border-white/10 pt-5">
                <p className="text-sm tabular-nums text-[var(--cf-muted)]">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{step.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <WorkflowPay mode={mode} />

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

      {sticky ? (
        <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-white/10 bg-[#0b0b0d]/95 p-3 md:hidden">
          <a href="/login" onClick={() => track("hero_cta_click", { mode, place: "sticky" })} className="cf-btn btn-primary block w-full py-3 text-center text-sm font-semibold">
            {copy.cta}
          </a>
        </div>
      ) : null}
    </main>
  );
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
  light = false,
}: {
  copy: (typeof COPY)[Mode];
  mode: Mode;
  light?: boolean;
}) {
  const ghost = light
    ? "border-white/25 text-white"
    : "border-white/15";
  return (
    <>
      <h1 className={`land-display max-w-3xl text-5xl leading-[0.95] sm:text-7xl ${light ? "text-white" : ""}`}>{copy.title}</h1>
      <p className={`mt-5 max-w-xl text-lg leading-relaxed ${light ? "text-white/80" : "text-[var(--cf-muted)]"}`}>{copy.sub}</p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <a href="#films" onClick={() => track("hero_films_click", { mode })} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${ghost}`}>
          {copy.films}
        </a>
        <a href="/login" onClick={() => track("hero_cta_click", { mode })} className="cf-btn btn-primary px-5 py-3 text-center text-sm font-semibold">
          {copy.cta}
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

function FilmRail({ films, start = 0 }: { films: Film[]; start?: number }) {
  const [active, setActive] = useState(start);
  const scroller = useRef<HTMLDivElement>(null);
  const film = films[active] ?? films[0];
  if (!film) return null;
  const wide = film.ratio === "16:9";

  function pick(index: number) {
    const next = (index + films.length) % films.length;
    setActive(next);
    const node = scroller.current?.children[next];
    if (node instanceof HTMLElement) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  return (
    <div className="mt-8">
      <div
        className={`land-stage group relative overflow-hidden rounded-[1.35rem] bg-[#101014] ${wide ? "is-wide" : ""}`}
        tabIndex={0}
        aria-label={film.title}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            pick(active + 1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            pick(active - 1);
          }
        }}
      >
        <div key={film.mp4} className="land-stage-in absolute inset-0">
          <img src={film.poster} alt="" className="land-stage-blur absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`relative ${wide ? "h-full w-full" : "land-stage-portrait"}`}>
              <VideoCard clip={film} ratio="h-full w-full" play="always" quiet className="land-film h-full w-full" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-4 pt-16 sm:px-5 sm:pb-5">
                <p key={film.title} className="land-stage-copy max-w-xl pr-10">
                  <span className="text-[11px] tabular-nums tracking-[0.18em] text-white/55">
                    {String(active + 1).padStart(2, "0")} / {String(films.length).padStart(2, "0")}
                  </span>
                  <span className="land-display mt-1 block text-2xl text-white sm:text-3xl">{film.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-white/75">{film.text}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <button type="button" aria-label="Previous film" onClick={() => pick(active - 1)} className="land-stage-nav left-3">
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" aria-label="Next film" onClick={() => pick(active + 1)} className="land-stage-nav right-3">
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="mt-4 flex justify-start sm:justify-center">
        <div ref={scroller} className="land-rail flex max-w-full gap-2.5 overflow-x-auto px-0.5 pb-1 sm:gap-3" role="tablist" aria-label="Films">
          {films.map((item, index) => {
            const on = index === active;
            const itemWide = item.ratio === "16:9";
            return (
              <button
                key={item.mp4}
                type="button"
                role="tab"
                aria-label={item.title}
                aria-selected={on}
                onClick={() => pick(index)}
                className={`land-thumb shrink-0 ${on ? "is-on" : ""} ${itemWide ? "w-36 sm:w-44" : "w-[4.5rem] sm:w-[5.25rem]"}`}
              >
                <span className={`land-thumb-media block overflow-hidden rounded-xl ${itemWide ? "aspect-video" : "aspect-[9/16]"}`}>
                  <img src={item.poster} alt="" className="h-full w-full object-cover" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PersonalBody() {
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-10 sm:px-6">
      <section id="films" className="scroll-mt-24">
        <Reveal>
          <h2 className="land-display text-3xl sm:text-4xl">Stories, ready to watch.</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--cf-muted)]">
            Write it the way you would tell a friend. These films started that way.
          </p>
        </Reveal>
        <FilmRail films={FILMS} />
      </section>

      <section>
        <Reveal>
          <h2 className="land-display text-3xl sm:text-4xl">What no other tool gives you.</h2>
        </Reveal>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {PERSONAL_EDGE.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <article className="border-t border-white/10 pt-5">
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{item.text}</p>
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
          <h2 className="land-display max-w-3xl text-3xl sm:text-4xl">Making the ads that win has never been this easy.</h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--cf-muted)]">
            A script or storyboard with your idea, story, or angle. Your product. One click. A professional ad.
          </p>
        </Reveal>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {BRAND_PAIN.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <article className="border-t border-white/10 pt-5">
                <h3 className="text-lg font-medium">{item.title}</h3>
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
          <h2 className="land-display text-3xl sm:text-4xl">Ads, ready to run.</h2>
        </Reveal>
        <FilmRail films={FILMS} start={1} />
      </section>

      <Reveal className="flex flex-col items-start justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row sm:items-end">
        <div>
          <h2 className="land-display text-3xl sm:text-4xl">{BRAND_AGENCY.title}</h2>
          <p className="mt-3 max-w-md text-[var(--cf-muted)]">{BRAND_AGENCY.text}</p>
        </div>
        <a href="#agency" onClick={() => track("agency_jump_click", { mode: "brands" })} className="cf-btn btn-primary shrink-0 px-5 py-3 text-sm font-semibold">
          {BRAND_AGENCY.cta}
        </a>
      </Reveal>
    </div>
  );
}

function money(price: number) {
  return price.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function WorkflowPay({ mode }: { mode: Mode }) {
  const [index, setIndex] = useState(0);
  const pick = MEMBERSHIP_MINUTES[index] || MEMBERSHIP_MINUTES[0];
  const perMinute = pick.price / pick.minutes;

  function choose(next: number) {
    setIndex(next);
    const plan = MEMBERSHIP_MINUTES[next];
    if (plan) track("membership_minutes", { mode, minutes: String(plan.minutes), price: String(plan.price) });
  }

  return (
    <section id="workflow" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <Reveal>
        <h2 className="land-display text-3xl sm:text-4xl">You pay for the workflow</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--cf-muted)]">
          The membership is Clickframes: the story, the shots, and the direction. The video itself runs on your KIE account. After the plan is active, you add your KIE API key, and every film is billed there. That is why each video stays cheap.
        </p>
      </Reveal>
      <Reveal>
        <article id="pricing" className="mt-8 scroll-mt-24 rounded-2xl border border-white/10 bg-[var(--cf-surface)] p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cf-muted)]">Membership</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="land-display text-4xl sm:text-5xl">{pick.minutes.toLocaleString("en-US")} min</p>
              <p className="mt-1 text-sm text-[var(--cf-muted)]">of video each month</p>
            </div>
            <div className="sm:text-right">
              <p className="land-display text-4xl sm:text-5xl">{money(pick.price)}</p>
              <p className="mt-1 text-sm text-[var(--cf-muted)]">{money(perMinute)} per minute · billed monthly</p>
            </div>
          </div>
          <label className="mt-8 block">
            <span className="sr-only">Minutes of video per month</span>
            <input
              type="range"
              className="cf-range"
              min={0}
              max={MEMBERSHIP_MINUTES.length - 1}
              step={1}
              value={index}
              aria-valuemin={MEMBERSHIP_MINUTES[0].minutes}
              aria-valuemax={MEMBERSHIP_MINUTES[MEMBERSHIP_MINUTES.length - 1].minutes}
              aria-valuenow={pick.minutes}
              aria-valuetext={`${pick.minutes} minutes, ${money(pick.price)} per month`}
              onChange={(event) => choose(Number(event.target.value))}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {MEMBERSHIP_MINUTES.map((plan, planIndex) => {
              const on = planIndex === index;
              return (
                <button
                  key={plan.minutes}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(planIndex)}
                  className={`rounded-full border px-3 py-1 text-xs tabular-nums ${on ? "border-white/40 bg-white/10 font-semibold text-white" : "border-white/10 text-[var(--cf-muted)]"}`}
                >
                  {plan.minutes.toLocaleString("en-US")}
                </button>
              );
            })}
          </div>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--cf-muted)]">
            Workflow for {pick.minutes.toLocaleString("en-US")} minutes of finished video. The render stays on your KIE key.
          </p>
          <button
            type="button"
            onClick={() => {
              track("membership_checkout_click", { mode, minutes: String(pick.minutes), price: String(pick.price) });
              void startCheckout(pick.id).catch(() => undefined);
            }}
            className="cf-btn btn-primary mt-6 inline-flex rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Get this membership
          </button>
        </article>
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["Membership", "Pick how many minutes of video you need each month. That price is the workflow."],
          ["Your KIE key", "As soon as the plan is active, Clickframes asks for your KIE API key and uses it only for your films."],
          ["Cheap video", "KIE bills the render on your key. You are not buying seconds from us."],
        ].map(([title, text], index) => (
          <Reveal key={title} delay={index * 80}>
            <article className="h-full rounded-2xl border border-white/10 bg-[var(--cf-surface)] p-6">
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--cf-muted)]">{text}</p>
            </article>
          </Reveal>
        ))}
      </div>
      {mode === "brands" ? (
        <div id="agency" className="mt-14 scroll-mt-24">
          <h3 className="land-display text-3xl">{BRAND_AGENCY.title}</h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--cf-muted)]">{BRAND_AGENCY.text}</p>
          <a
            href={ZOOM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("book_call_click", { mode, place: "agency" })}
            className="cf-btn btn-primary mt-5 inline-flex rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Book a call
          </a>
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
