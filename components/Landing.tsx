"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { DFY_PLANS, INTRO_OFFER, PLANS, type Plan } from "@/lib/plans";
import { createClient } from "@/lib/supabase/client";
import { CANONICAL_ORIGIN } from "@/lib/site";

type Audience = "personal" | "brands";

const OFFER_WAIT_MS = 30_000;
const OFFER_LIFE_MS = 60_000;

const COPY = {
  personal: {
    label: "Personal",
    eyebrow: "For anyone",
    title: "A million-dollar look, in one shot.",
    lead: "A finished animation. Nothing left to edit.",
    cta: "Buy credits",
  },
  brands: {
    label: "Brands",
    eyebrow: "For your brand",
    title: "A million-dollar ad, in one shot.",
    lead: "For your brand. Nothing left to edit.",
    cta: "See plans",
  },
} as const;

export function Landing() {
  const [audience, setAudience] = useState<Audience>("personal");
  const [offer, setOffer] = useState(false);
  const [left, setLeft] = useState(1);
  const [busyPlan, setBusyPlan] = useState("");
  const copy = COPY[audience];

  useEffect(() => {
    if (sessionStorage.getItem("cf-intro-offer")) return;
    const timer = window.setTimeout(() => setOffer(true), OFFER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!offer) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const ratio = Math.max(0, 1 - (Date.now() - start) / OFFER_LIFE_MS);
      setLeft(ratio);
      if (ratio <= 0) {
        window.clearInterval(timer);
        sessionStorage.setItem("cf-intro-offer", "1");
        setOffer(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [offer]);

  function dismissOffer() {
    sessionStorage.setItem("cf-intro-offer", "1");
    setOffer(false);
  }

  async function startCheckout(planId: string) {
    setBusyPlan(planId);
    const next = `/checkout/${planId}`;
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      window.location.href = next;
      return;
    }
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const origin = local ? window.location.origin : CANONICAL_ORIGIN;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setBusyPlan("");
  }

  return (
    <main className="library-shell min-h-screen overflow-x-hidden text-[var(--cf-ink)]">
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#ff8a3d]/20 blur-3xl land-orb" />
        <div
          className="pointer-events-none absolute right-0 top-48 h-80 w-80 rounded-full bg-[#ff5e62]/15 blur-3xl land-orb"
          style={{ animationDelay: "-6s" }}
        />

        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 py-3">
          <Brand tone="accent" />
          <nav className="flex items-center gap-2.5">
            <a href="#pricing" className="inline-flex items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white">
              Pricing
            </a>
            <a href="/login" className="cf-btn btn-primary inline-flex items-center px-4 py-2 text-sm font-semibold">
              Sign in
            </a>
          </nav>
        </header>

        <section className="grid items-start gap-8 pb-8 pt-2 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex rounded-xl bg-white/5 p-1">
              {(["personal", "brands"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAudience(item)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                    audience === item ? "cf-grad text-white" : "text-[var(--cf-muted)]"
                  }`}
                >
                  {COPY[item].label}
                </button>
              ))}
            </div>
            <div key={audience} className="rise-in">
              <p className="mt-5 text-sm font-medium text-[#ffb089]">{copy.eyebrow}</p>
              <h1 className="display mt-2 min-h-[2.8em] max-w-xl text-4xl leading-[0.95] tracking-tight sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-4 min-h-12 max-w-sm text-lg text-[var(--cf-muted)]">{copy.lead}</p>
              <div className="mt-5">
                <a href="#pricing" className="cf-btn btn-primary px-5 py-3 text-sm font-semibold">
                  {copy.cta}
                </a>
              </div>
            </div>
          </div>
          <FilmSlot
            id="hero"
            label="Hero"
            note="Your animation goes here."
            ratio="aspect-[4/5] max-h-[calc(100vh-6.5rem)]"
          />
        </section>

        <div className="overflow-hidden border-y border-white/10 py-4">
          <div className="land-marquee flex w-max gap-8 text-xs uppercase tracking-[0.22em] text-[var(--cf-muted)]">
            {Array.from({ length: 2 }).map((_, copyIndex) => (
              <p key={copyIndex} className="flex gap-8">
                {["One shot", "For your brand", "Pixar", "Claymation", "A gift", "First try"].map((word) => (
                  <span key={`${copyIndex}-${word}`}>{word}</span>
                ))}
              </p>
            ))}
          </div>
        </div>

        <Reveal className="grid items-center gap-10 py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-[#ffb089]">The look</p>
            <h2 className="display mt-3 text-4xl leading-none tracking-tight sm:text-5xl">
              A million-dollar look. A few dollars.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--cf-muted)]">
              It looks like a production with a huge budget, and it costs a few dollars. One shot, for a person or for your brand.
            </p>
          </div>
          <FilmSlot id="studio" label="Studio look" note="A finished frame, the kind you would expect from a big production." />
        </Reveal>

        {audience === "personal" ? <PersonalStory onBuy={(id) => void startCheckout(id)} busy={busyPlan} /> : <BrandStory />}

        <section id="animations" className="py-8">
          <Reveal>
            <p className="text-sm font-medium text-[#ffb089]">Animations</p>
            <h2 className="display mt-3 max-w-xl text-4xl tracking-tight">Your animations live here.</h2>
            <p className="mt-3 max-w-lg text-[var(--cf-muted)]">
              Three slots, ready for the shorts you want on this page.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FilmSlot id="reel-pixar" label="Pixar" note="A character short." />
            <FilmSlot id="reel-clay" label="Claymation" note="A handmade world." />
            <FilmSlot id="reel-gift" label="A gift" note="Someone's face, in a new style." />
          </div>
        </section>

        <section className="grid gap-4 py-16 sm:grid-cols-3">
          {[
            ["01", "Paste the script", "Or drop in a Suno song. We read the story before anything is generated."],
            ["02", "Lock the look", "Characters, products, places, and logos stay the same from shot to shot."],
            ["03", "Ship the animation", "Pixar or claymation, cut to length, with the voices already in the picture."],
          ].map(([step, title, body]) => (
            <Reveal key={step} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
              <p className="text-xs font-medium text-[#ffb089]">{step}</p>
              <h2 className="mt-4 text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{body}</p>
            </Reveal>
          ))}
        </section>

        <section id="pricing" className="border-t border-white/10 py-20">
          {audience === "brands" ? (
            <>
              <p className="text-sm font-medium text-[#ffb089]">Two ways to work</p>
              <h2 className="display mt-2 text-4xl tracking-tight sm:text-5xl">Do it yourself, or done for you.</h2>
              <p className="mt-3 max-w-lg text-[var(--cf-muted)]">
                Run the studio on credits, or hand us the month. Click a plan, create your account with Google, pay on Whop, and land in the studio.
              </p>
              <h3 className="mt-12 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">DIY. Do it yourself</h3>
              <p className="mt-2 text-sm text-[var(--cf-muted)]">The credit packs. You make the animations.</p>
              <PlanGrid plans={PLANS} busy={busyPlan} onBuy={(id) => void startCheckout(id)} />
              <h3 className="mt-14 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--cf-muted)]">DFY. Done for you</h3>
              <p className="mt-2 text-sm text-[var(--cf-muted)]">A monthly crew. Billed every 30 days.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {DFY_PLANS.map((plan) => (
                  <article
                    key={plan.id}
                    className={`rounded-3xl p-6 ${plan.featured ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}
                  >
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-2 text-4xl font-semibold">
                      ${plan.price.toLocaleString("en-US")}
                      <span className="text-base font-medium opacity-80"> / month</span>
                    </p>
                    <p className={`mt-3 text-sm leading-relaxed ${plan.featured ? "text-white/90" : "text-[var(--cf-muted)]"}`}>
                      {plan.blurb}
                    </p>
                    <button
                      type="button"
                      onClick={() => void startCheckout(plan.id)}
                      className={`btn-primary mt-6 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                        plan.featured ? "bg-white text-black" : "cf-btn text-white"
                      }`}
                    >
                      {busyPlan === plan.id ? "Opening…" : "Subscribe with Whop"}
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[#ffb089]">Credits</p>
              <h2 className="display mt-2 text-4xl tracking-tight sm:text-5xl">Buy the minutes. Keep the animation.</h2>
              <p className="mt-3 max-w-lg text-[var(--cf-muted)]">
                One payment on Whop. Create your account with Google, pay, and you are in the studio.
              </p>
              <PlanGrid plans={PLANS} busy={busyPlan} onBuy={(id) => void startCheckout(id)} />
            </>
          )}
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 py-8 text-xs text-[var(--cf-muted)]">
          <span>Clickframes</span>
          <span>{audience === "brands" ? "Credits, or a monthly crew." : "Credits, not a subscription."}</span>
        </footer>
      </div>

      {offer ? (
        <div className="fixed inset-0 z-[80] bg-black/75">
          <div className="h-1.5 bg-white/10">
            <div
              className="cf-grad h-full origin-left"
              style={{ width: `${Math.max(left, 0) * 100}%` }}
            />
          </div>
          <div className="grid h-[calc(100%-0.375rem)] place-items-center px-6">
            <div className="theater-in w-full max-w-md rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffb089]">Exclusive offer for you</p>
              <h2 className="display mt-3 text-3xl leading-none tracking-tight">
                Create your first 30 second video for $4.99.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--cf-muted)]">See that we are not playing.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void startCheckout(INTRO_OFFER.id)}
                  className="cf-btn btn-primary px-4 py-2.5 text-sm font-semibold"
                >
                  {busyPlan === INTRO_OFFER.id ? "Opening Google…" : "Get it for $4.99"}
                </button>
                <button
                  type="button"
                  onClick={dismissOffer}
                  className="rounded-xl border border-white/15 px-4 py-2.5 text-sm"
                >
                  Not now
                </button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--cf-muted)]">
                Google creates your account. Whop takes the payment. Then you land in the studio.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PersonalStory({ onBuy, busy }: { onBuy: (id: string) => void; busy: string }) {
  return (
    <>
      <StoryRow
        eyebrow="No edit"
        title="It comes out finished."
        body="The latest video models do the work. It does not look like a cheap AI clip, and you do not open an editor after it."
        film={{ id: "personal-finish", label: "Finished cut", note: "A short that needs nothing after the generation." }}
      />
      <StoryRow
        flip
        eyebrow="A gift"
        title="Make it a gift."
        body="Add a photo of someone and we put them in any style. Pixar, clay, or the look you describe. An animation they can keep."
        film={{ id: "personal-gift", label: "Gift", note: "Their photo, adapted to the style you choose." }}
      />
      <Reveal className="mb-16 rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6 sm:p-8">
        <p className="text-sm font-medium text-[#ffb089]">Start with one</p>
        <h2 className="display mt-2 text-3xl tracking-tight">Your first 30 seconds is $4.99.</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--cf-muted)]">
          See that we are not playing. The offer also finds you on its own after a moment on this page.
        </p>
        <button type="button" onClick={() => onBuy(INTRO_OFFER.id)} className="cf-btn btn-primary mt-6 px-4 py-2.5 text-sm font-semibold">
          {busy === INTRO_OFFER.id ? "Opening Google…" : "Get it for $4.99"}
        </button>
      </Reveal>
    </>
  );
}

function BrandStory() {
  const cards = [
    ["Ready to run as an ad", "For your brand, the first generation is the spot you publish. You do not hire an editor to save it."],
    ["It lands the first time", "About 99% of the time there is no second pass. You are not stuck making it again."],
    ["More detail, a better picture", "The more you put in the script or storyboard, the better it looks. We still go for the best result."],
    ["It does not read as AI", "Built on the latest models. If someone notices, it will not matter. It is made well."],
  ];
  return (
    <section className="py-8">
      <Reveal>
        <p className="text-sm font-medium text-[#ffb089]">For a brand</p>
        <h2 className="display mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">For your brand, the first generation is ready to run.</h2>
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {cards.map(([title, body]) => (
          <Reveal key={title} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-6">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cf-muted)]">{body}</p>
          </Reveal>
        ))}
      </div>
      <div className="mt-4">
        <FilmSlot id="brand-spot" label="Brand" note="A product spot that looks finished on the first generation." ratio="aspect-[16/7]" />
      </div>
    </section>
  );
}

function StoryRow({
  eyebrow,
  title,
  body,
  film,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  film: { id: string; label: string; note: string };
  flip?: boolean;
}) {
  return (
    <Reveal className={`grid items-center gap-10 py-12 lg:grid-cols-2 ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <p className="text-sm font-medium text-[#ffb089]">{eyebrow}</p>
        <h2 className="display mt-3 text-4xl tracking-tight">{title}</h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--cf-muted)]">{body}</p>
      </div>
      <FilmSlot id={film.id} label={film.label} note={film.note} />
    </Reveal>
  );
}

function FilmSlot({
  id,
  label,
  note,
  src,
  ratio = "aspect-video",
}: {
  id: string;
  label: string;
  note: string;
  src?: string;
  ratio?: string;
}) {
  return (
    <figure
      data-film={id}
      className={`cf-card relative overflow-hidden rounded-3xl border border-white/10 bg-[#101014] shadow-[0_24px_60px_rgba(0,0,0,0.35)] ${ratio}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,138,61,0.18),transparent_42%)]" />
      {src ? (
        <video className="relative h-full w-full object-cover" src={src} controls playsInline />
      ) : (
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[var(--cf-muted)]">
            <span>{label}</span>
            <span>Your animation</span>
          </div>
          <span className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-black/40">
            <span className="ml-1 block h-0 w-0 border-y-8 border-l-[14px] border-y-transparent border-l-white" />
          </span>
          <p className="max-w-xs text-sm text-[var(--cf-muted)]">{note}</p>
        </div>
      )}
    </figure>
  );
}

function PlanGrid({ plans, onBuy, busy }: { plans: Plan[]; onBuy: (id: string) => void; busy: string }) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {plans.map((plan) => (
        <article
          key={plan.id}
          className={`flex flex-col rounded-3xl p-5 ${plan.featured ? "cf-grad text-white" : "border border-white/10 bg-[var(--cf-surface)]"}`}
        >
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <p className="mt-3 text-3xl font-semibold">${plan.price}</p>
          <p className={`mt-1 text-sm font-medium ${plan.featured ? "text-white/80" : ""}`}>{plan.seconds} credits</p>
          <p className={`mt-3 flex-1 text-sm leading-relaxed ${plan.featured ? "text-white/80" : "text-[var(--cf-muted)]"}`}>
            {plan.blurb}
          </p>
          <button
            type="button"
            onClick={() => onBuy(plan.id)}
            className={`btn-primary mt-6 rounded-xl px-4 py-2 text-sm font-semibold ${
              plan.featured ? "bg-white text-black" : "cf-btn text-white"
            }`}
          >
            {busy === plan.id ? "Opening…" : "Pay with Whop"}
          </button>
        </article>
      ))}
    </div>
  );
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setShown(true);
      },
      { threshold: 0.16 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} ${shown ? "rise-in" : "translate-y-3 opacity-0"}`}>
      {children}
    </div>
  );
}
