"use client";

import { useEffect, useState } from "react";
import { DurationField } from "@/components/DurationField";
import type { SavedProduct } from "@/lib/saved-products";
import type { DialogueLanguage, Project } from "@/lib/types";

function BriefField({
  id,
  label,
  value,
  maxLength,
  rows,
  busy,
  disabled,
  onChange,
  onVary,
}: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  rows: number;
  busy: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onVary: () => void;
}) {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <button
          type="button"
          onClick={onVary}
          disabled={disabled}
          className="btn-secondary shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Writing…" : "Variation"}
        </button>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={rows}
        className="mt-2 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface-2)] px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

function mediaSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

export function StoriesPanel({
  onOpen,
  onProducts,
}: {
  onOpen: (project: Project) => void;
  onProducts: () => void;
}) {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [pain, setPain] = useState("");
  const [audience, setAudience] = useState("");
  const [who, setWho] = useState("");
  const [page, setPage] = useState("");
  const [ready, setReady] = useState(false);
  const [seconds, setSeconds] = useState<number>(30);
  const [language, setLanguage] = useState<DialogueLanguage>("english");
  const [busy, setBusy] = useState<"" | "read" | "approve" | "pain" | "audience" | "person">("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const res = await fetch("/api/products");
      const json = (await res.json().catch(() => ({}))) as { products?: SavedProduct[]; error?: string };
      if (cancel) return;
      if (!res.ok) {
        setError(json.error || "Couldn't load products.");
        setLoaded(true);
        return;
      }
      const list = json.products || [];
      setProducts(list);
      setProductId((current) => current || list[0]?.id || "");
      setLoaded(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function clearBrief() {
    setPain("");
    setAudience("");
    setWho("");
    setPage("");
    setReady(false);
  }

  async function readPage() {
    if (!productId || busy) return;
    setBusy("read");
    setError("");
    clearBrief();
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, language }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      pain?: string;
      audience?: string;
      person?: string;
      page?: string;
      error?: string;
    };
    setBusy("");
    if (!res.ok || !json.pain) {
      setError(json.error || "Couldn't read that page.");
      return;
    }
    setPain(json.pain);
    setAudience(json.audience || "");
    setWho(json.person || "");
    setPage(json.page || "");
    setReady(true);
  }

  async function vary(field: "pain" | "audience" | "person") {
    if (!productId || !ready || busy) return;
    setBusy(field);
    setError("");
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({ action: "vary", productId, field, pain, audience, who, page, language }),
      });
      const json = (await res.json().catch(() => ({}))) as { pain?: string; audience?: string; person?: string; error?: string };
      const painNext = json.pain?.trim() || "";
      const audienceNext = json.audience?.trim() || "";
      const personNext = json.person?.trim() || "";
      const readyShift = field === "pain" ? painNext && audienceNext && personNext : field === "audience" ? audienceNext && personNext : personNext;
      if (!res.ok || !readyShift) {
        setError(json.error || "Couldn't write another version.");
        return;
      }
      if (painNext) setPain(painNext);
      if (audienceNext) setAudience(audienceNext);
      if (personNext) setWho(personNext);
    } catch {
      setError("Couldn't write another version.");
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    if (!productId || !ready || busy) return;
    setBusy("approve");
    setError("");
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", productId, pain, audience, who, page, seconds, language }),
    });
    const json = (await res.json().catch(() => ({}))) as { project?: Project; error?: string };
    setBusy("");
    if (!res.ok || !json.project) {
      setError(json.error || "Couldn't write that story.");
      return;
    }
    onOpen(json.project);
  }

  if (loaded && products.length === 0) {
    return (
      <div className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] px-6 py-16 text-center">
        <p className="display text-3xl">No products yet</p>
        <p className="mt-2 max-w-sm text-sm text-[var(--cf-muted)]">Save a product with its page, then a story can start from it.</p>
        <button type="button" onClick={onProducts} className="btn-primary mt-6 min-h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white">
          Add a product
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 sm:p-5">
        <p className="text-sm font-medium">Product</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {products.map((product) => {
            const selected = product.id === productId;
            const photo = product.photos[0]?.path || product.imagePath;
            return (
              <button
                key={product.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setProductId(product.id);
                  clearBrief();
                }}
                className={`no-press flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? "border-[#5b6cff] bg-[rgba(61,90,254,0.12)]" : "border-[var(--cf-line)] bg-black/[0.04] hover:bg-black/[0.06]"}`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(photo)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-black/[0.06] text-xs text-[var(--cf-muted)]">Page</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block truncate text-xs text-[var(--cf-muted)]">{product.pageUrl || "No page saved"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 sm:p-5">
        <p className="text-sm font-medium">Duration</p>
        <div className="mt-3">
          <DurationField value={seconds} disabled={Boolean(busy)} onChange={setSeconds} />
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium">Language</p>
          <p className="mt-0.5 text-xs text-[var(--cf-muted)]">You choose this. The page suggestions follow it.</p>
          <div className="mt-2 flex w-fit rounded-xl bg-black/[0.04] p-[3px]" role="group" aria-label="Story language">
            {(["english", "spanish"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={language === item}
                onClick={() => {
                  setLanguage(item);
                  clearBrief();
                }}
                className={`min-h-9 rounded-lg px-4 text-sm capitalize ${language === item ? "bg-black/[0.06] text-[var(--cf-ink)]" : "text-[var(--cf-muted)]"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void readPage()}
          disabled={!productId || Boolean(busy)}
          className="btn-primary mt-5 min-h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "read" ? "Reading the page…" : ready ? "Read the page again" : "Read the page"}
        </button>
      </section>

      {ready ? (
        <section className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 sm:p-5">
          <p className="text-sm font-medium">From the page</p>
          <p className="mt-0.5 text-xs text-[var(--cf-muted)]">A new pain point rewrites the audience and who it follows. A new audience rewrites who it follows. Then approve.</p>
          <div className="mt-4 grid gap-4">
            <BriefField
              id="story-pain"
              label="Pain point"
              value={pain}
              maxLength={400}
              rows={3}
              busy={busy === "pain"}
              disabled={Boolean(busy)}
              onChange={setPain}
              onVary={() => void vary("pain")}
            />
            <BriefField
              id="story-audience"
              label="Target audience"
              value={audience}
              maxLength={240}
              rows={2}
              busy={busy === "audience"}
              disabled={Boolean(busy)}
              onChange={setAudience}
              onVary={() => void vary("audience")}
            />
            <BriefField
              id="story-who"
              label="Who it follows"
              value={who}
              maxLength={120}
              rows={2}
              busy={busy === "person"}
              disabled={Boolean(busy)}
              onChange={setWho}
              onVary={() => void vary("person")}
            />
          </div>
          <button
            type="button"
            onClick={() => void approve()}
            disabled={!pain.trim() || !audience.trim() || !who.trim() || Boolean(busy)}
            className="btn-primary mt-5 min-h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "approve" ? "Writing the story…" : "Approve"}
          </button>
        </section>
      ) : null}
      {error ? <p className="text-sm text-[#e11d48]">{error}</p> : null}
    </div>
  );
}
