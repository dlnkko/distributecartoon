"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mark } from "@/components/Brand";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  BRIEF_TABS,
  CONSISTENCY,
  CONTROL,
  FAQ,
  FEEDS,
  HERO,
  INCLUDED,
  MARQUEE,
  PHONE_FILMS,
  RENDER_COMPARE,
  STACK,
  WHY,
  WIDE_FILM,
  type Film,
} from "@/components/landing/copy";
import { startCheckout } from "@/components/landing/checkout";
import { track } from "@/components/landing/track";
import { LANDING_MINUTES } from "@/lib/plans";

const WRAP = "mx-auto w-full max-w-[44rem] px-5";
const H2 = "text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.035em] text-[#0c0c0c] sm:text-[3.5rem]";
const SUB = "text-[1.0625rem] leading-relaxed text-[#3f434b]";

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    const update = () => {
      setScrolled(window.scrollY > 240);
      if (hero) setSticky(hero.getBoundingClientRect().bottom < 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <main className={`lp min-h-screen overflow-x-clip bg-white text-[#0c0c0c] ${sticky ? "pb-24 md:pb-0" : ""}`}>
      <TopMarquee />
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[44rem] items-center justify-between gap-3 px-5">
          <a href="#top" aria-label="Clickframes, back to top" className="flex items-center gap-2 text-[#0c0c0c]">
            <Mark className="h-7 w-7" />
            <span className="text-[1.05rem] font-semibold tracking-[-0.04em]">clickframes</span>
          </a>
          <p className={`hidden text-sm text-[#3f434b] transition-opacity duration-300 md:block ${scrolled ? "opacity-100" : "opacity-0"}`}>
            Drama ads. <span className="font-semibold text-[#0c0c0c]">One-shotted.</span>
          </p>
          <nav className="flex items-center gap-2">
            <a href="/login" className="rounded-lg px-3 py-2 text-sm text-[#3f434b] hover:text-[#0c0c0c]">
              Log in
            </a>
            <a
              href="/login"
              onClick={() => track("hero_cta_click", { place: "header" })}
              className="rounded-xl border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold text-[#3d5afe] shadow-[0_2px_10px_rgba(61,90,254,0.12)]"
            >
              Get started <span aria-hidden="true">→</span>
            </a>
          </nav>
        </div>
      </header>

      <Hero />
      <PhoneShowcase />
      <WhySection />
      <StackRow />
      <CharacterLock />
      <ControlRoom />
      <Feeds />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />

      {sticky ? (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-black/10 bg-white/95 p-3 backdrop-blur md:hidden">
          <Cta place="sticky" className="w-full justify-center" />
        </div>
      ) : null}
    </main>
  );
}

function TopMarquee() {
  const items = [...MARQUEE, ...MARQUEE, ...MARQUEE];
  return (
    <a
      href="/login"
      aria-label="Make your first drama ad: sign up now"
      onClick={() => track("hero_cta_click", { place: "marquee" })}
      className="lp-bar block overflow-hidden py-2 text-white"
    >
      <div className="land-marquee flex w-max items-center gap-6 whitespace-nowrap text-[13px] font-extrabold uppercase italic tracking-tight">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-6" aria-hidden={copy === 1}>
            {items.map((item, index) => (
              <span key={`${item}-${index}`} className="flex items-center gap-6">
                {index % MARQUEE.length === 1 ? (
                  <span className="rounded-md bg-black px-2.5 py-1 not-italic text-white">Start now</span>
                ) : null}
                <span>{item}</span>
                <span className="text-white/60">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </a>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-[#3f434b] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#3d5afe]" />
      {children}
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-[#f2f3f5] px-1.5 py-px font-semibold text-[#0c0c0c] ring-1 ring-black/[0.06]">
      {children}
    </span>
  );
}

function Cta({ place, label = HERO.cta, className = "" }: { place: string; label?: string; className?: string }) {
  return (
    <a
      href="/login"
      onClick={() => track("hero_cta_click", { place })}
      className={`btn-primary lp-cta gap-3 rounded-2xl py-2 pl-5 pr-2 text-[1.0625rem] font-bold tracking-[-0.02em] text-white ${className}`}
    >
      {label}
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 text-lg">
        →
      </span>
    </a>
  );
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setOn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
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

function SectionHead({ pill, title, text, center = true }: { pill: string; title: ReactNode; text?: ReactNode; center?: boolean }) {
  return (
    <Reveal className={center ? "text-center" : ""}>
      <Pill>{pill}</Pill>
      <h2 className={`${H2} mt-4`}>{title}</h2>
      {text ? <p className={`${SUB} mt-4 ${center ? "mx-auto max-w-xl" : "max-w-xl"}`}>{text}</p> : null}
    </Reveal>
  );
}

function Hero() {
  return (
    <section id="hero" className="relative">
      <div id="top" className="absolute -top-24" />
      <div className={`${WRAP} pb-12 pt-14 text-center sm:pt-20`}>
        <Reveal>
          <Pill>{HERO.eyebrow}</Pill>
          <h1 className="mt-6 text-[2.9rem] font-semibold leading-[1] tracking-[-0.04em] text-[#0c0c0c] sm:text-[4.5rem]">
            {HERO.title[0]}
            <br />
            <span className="lp-underline">{HERO.title[1]}</span>
          </h1>
          <p className={`${SUB} mx-auto mt-6 max-w-[34rem]`}>
            Paste your product page. Clickframes writes the story, locks the characters and directs the{" "}
            <Chip>first take</Chip>. A drama ad people <Chip>watch to the end</Chip>, ready for{" "}
            <Chip>Meta Ads</Chip>, <Chip>Reels</Chip> and <Chip>TikTok</Chip>.
          </p>
          <div className="mt-6 flex items-center justify-center -space-x-2">
            {[...PHONE_FILMS, WIDE_FILM].map((film) => (
              <img
                key={film.poster}
                src={film.poster}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow-[0_0_0_3.5px_#3d5afe]"
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-[#6b7079]">Every ad on this page was one-shotted · No editors, no reshoots</p>
          <div className="mt-7 flex justify-center">
            <Cta place="hero" />
          </div>
          <p className="mt-3 text-[13px] text-[#6b7079]">{HERO.trust}</p>
        </Reveal>
      </div>
    </section>
  );
}

function PhoneShowcase() {
  const [first, second] = PHONE_FILMS;
  return (
    <section aria-label="What the ads look like" className={`${WRAP} md:max-w-[56rem]`}>
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-black/[0.06] bg-[linear-gradient(160deg,#eef1ff_0%,#f6f7f9_55%,#fff0f6_100%)]">
          <div className="grid items-center gap-10 px-6 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-12 md:py-14">
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3d5afe]">Made with Clickframes</p>
              <h2 className="mt-3 text-[2rem] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0c0c0c] sm:text-[2.5rem]">
                Two brands.
                <br />
                One take each.
              </h2>
              <ol className="mt-7 space-y-4">
                {[first, second].map((film, index) => (
                  <li key={film.title} className="flex gap-4 border-t border-black/[0.08] pt-4">
                    <span className="text-sm font-semibold tabular-nums text-[#3d5afe]">0{index + 1}</span>
                    <span>
                      <span className="block text-[15px] font-semibold text-[#0c0c0c]">{film.title}</span>
                      <span className="mt-0.5 block text-sm text-[#6b7079]">{film.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative mx-auto flex w-full max-w-[26rem] items-start justify-center gap-4 pb-16 pt-4">
              <Phone film={first} className="w-[46%]" eager />
              <Phone film={second} className="mt-14 w-[46%]" />
              <span className="absolute -left-2 top-10 z-10 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0c0c0c] shadow-[0_8px_20px_-8px_rgba(12,12,12,0.25)]">
                <span className="text-[#ff3d8b]">●</span> 0:02 · the problem
              </span>
              <span className="absolute bottom-6 right-0 z-10 rounded-full bg-[#3d5afe] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(61,90,254,0.6)]">
                0:31 · the product
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Phone({ film, className, eager = false }: { film: Film; className: string; eager?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`relative aspect-[9/19] shrink-0 rounded-[2.1rem] bg-[#16171a] p-[5px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/20 ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-black">
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover"
          poster={film.poster}
          muted
          loop
          playsInline
          preload={eager ? "auto" : "metadata"}
          aria-label={film.title}
        >
          <source src={film.mp4} type="video/mp4" />
        </video>
        <div className="absolute left-1/2 top-2 h-[18px] w-[34%] -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10 text-left">
          <p className="text-[11px] font-semibold text-white">{film.title}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-white/70">{film.text}</p>
        </div>
      </div>
    </div>
  );
}

function WhySection() {
  return (
    <section className="pt-24 sm:pt-32">
      <div className={WRAP}>
        <SectionHead
          pill="Why drama ads win"
          title={
            <>
              It doesn&apos;t feel like an ad.
              <br />
              That&apos;s why it sells.
            </>
          }
        />
        <div className="mt-10 grid gap-6 text-center sm:grid-cols-3 sm:gap-4">
          {WHY.map((item, index) => (
            <Reveal key={item.title} delay={index * 90}>
              <h3 className="text-lg font-semibold tracking-[-0.02em]">{item.title}</h3>
              <p className="mx-auto mt-2 max-w-[15rem] text-sm leading-relaxed text-[#6b7079]">{item.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
      <Reveal>
        <p aria-hidden="true" className="lp-giant mt-16 select-none text-center">
          NOBODY SKIPS
          <br />
          A PLOT TWIST.
        </p>
        <p className="mt-4 px-5 text-center text-[1.75rem] font-semibold tracking-[-0.03em] text-[#3d5afe] sm:text-[2.25rem]">
          Sell with the story, not the interruption.
        </p>
      </Reveal>
    </section>
  );
}

function StackRow() {
  const items = [...STACK, ...STACK];
  return (
    <section aria-label="What it runs on" className="pt-24">
      <p className="text-center text-xs text-[#6b7079]">What your ads run on, start to finish</p>
      <div className="lp-fade mt-5 overflow-hidden">
        <div className="land-marquee flex w-max items-center" style={{ animationDuration: "40s" }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
              {items.map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-2 px-6 text-[1.05rem] font-medium tracking-[-0.02em] text-[#3f434b]">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#0c0c0c] text-[10px] font-bold text-white">
                    {item.slice(0, 1)}
                  </span>
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CharacterLock() {
  return (
    <section className={`${WRAP} pt-16 md:max-w-[56rem]`}>
      <SectionHead
        pill="Character lock"
        title={
          <>
            One face.
            <br />
            Every single scene.
          </>
        }
        text="AI ads look cheap when the face changes every shot. Clickframes locks your characters, your product and your look from the first frame to the last. These are real frames from one of our films."
      />
      <Reveal>
        <div className="mt-10 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#ffe3ef] text-[11px] font-semibold text-[#ff3d8b]">01</span>
          <div>
            <p className="text-sm font-semibold">Same man, same dog, same product, 50 shots apart</p>
            <p className="text-xs text-[#6b7079]">
              No reference sheets to build. The lock is <Chip>part of the direction</Chip>.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {CONSISTENCY.map((shot, index) => (
            <figure key={shot.src} className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-[#f2f3f5]">
              <img src={shot.src} alt={`Don Julio and Canela, ${shot.label}`} className="aspect-[3/4] w-full object-cover" />
              <figcaption className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur">
                {shot.label}
                <span className="font-normal text-[#6b7079]">{String(index + 1).padStart(2, "0")}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Reveal>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { n: "02", title: "Your product, untouched", text: "The same can, label and color in every shot it appears in." },
          { n: "03", title: "Your look, start to finish", text: "Clay, 3D or cinematic. One style for the whole ad." },
        ].map((card, index) => (
          <Reveal key={card.n} delay={index * 90}>
            <div className="h-full rounded-2xl border border-black/[0.08] bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[#ffe3ef] text-[11px] font-semibold text-[#ff3d8b]">{card.n}</span>
                <p className="text-sm font-semibold">{card.title}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7079]">{card.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ControlRoom() {
  const [tab, setTab] = useState(0);
  const file = BRIEF_TABS[tab] ?? BRIEF_TABS[0];

  return (
    <section id="how" className={`${WRAP} scroll-mt-20 pt-32 md:max-w-[56rem]`}>
      <SectionHead
        pill="The brief, written for you"
        title={
          <>
            No prompts.
            <br />
            Every detail directed.
          </>
        }
        text="Clickframes reads your product page and writes the brief: the pain, the audience, the person, the beats and the cast. You approve it, or swap any part in one click."
      />
      <div className="mt-10 grid gap-8 md:grid-cols-[1.15fr_1fr] md:items-start">
        <Reveal className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_20px_50px_-24px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-1 border-b border-black/[0.06] px-3 py-2">
              <span className="mr-2 flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </span>
              <div role="tablist" aria-label="Brief files" className="flex min-w-0 gap-1 overflow-x-auto">
                {BRIEF_TABS.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    role="tab"
                    aria-selected={tab === index}
                    onClick={() => setTab(index)}
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
                    className={`no-press shrink-0 rounded-md px-2 py-1 text-[11px]! ${tab === index ? "bg-[#eef1ff] text-[#3d5afe]" : "text-[#6b7079] hover:text-[#0c0c0c]"}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <pre className="min-h-[300px] overflow-x-auto px-4 py-4 font-mono text-[12px] leading-[1.75]">
              {file.lines.map((line, index) => (
                <div key={`${file.name}-${index}`} className="flex gap-4">
                  <span className="w-4 shrink-0 select-none text-right text-[#b3b7bf]">{index + 1}</span>
                  <Code line={line} />
                </div>
              ))}
            </pre>
            <div className="border-t border-black/[0.06] bg-[#fafbfc] px-4 py-3 text-xs text-[#6b7079]">
              Written from a product page in seconds. Example brief.
            </div>
          </div>
        </Reveal>
        <Reveal delay={90} className="min-w-0">
          <p className="text-sm font-semibold">Your drama ad control room</p>
          <ul className="mt-3 divide-y divide-black/[0.06]">
            {CONTROL.map((item) => (
              <li key={item} className="flex gap-3 py-2.5 text-sm text-[#3f434b]">
                <span aria-hidden="true" className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#3d5afe] text-[10px] font-bold text-white">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[#6b7079]">
            Runs on <Chip>Seedance 2.5</Chip> through <Chip>KIE</Chip>. KIE bills your own key directly.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Code({ line }: { line: string }) {
  const parts = line.split(/("[^"]*")/g);
  return (
    <span className="whitespace-pre text-[#0c0c0c]">
      {parts.map((part, index) => {
        if (index % 2 === 0) return <span key={index} className="text-[#8a8f98]">{part}</span>;
        const key = /^\s*:/.test(parts[index + 1] ?? "");
        return (
          <span key={index} className={key ? "text-[#3d5afe]" : "text-[#b4237a]"}>
            {part}
          </span>
        );
      })}
    </span>
  );
}

function Feeds() {
  const dearest = Math.max(...RENDER_COMPARE.map((row) => row.price));
  return (
    <section className={`${WRAP} pt-32 md:max-w-[56rem]`}>
      <SectionHead
        pill="Where it runs"
        title={
          <>
            One ad.
            <br />
            Every feed.
          </>
        }
        text="Run it paid, post it organic. Each feed has its own audience, so ship the same story everywhere and let the numbers pick the winner."
      />
      <Reveal>
        <div className="relative mt-10 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-black">
          <video className="aspect-video w-full object-cover" poster={WIDE_FILM.poster} muted loop playsInline autoPlay preload="metadata" aria-label={WIDE_FILM.title}>
            <source src={WIDE_FILM.mp4} type="video/mp4" />
          </video>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-12">
            <p className="text-sm font-semibold text-white">{WIDE_FILM.title} · 16:9</p>
            <p className="text-xs text-white/75">{WIDE_FILM.text}</p>
          </div>
        </div>
      </Reveal>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {FEEDS.map((feed, index) => (
          <Reveal key={feed.name} delay={index * 80}>
            <div className="h-full rounded-2xl border border-black/[0.08] bg-white p-5">
              <p className="text-sm font-semibold">{feed.name}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#6b7079]">{feed.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="mt-20 rounded-[1.75rem] bg-[#f6f7f9] p-6 sm:p-8">
          <h3 className="text-[1.9rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[2.4rem]">
            You pay the model.
            <br />
            Not the markup.
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#3f434b]">
            Credit platforms resell the same video models at their own price, and every take you throw away costs the same as a good one. Clickframes renders on <Chip>your own KIE key</Chip> at the model&apos;s price. You pay us only for the direction that makes the first take the ad.
          </p>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7079]">A 5-minute film, one pass</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {RENDER_COMPARE.map((row) => (
              <article key={row.name} className={`rounded-2xl border bg-white p-5 ${row.yours ? "border-[#3d5afe] shadow-[0_10px_30px_-12px_rgba(61,90,254,0.45)]" : "border-black/[0.08]"}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-semibold">{row.name}</h4>
                  <p className="text-[1.9rem] font-semibold tabular-nums tracking-[-0.03em]">{money(row.price)}</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eef0f3]">
                  <div className={`h-full rounded-full ${row.yours ? "bg-[#3d5afe]" : "bg-[#b3b7bf]"}`} style={{ width: `${Math.round((row.price / dearest) * 100)}%` }} />
                </div>
                <p className="mt-3 text-sm text-[#6b7079]">{row.note}</p>
                <p className="mt-1 text-xs tabular-nums text-[#6b7079]">Three passes: {money(row.price * 3)}</p>
              </article>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function money(price: number) {
  return price.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Pricing() {
  const [index, setIndex] = useState(0);
  const pick = LANDING_MINUTES[index] || LANDING_MINUTES[0];

  function choose(next: number) {
    setIndex(next);
    const plan = LANDING_MINUTES[next];
    if (plan) track("membership_minutes", { minutes: String(plan.minutes), price: String(plan.price) });
  }

  return (
    <section id="pricing" className={`${WRAP} scroll-mt-20 pt-32 md:max-w-[56rem]`}>
      <SectionHead pill="Pricing" title="Your next winning ad." text="The full workflow, every month. The render stays on your KIE key, at the model's price." />
      <div className="mt-12 grid gap-10 md:grid-cols-[1.05fr_1fr] md:items-center">
        <Reveal>
          <article className="lp-plan rounded-[1.6rem] border border-[#3d5afe]/30 p-6 shadow-[0_30px_60px_-30px_rgba(61,90,254,0.5)]">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Clickframes membership</h3>
              <span className="rounded-md bg-[#3d5afe] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">For brands</span>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em]">{pick.minutes} min</p>
                <p className="mt-1 text-xs text-[#6b7079]">of finished video each month</p>
              </div>
              <div className="text-right">
                <p className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{money(pick.price)}</p>
                <p className="mt-1 text-xs text-[#6b7079]">billed monthly</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Minutes of video per month">
              {LANDING_MINUTES.map((plan, planIndex) => {
                const on = planIndex === index;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(planIndex)}
                    className={`rounded-xl border px-1 py-3 text-center ${on ? "border-[#3d5afe] bg-[#3d5afe] text-white" : "border-black/[0.08] bg-white text-[#3f434b] hover:border-black/20"}`}
                  >
                    <span className="block text-lg font-semibold tabular-nums">{plan.minutes}</span>
                    <span className="block text-[10px] uppercase tracking-[0.12em] opacity-80">min</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                track("membership_checkout_click", { minutes: String(pick.minutes), price: String(pick.price) });
                void startCheckout(pick.id).catch(() => undefined);
              }}
              className="btn-primary lp-cta mt-6 w-full justify-center gap-2 rounded-2xl py-3.5 text-base! font-bold! text-white"
            >
              Get this membership <span aria-hidden="true">→</span>
            </button>
            <p className="mt-2 text-center text-xs text-[#6b7079]">Instant access · You own every ad</p>
            <ul className="mt-5 space-y-2 rounded-xl bg-white/70 p-4 text-sm text-[#3f434b] ring-1 ring-black/[0.05]">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-[#3d5afe]">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-center">
              <MoreMinutes />
            </div>
          </article>
        </Reveal>
        <Reveal delay={90}>
          <p className="text-sm font-semibold">How it works</p>
          <ol className="mt-3 divide-y divide-black/[0.06] border-y border-black/[0.06]">
            {[
              { title: "Paste your product page", text: "Or write the idea the way you would tell a friend." },
              { title: "Approve the story", text: "Pain, audience and person. Swap any of them in one click." },
              { title: "Render on your KIE key", text: "About 10 minutes. The first take is the ad, or 90% of it." },
            ].map((item, index) => (
              <li key={item.title} className="flex gap-4 py-4">
                <span className="text-sm tabular-nums text-[#b3b7bf]">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-sm text-[#6b7079]">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#6b7079]">
            <span>⚡ Instant access</span>
            <span>🔑 Your own KIE key</span>
            <span>🔒 Secure checkout</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const MINUTE_FIELD =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm text-[#0c0c0c] outline-none transition-colors placeholder:text-black/30 focus:border-[#3d5afe]";

function MoreMinutes() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (sending) return;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, sending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const minutes = Number(form.get("minutes"));
    const name = String(form.get("name") || "").trim();
    const brand = String(form.get("brand") || "").trim();
    const email = String(form.get("email") || "").trim();
    const website = String(form.get("website") || "");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, name, brand, email, website }),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.status !== 502 || website) {
        setError(payload.error || "Couldn't send that. Try again.");
        return;
      }
      const direct = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_EMAIL)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          brand: brand || "None",
          minutes: String(minutes),
          _subject: `More minutes: ${minutes} for ${name}`,
          _template: "table",
          _captcha: "false",
          _replyto: email,
        }),
      });
      const result = (await direct.json().catch(() => null)) as { success?: string | boolean } | null;
      if (direct.ok && (result?.success === true || result?.success === "true")) {
        setSent(true);
        return;
      }
      setError(payload.error || "Couldn't send that. Try again.");
    } catch {
      setError("Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm! font-medium! text-[#3d5afe] hover:underline">
        Need more than 60 minutes?
      </button>
      {open
        ? createPortal(
            <div className="lp fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={close}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="more-minutes-title"
                className="w-full max-w-[440px] rounded-3xl bg-white p-6 text-[#0c0c0c] shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b7079]">Membership</p>
                    <h3 id="more-minutes-title" className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                      More than 60 minutes
                    </h3>
                  </div>
                  <button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-xl! leading-none text-[#6b7079] hover:bg-black/5">
                    ×
                  </button>
                </div>
                {sent ? (
                  <div className="mt-6">
                    <p className="text-sm leading-relaxed">Sent. We&apos;ll reply to that email.</p>
                    <button type="button" onClick={close} className="btn-primary lp-cta mt-6 rounded-xl px-5 py-2.5 text-sm! font-semibold! text-white">
                      Close
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
                    <p className="text-sm leading-relaxed text-[#6b7079]">Tell us how many minutes you need. We reply to the email you leave here.</p>
                    <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                    <label className="block text-xs text-[#6b7079]">
                      Minutes you need
                      <input name="minutes" type="number" min={61} max={100000} required placeholder="120" autoFocus className={MINUTE_FIELD} />
                    </label>
                    <label className="block text-xs text-[#6b7079]">
                      Name
                      <input name="name" required maxLength={80} autoComplete="name" className={MINUTE_FIELD} />
                    </label>
                    <label className="block text-xs text-[#6b7079]">
                      Brand
                      <input name="brand" maxLength={80} autoComplete="organization" className={MINUTE_FIELD} />
                    </label>
                    <label className="block text-xs text-[#6b7079]">
                      Email
                      <input name="email" type="email" required maxLength={120} autoComplete="email" className={MINUTE_FIELD} />
                    </label>
                    {error ? <p className="text-sm text-[#dc2626]">{error}</p> : null}
                    <div className="mt-1 flex items-center gap-3">
                      <button type="submit" disabled={sending} className="btn-primary lp-cta rounded-xl px-5 py-2.5 text-sm! font-semibold! text-white disabled:opacity-50">
                        {sending ? "Sending" : "Send"}
                      </button>
                      <button type="button" onClick={close} className="text-sm! text-[#6b7079] hover:text-[#0c0c0c]">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Faq() {
  const [open, setOpen] = useState<string | null>(FAQ[0]?.q ?? null);
  return (
    <section id="faq" className={`${WRAP} scroll-mt-20 pt-32`}>
      <Reveal className="text-center">
        <h2 className={H2}>
          Got questions?
          <br />
          We&apos;ve got answers.
        </h2>
      </Reveal>
      <div className="mt-10 space-y-2">
        {FAQ.map((item) => {
          const shown = open === item.q;
          return (
            <div key={item.q} className={`rounded-2xl border transition-colors ${shown ? "border-black/[0.08] bg-[#f6f7f9]" : "border-black/[0.06] bg-white"}`}>
              <h3>
                <button
                  type="button"
                  className="no-press flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[0.98rem]! font-semibold! tracking-[-0.01em]"
                  aria-expanded={shown}
                  onClick={() => {
                    setOpen(shown ? null : item.q);
                    if (!shown) track("faq_open", { question: item.q });
                  }}
                >
                  {item.q}
                  <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[#3d5afe] ring-1 ring-black/[0.08] transition-transform ${shown ? "rotate-45" : ""}`}>
                    +
                  </span>
                </button>
              </h3>
              {shown ? <p className="px-5 pb-5 text-sm leading-relaxed text-[#3f434b]">{item.a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={`${WRAP} pb-24 pt-32 text-center`}>
      <Reveal>
        <h2 className={H2}>
          Your next winning ad
          <br />
          can run tonight.
        </h2>
        <p className={`${SUB} mx-auto mt-4 max-w-md`}>
          Paste the page, approve the story, render the take. Tomorrow, read the numbers and make the next one.
        </p>
        <div className="mt-8 flex justify-center">
          <Cta place="final" />
        </div>
        <p className="mt-3 text-[13px] text-[#6b7079]">About 10 minutes · Your own KIE key · You own every ad</p>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-black/[0.06] bg-[#fafbfc]">
      <div className={`${WRAP} py-12 md:max-w-[56rem]`}>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <a href="#top" className="flex items-center gap-2">
              <Mark className="h-7 w-7" />
              <span className="font-semibold tracking-[-0.04em]">clickframes</span>
            </a>
            <p className="mt-2 text-sm text-[#6b7079]">Drama ads that sell. One-shotted.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-[#3f434b]">
            <a href="#how" className="hover:text-[#0c0c0c]">How it works</a>
            <a href="#pricing" className="hover:text-[#0c0c0c]">Pricing</a>
            <a href="#faq" className="hover:text-[#0c0c0c]">FAQ</a>
            <a href="/login" className="hover:text-[#0c0c0c]">Log in</a>
            <a href="/privacy" className="hover:text-[#0c0c0c]">Privacy</a>
            <a href="/terms" className="hover:text-[#0c0c0c]">Terms</a>
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-[#6b7079]">
          <span>© 2026 Clickframes. All rights reserved.</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#0c0c0c]">{CONTACT_EMAIL}</a>
        </div>
      </div>
    </footer>
  );
}
