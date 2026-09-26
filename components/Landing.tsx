import { PLANS } from "@/lib/plans";

function money(price: number) {
  return price.toFixed(2);
}

export function Landing() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-8 md:px-8">
      <header className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--accent)]">distribute.to</p>
        <a href="/login" className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium">
          Sign in
        </a>
      </header>

      <section className="max-w-2xl pt-16 md:pt-24">
        <h1 className="display text-5xl leading-[0.95] md:text-7xl">Scripts into Pixar and claymation shorts.</h1>
        <p className="mt-5 max-w-xl text-lg leading-7 text-[var(--muted)]">
          Buy credits once. Use them whenever you want. No monthly plan.
        </p>
        <a href="#pricing" className="btn-primary mt-8 inline-flex rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-medium text-white">
          Buy credits
        </a>
      </section>

      <section id="pricing" className="grid gap-4 py-20 sm:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`flex flex-col rounded-3xl border bg-white p-5 ${plan.featured ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              {plan.name}
              {plan.featured ? " · popular" : ""}
            </p>
            <p className="display mt-3 text-4xl">${money(plan.price)}</p>
            <p className="mt-1 text-sm font-medium">{plan.seconds} credits</p>
            <p className="mt-2 flex-1 text-sm text-[var(--muted)]">{plan.blurb}</p>
            <a
              href={`/login?next=/checkout/${plan.id}`}
              className="btn-primary mt-6 rounded-full bg-[var(--ink)] px-4 py-2.5 text-center text-sm font-medium text-white"
            >
              Pay with Whop
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}
