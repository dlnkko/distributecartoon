import { Brand } from "@/components/Brand";
import { PLANS } from "@/lib/plans";

function money(price: number) {
  return price.toFixed(2);
}

const STEPS = [
  { n: "01", title: "Add the script", text: "Paste a story or drop in a PDF. The film follows that text." },
  { n: "02", title: "Cast the characters", text: "Name who is who, describe the look, or add a photo." },
  { n: "03", title: "Get the short", text: "Pixar or claymation, in the length you picked." },
];

export function Landing() {
  return (
    <main className="library-shell min-h-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-6 md:px-8 md:py-8">
        <header className="flex items-center justify-between gap-4">
          <Brand tone="accent" />
          <div className="flex items-center gap-2">
            <a href="#pricing" className="hidden rounded-full px-3 py-2 text-sm text-[var(--cf-muted)] hover:text-white sm:inline">
              Credits
            </a>
            <a
              href="/login"
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Sign in
            </a>
          </div>
        </header>

        <section className="rise-in grid items-end gap-10 pt-16 md:grid-cols-[1.2fr_0.8fr] md:pt-24">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#FF8A3D]">Clickframes</p>
            <h1 className="display mt-4 max-w-xl text-5xl leading-[0.92] tracking-[-0.04em] md:text-7xl">
              Scripts into Pixar and claymation shorts.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-7 text-[var(--cf-muted)]">
              Buy credits once. Use them whenever you want. No monthly plan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#pricing"
                className="rounded-full bg-[linear-gradient(135deg,#FF8A3D,#FF5E62)] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_28px_rgba(255,94,98,0.28)]"
              >
                Buy credits
              </a>
              <a href="/login" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white hover:bg-white/10">
                Open the studio
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[32px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,138,61,0.35),transparent_55%)] blur-2xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[var(--cf-surface)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[var(--cf-muted)]">
                <span>Preview</span>
                <span>16:9</span>
              </div>
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#101013]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,94,98,0.45),transparent_42%),linear-gradient(160deg,#1a120e_0%,#0b0b0d_70%)]" />
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="display text-2xl leading-none">Your next short</p>
                  <p className="mt-2 text-xs text-white/70">Script, cast, then the film.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 py-16 md:grid-cols-3">
          {STEPS.map((step) => (
            <article key={step.n} className="rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-5">
              <p className="text-[11px] font-medium tracking-[0.16em] text-[#FF8A3D]">{step.n}</p>
              <h2 className="display mt-3 text-2xl">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--cf-muted)]">{step.text}</p>
            </article>
          ))}
        </section>

        <section id="pricing" className="pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#FF8A3D]">Credits</p>
              <h2 className="display mt-2 text-4xl tracking-[-0.04em]">Pay once. Keep the minutes.</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PLANS.map((plan) => (
              <article
                key={plan.id}
                className={
                  plan.featured
                    ? "rounded-3xl bg-[linear-gradient(135deg,#FF8A3D,#FF5E62)] p-px shadow-[0_16px_40px_rgba(255,94,98,0.22)]"
                    : "rounded-3xl border border-white/10 bg-[var(--cf-surface)]"
                }
              >
                <div className={`flex h-full flex-col rounded-[22px] p-5 ${plan.featured ? "bg-[#16120f]" : ""}`}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--cf-muted)]">
                    {plan.name}
                    {plan.featured ? " · popular" : ""}
                  </p>
                  <p className="display mt-3 text-4xl">${money(plan.price)}</p>
                  <p className="mt-1 text-sm font-medium">{plan.seconds} credits</p>
                  <p className="mt-2 flex-1 text-sm text-[var(--cf-muted)]">{plan.blurb}</p>
                  <a
                    href={`/login?next=/checkout/${plan.id}`}
                    className={`mt-6 rounded-full px-4 py-2.5 text-center text-sm font-medium ${
                      plan.featured
                        ? "bg-[linear-gradient(135deg,#FF8A3D,#FF5E62)] text-white shadow-[0_10px_28px_rgba(255,94,98,0.28)]"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    Pay with Whop
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 py-6 text-xs text-[var(--cf-muted)]">
          <Brand tone="accent" compact />
          <span>Credits, not a subscription.</span>
        </footer>
      </div>
    </main>
  );
}
