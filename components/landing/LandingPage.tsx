"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { CreditRange } from "@/components/pricing/CreditRange";
import { DFY_PLANS, INTRO_OFFER, LEAD_PLANS, SLIDER_PLANS, formatPlanPrice } from "@/lib/plans";
import { CONTACT_EMAIL } from "@/lib/site";
import { startCheckout } from "@/components/landing/checkout";
import {
  BRAND_AGENCY,
  BRAND_PAIN,
  COPY,
  DON_JULIO_FRAMES,
  HERO_REEL,
  PERSONAL_EDGE,
  STEPS,
  TRIAL_OFFERS,
  ZOOM_URL,
  faqFor,
  filmsFor,
  type Film,
  type Mode,
} from "@/components/landing/copy";
import { track } from "@/components/landing/track";

const EDGE_STILLS = ["/media/outback-signal.jpg", "/media/don-julio-and-canela.jpg", "/media/beto-and-osofuerte.jpg"];

const STYLE_CHIPS = [
  { name: "Pixar", poster: "/media/beto-and-osofuerte.jpg" },
  { name: "Claymation", poster: "/media/lumabrew-brew-your-mood.jpg" },
  { name: "Live action", poster: "/media/tigre-and-the-last-chance.jpg" },
];

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
  const [openFilm, setOpenFilm] = useState<Film | null>(null);
  const closeFilm = useCallback(() => setOpenFilm(null), []);

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
    setOpenFilm(null);
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
  }, [mode]);

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
  const films = filmsFor(mode);

  return (
    <main className={`library-shell land-page min-h-screen text-[var(--cf-ink)] ${sticky ? "pb-24 md:pb-0" : ""}`}>
      <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-[#110e0c]/80 px-3 py-3 backdrop-blur-md sm:px-6">
        <Brand tone="accent" />
        <ModeToggle mode={mode} base={base} onPick={pickMode} />
        <nav className="flex items-center justify-end gap-2">
          <a href="#pricing" className="rounded-full px-2 py-2 text-sm font-medium text-[var(--cf-muted)] hover:text-white sm:px-3">
            Pricing
          </a>
          <a href="/login" className="whitespace-nowrap rounded-full border border-white/15 px-3 py-2 text-sm font-semibold hover:border-white/30">
            Sign in
          </a>
        </nav>
      </header>

      <div key={mode} className="land-swap">
        <section id="hero" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <Reveal>
            <h1 className="land-display max-w-xl text-5xl leading-[0.95] sm:text-6xl">{copy.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--cf-muted)]">{copy.sub}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Primary href="#pricing" onClick={() => track("hero_cta_click", { mode })}>
                {copy.cta}
              </Primary>
              <a href="#films" onClick={() => track("hero_films_click", { mode })} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold hover:border-white/30">
                {copy.films}
              </a>
            </div>
            <p className="mt-4 text-sm text-[var(--cf-muted)]">{copy.trust}</p>
          </Reveal>
          <Reveal delay={80}>
            <HeroReel onPlay={setOpenFilm} />
          </Reveal>
        </section>

        <TrustStrip />

        <section id="films" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <Reveal>
            <h2 className="land-display text-3xl sm:text-5xl">{mode === "brands" ? "Ads, ready to run." : "Stories, ready to watch."}</h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--cf-muted)]">
              {mode === "brands"
                ? "A script or storyboard with your idea, story, or angle. Your product. One click. A professional ad."
                : "Write it the way you would tell a friend. These films started that way."}
            </p>
          </Reveal>
          <FilmStage films={films} onPlay={setOpenFilm} />
          <div className="mt-8">
            <Primary href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "films" })}>
              {copy.cta}
            </Primary>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Reveal>
            <h2 className="land-display text-3xl sm:text-4xl">What no other tool gives you.</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PERSONAL_EDGE.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <article className="land-still relative flex min-h-72 flex-col justify-end overflow-hidden p-6">
                  <img src={EDGE_STILLS[index]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
                  <div className="relative">
                    <h3 className="text-xl font-medium text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/85">{item.text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Reveal>
            <h2 className="land-display max-w-2xl text-3xl sm:text-4xl">Same man, same dog, from the first frame to the last.</h2>
          </Reveal>
          <div className="land-rail mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
            {DON_JULIO_FRAMES.map((src) => (
              <img key={src} src={src} alt="Don Julio and Canela" className="land-still h-64 w-40 shrink-0 snap-start object-cover sm:h-80 sm:w-48" />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Reveal>
            <h2 className="land-display text-3xl sm:text-4xl">How it works</h2>
          </Reveal>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} delay={index * 70}>
                <li className="border-t border-white/15 pt-5">
                  <p className="land-display text-4xl text-white/35">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-lg font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{step.text}</p>
                  {index === 2 ? (
                    <div className="mt-4 flex gap-2">
                      {STYLE_CHIPS.map((chip) => (
                        <figure key={chip.name} className="w-16">
                          <img src={chip.poster} alt="" className="h-20 w-16 rounded-lg object-cover" />
                          <figcaption className="mt-1 text-[11px] text-[var(--cf-muted)]">{chip.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </li>
              </Reveal>
            ))}
          </ol>
          <div className="mt-8">
            <Primary href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "steps" })}>
              {copy.cta}
            </Primary>
          </div>
        </section>

        <ModeBlock mode={mode} />

        <Pricing mode={mode} busy={busy} onBuy={(id) => void buy(id, "pricing_pack_click")} />

        <Faq
          mode={mode}
          open={openFaq}
          onToggle={(question) => {
            setOpenFaq((current) => (current === question ? null : question));
            track("faq_open", { question, mode });
          }}
        />

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="land-still relative overflow-hidden px-6 py-16 text-center sm:px-12">
            <img
              src={mode === "brands" ? "/media/outback-signal.jpg" : "/media/don-julio-and-canela.jpg"}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative">
              <p className="land-display text-3xl text-white sm:text-5xl">Tell it like you would tell a friend.</p>
              <div className="mt-6">
                <Primary href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "close" })}>
                  {copy.cta}
                </Primary>
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-xs text-[var(--cf-muted)] sm:px-6">
          <span>Clickframes</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <a href="/terms" className="hover:text-white">Terms</a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a>
          </nav>
        </footer>
      </div>

      {sticky && !offer && !openFilm ? (
        <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-white/10 bg-[#110e0c]/95 p-3 md:hidden">
          <a href="#pricing" onClick={() => track("hero_cta_click", { mode, place: "sticky" })} className="cf-btn btn-primary block w-full py-3 text-center text-sm font-semibold">
            {copy.cta}
          </a>
        </div>
      ) : null}

      <FilmLightbox film={openFilm} onClose={closeFilm} />

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

function creditLength(seconds: number) {
  const label = seconds.toLocaleString("en-US");
  if (seconds < 60) return `${label} credits = about ${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const minuteLabel = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  if (!rest) return `${label} credits = about ${minuteLabel}`;
  return `${label} credits = about ${minuteLabel} ${rest} seconds`;
}

function Primary({ href, onClick, children }: { href: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <a href={href} onClick={onClick} className="cf-btn btn-primary inline-flex px-5 py-3 text-sm font-semibold">
      {children}
    </a>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" aria-hidden="true">
      <path fill="currentColor" d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PlayButton({ label, onClick, large = false }: { label: string; onClick: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Play ${label}`}
      className={`land-play absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black ${large ? "h-16 w-16" : "h-14 w-14"}`}
    >
      <PlayGlyph />
    </button>
  );
}

function ModeToggle({ mode, base, onPick }: { mode: Mode; base: string; onPick: (mode: Mode) => void }) {
  return (
    <div className="relative grid grid-cols-2 rounded-full bg-white/10 p-1" role="group" aria-label="Audience">
      <span
        aria-hidden
        className={`pointer-events-none col-start-1 row-start-1 rounded-full cf-grad transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${mode === "brands" ? "translate-x-full" : "translate-x-0"}`}
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
          className={`relative z-10 row-start-1 rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors duration-300 sm:px-4 ${index === 0 ? "col-start-1" : "col-start-2"} ${mode === item ? "text-white" : "text-[var(--cf-muted)]"}`}
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

function HeroReel({ onPlay }: { onPlay: (film: Film) => void }) {
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const film = HERO_REEL[index] ?? HERO_REEL[0];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % HERO_REEL.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = box.current;
    const player = video.current;
    if (!node || !player) return;
    player.muted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || reduce) player.pause();
        else void player.play().catch(() => undefined);
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [film.mp4]);

  return (
    <div ref={box} className="land-still relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-black">
      <video
        key={film.mp4}
        ref={video}
        className="h-full w-full object-cover"
        poster={film.poster}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-label={film.label}
      >
        <source src={film.mp4} type="video/mp4" />
      </video>
      <PlayButton label={film.label} large onClick={() => onPlay(film)} />
      <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10 text-sm text-white">{film.label}</p>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { title: "Cinematic on the first try", icon: "film" },
    { title: "Continuity up to 2 minutes", icon: "time" },
    { title: "You own all the rights", icon: "check" },
  ] as const;
  return (
    <section className="border-y border-white/10">
      <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:grid-cols-3 sm:px-6">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-3 text-sm">
            <TrustIcon name={item.icon} />
            <span>{item.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrustIcon({ name }: { name: "film" | "time" | "check" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--cf-muted)]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      {name === "film" ? <path d="M4 7h16v10H4zM8 7v10M16 7v10M4 12h4M16 12h4" /> : null}
      {name === "time" ? <path d="M12 6v6l4 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /> : null}
      {name === "check" ? <path d="M5 12.5 9.2 17 19 7" /> : null}
    </svg>
  );
}

function FilmStage({ films, onPlay }: { films: Film[]; onPlay: (film: Film) => void }) {
  const [index, setIndex] = useState(0);
  const film = films[index] ?? films[0];
  if (!film) return null;
  const wide = film.ratio === "16:9";
  return (
    <div className="mt-8">
      <div className={`grid items-end gap-6 ${wide ? "" : "lg:grid-cols-[minmax(220px,340px)_1fr]"}`}>
        <Featured film={film} onPlay={() => onPlay(film)} />
        <div>
          <p className="text-sm text-[var(--cf-muted)]">{film.duration}</p>
          <h3 className="mt-2 text-2xl font-medium">{film.title}</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--cf-muted)]">{film.text}</p>
          <a href="#pricing" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">Make one like this</a>
        </div>
      </div>
      <div className="land-rail mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {films.map((item, itemIndex) => (
          <Thumb key={item.mp4} film={item} active={itemIndex === index} onPick={() => setIndex(itemIndex)} />
        ))}
      </div>
    </div>
  );
}

function Featured({ film, onPlay }: { film: Film; onPlay: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = box.current;
    const player = video.current;
    if (!node || !player) return;
    player.muted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || reduce) player.pause();
        else void player.play().catch(() => undefined);
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [film.mp4]);

  return (
    <div ref={box} className={`land-still relative overflow-hidden bg-black ${film.ratio === "16:9" ? "aspect-video" : "aspect-[9/16]"}`}>
      <video
        key={film.mp4}
        ref={video}
        className="h-full w-full object-cover"
        poster={film.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={film.label}
      >
        <source src={film.mp4} type="video/mp4" />
      </video>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[11px] text-white">{film.duration}</span>
      <PlayButton label={film.label} onClick={onPlay} />
    </div>
  );
}

function Thumb({ film, active, onPick }: { film: Film; active: boolean; onPick: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <article className="w-36 shrink-0 snap-start sm:w-40">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        aria-label={film.label}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        className={`relative block w-full overflow-hidden rounded-xl bg-black ${active ? "ring-2 ring-[#ff8a3d]" : ""} ${film.ratio === "16:9" ? "aspect-video" : "aspect-[9/16]"}`}
      >
        <img src={film.poster} alt="" className="h-full w-full object-cover" />
        {hot ? (
          <video className="absolute inset-0 h-full w-full object-cover" src={film.mp4} poster={film.poster} muted loop autoPlay playsInline preload="none" />
        ) : null}
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{film.duration}</span>
      </button>
      <p className="mt-2 text-sm font-medium">{film.title}</p>
      <a href="#pricing" className="mt-1 inline-block text-xs text-[var(--cf-muted)] underline-offset-4 hover:text-white hover:underline">
        Make one like this
      </a>
    </article>
  );
}

function ModeBlock({ mode }: { mode: Mode }) {
  const picks = filmsFor(mode).slice(0, 3);
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      {mode === "personal" ? (
        <Reveal>
          <h2 className="land-display max-w-2xl text-3xl sm:text-4xl">Write it the way you would tell a friend.</h2>
          <p className="mt-3 max-w-xl text-[var(--cf-muted)]">These films started that way.</p>
        </Reveal>
      ) : (
        <Reveal>
          <h2 className="land-display max-w-3xl text-3xl sm:text-4xl">Making the ads that win has never been this easy.</h2>
          <p className="mt-3 max-w-xl text-[var(--cf-muted)]">Your product, mascot, logo, and characters stay identical from shot to shot.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {BRAND_PAIN.map((item) => (
              <article key={item.title} className="border-t border-white/15 pt-4">
                <h3 className="text-base font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{item.text}</p>
              </article>
            ))}
          </div>
        </Reveal>
      )}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {picks.map((film) => (
          <figure key={film.mp4}>
            <img src={film.poster} alt="" className={`land-still w-full object-cover ${film.ratio === "16:9" ? "aspect-video" : "aspect-[9/16]"}`} />
            <figcaption className="mt-2 text-sm">{film.title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Pricing({ mode, busy, onBuy }: { mode: Mode; busy: string; onBuy: (id: string) => void }) {
  const [tier, setTier] = useState(0);
  const flex = SLIDER_PLANS[tier] ?? SLIDER_PLANS[0];
  const recommended = LEAD_PLANS[1];
  const starter = LEAD_PLANS[0];
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <Reveal>
        <h2 className="land-display text-3xl sm:text-4xl">Pricing</h2>
        <p className="mt-3 text-sm text-[var(--cf-muted)]">1 credit = 1 second of video.</p>
      </Reveal>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {starter ? (
          <Reveal className="order-2 flex lg:order-none">
            <PlanCard plan={starter} busy={busy} onBuy={onBuy} />
          </Reveal>
        ) : null}
        {recommended ? (
          <Reveal className="order-1 flex lg:order-none">
            <PlanCard plan={recommended} busy={busy} onBuy={onBuy} recommended />
          </Reveal>
        ) : null}
        <Reveal className="order-3 flex lg:order-none">
          <article className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-[var(--cf-surface)] p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium">{flex.seconds.toLocaleString("en-US")} credits</h3>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-[var(--cf-muted)]">{flex.badge ?? "Max / Ultra"}</span>
            </div>
            <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(flex.price)}<span className="text-lg font-medium">/mo</span></p>
            <p className="mt-2 text-sm text-[var(--cf-muted)]">{creditLength(flex.seconds)}</p>
            <div className="mt-5">
              <CreditRange labels={["250", "Max", "Ultra"]} index={tier} onChange={setTier} label="Monthly plan size" />
            </div>
            <p className="mt-3 flex-1 text-sm text-[var(--cf-muted)]">{flex.blurb}</p>
            <button type="button" onClick={() => onBuy(flex.id)} className="cf-btn btn-primary mt-5 rounded-xl px-3 py-2 text-sm font-semibold">
              {busy === flex.id ? "Opening…" : "Start plan"}
            </button>
          </article>
        </Reveal>
      </div>
      {mode === "brands" ? (
        <div id="agency" className="mt-14 scroll-mt-24">
          <h3 className="land-display text-3xl">{BRAND_AGENCY.title}</h3>
          <p className="mt-2 max-w-xl text-sm text-[var(--cf-muted)]">{BRAND_AGENCY.text}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {DFY_PLANS.map((plan) => (
              <article key={plan.id} className="flex flex-col rounded-2xl border border-white/10 bg-[var(--cf-surface)] p-6">
                <h3 className="text-lg font-medium">{plan.name}</h3>
                <p className="mt-3 text-3xl font-semibold">{formatPlanPrice(plan.price)}<span className="text-lg font-medium">/mo</span></p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--cf-muted)]">{plan.blurb}</p>
                <a
                  href={ZOOM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("book_call_click", { mode, place: plan.id })}
                  className="cf-btn btn-primary mt-5 inline-flex justify-center rounded-xl px-3 py-2 text-sm font-semibold"
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

function PlanCard({
  plan,
  busy,
  onBuy,
  recommended = false,
}: {
  plan: (typeof LEAD_PLANS)[number];
  busy: string;
  onBuy: (id: string) => void;
  recommended?: boolean;
}) {
  return (
    <article className={`flex flex-1 flex-col rounded-2xl border bg-[var(--cf-surface)] p-6 ${recommended ? "border-[#ff8a3d]" : "border-white/10"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium">{plan.seconds.toLocaleString("en-US")} credits</h3>
        {recommended ? <span className="rounded-full bg-[#ff8a3d] px-2 py-0.5 text-[11px] font-semibold text-black">Recommended</span> : null}
      </div>
      <p className="mt-3 text-4xl font-semibold">{formatPlanPrice(plan.price)}<span className="text-lg font-medium">/mo</span></p>
      <p className="mt-2 text-sm text-[var(--cf-muted)]">{creditLength(plan.seconds)}</p>
      <p className="mt-3 flex-1 text-sm text-[var(--cf-muted)]">{plan.blurb}</p>
      <button type="button" onClick={() => onBuy(plan.id)} className="cf-btn btn-primary mt-5 rounded-xl px-3 py-2 text-sm font-semibold">
        {busy === plan.id ? "Opening…" : "Start plan"}
      </button>
    </article>
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
      <h2 className="land-display text-3xl sm:text-4xl">Questions</h2>
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

function FilmLightbox({ film, onClose }: { film: Film | null; onClose: () => void }) {
  useEffect(() => {
    if (!film) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [film, onClose]);

  if (!film) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={film.label}
      className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`relative w-full ${film.ratio === "16:9" ? "max-w-5xl" : "max-w-sm"}`}>
        <video className="max-h-[80vh] w-full rounded-2xl bg-black" poster={film.poster} controls autoPlay muted playsInline preload="metadata">
          <source src={film.mp4} type="video/mp4" />
        </video>
        <button type="button" onClick={onClose} className="absolute -top-10 right-0 text-sm text-white/80 hover:text-white">
          Close
        </button>
      </div>
    </div>
  );
}
