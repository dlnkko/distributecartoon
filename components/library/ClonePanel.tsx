"use client";

import { useEffect, useState } from "react";
import { DurationField } from "@/components/DurationField";
import { CLONE_CHUNK_BYTES, CLONE_UPLOAD_MAX_BYTES } from "@/lib/clone-upload";
import type { SavedProduct } from "@/lib/saved-products";
import type { DialogueLanguage, Project } from "@/lib/types";

function mediaSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

export function ClonePanel({
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
  const [page, setPage] = useState("");
  const [seconds, setSeconds] = useState<number>(30);
  const [language, setLanguage] = useState<DialogueLanguage>("english");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState<"" | "fill" | "continue">("");
  const [note, setNote] = useState("");
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

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | null) {
    setError("");
    if (next && next.size > CLONE_UPLOAD_MAX_BYTES) {
      setFile(null);
      setError("That video is too large.");
      return;
    }
    setFile(next);
  }

  async function fill() {
    if (!productId || busy) return;
    setBusy("fill");
    setError("");
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, language }),
    });
    const json = (await res.json().catch(() => ({}))) as { pain?: string; audience?: string; page?: string; error?: string };
    setBusy("");
    if (!res.ok || !json.audience || !json.pain) {
      setError(json.error || "Couldn't read that page.");
      return;
    }
    setPain(json.pain);
    setAudience(json.audience);
    setPage(json.page || "");
  }

  async function go() {
    if (!productId || !file || !audience.trim() || !pain.trim() || busy) return;
    setBusy("continue");
    setNote("Uploading the video…");
    setError("");
    const uploadId = crypto.randomUUID();
    const partCount = Math.ceil(file.size / CLONE_CHUNK_BYTES);
    try {
      for (let index = 0; index < partCount; index += 1) {
        setNote(`Uploading ${index + 1} of ${partCount}…`);
        const piece = new FormData();
        piece.set("uploadId", uploadId);
        piece.set("index", String(index));
        piece.set("chunk", file.slice(index * CLONE_CHUNK_BYTES, (index + 1) * CLONE_CHUNK_BYTES), "part");
        const sent = await fetch("/api/clone/upload", { method: "POST", body: piece, signal: AbortSignal.timeout(120_000) });
        const stored = (await sent.json().catch(() => ({}))) as { error?: string };
        if (!sent.ok) {
          setError(stored.error || "Couldn't upload that video.");
          return;
        }
      }
      setNote("Adapting the video…");
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          partCount,
          name: file.name,
          productId,
          pain: pain.trim(),
          audience: audience.trim(),
          seconds,
          language,
          page,
        }),
        signal: AbortSignal.timeout(480_000),
      });
      const json = (await res.json().catch(() => ({}))) as { project?: Project; error?: string };
      if (!res.ok || !json.project) {
        setError(json.error || "Couldn't adapt that video.");
        return;
      }
      onOpen(json.project);
    } catch {
      setError("Couldn't adapt that video.");
    } finally {
      setBusy("");
      setNote("");
    }
  }

  if (loaded && products.length === 0) {
    return (
      <div className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] px-6 py-16 text-center">
        <p className="display text-3xl">No products yet</p>
        <p className="mt-2 max-w-sm text-sm text-[var(--cf-muted)]">Save a product with its page, then a clone can start from it.</p>
        <button type="button" onClick={onProducts} className="btn-primary mt-6 min-h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white">
          Add a product
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 sm:p-5">
        <p className="text-sm font-medium">Reference video</p>
        <p className="mt-0.5 text-xs text-[var(--cf-muted)]">An mp4, mov, or webm under 10 minutes and 32 MB. The shape stays. The cause and the product change.</p>
        <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--cf-line)] bg-[var(--cf-surface-2)] px-4 py-5 text-center text-sm">
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
            className="sr-only"
            onChange={(event) => pickFile(event.target.files?.[0] || null)}
          />
          {file ? file.name : "Upload a video"}
        </label>
        {preview ? <video src={preview} controls className="mt-3 max-h-64 w-full rounded-xl bg-black" /> : null}
      </section>

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
                  setPain("");
                  setAudience("");
                  setPage("");
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Pain point and audience</p>
            <p className="mt-0.5 text-xs text-[var(--cf-muted)]">Gemini can read the product page, or you can type both. The pain is why the person fails inside this story. The audience decides how the people look. A long video is shortened to the duration so that problem still lands.</p>
          </div>
          <button
            type="button"
            onClick={() => void fill()}
            disabled={!productId || Boolean(busy)}
            className="btn-secondary min-h-10 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "fill" ? "Reading the page…" : "Fill with AI"}
          </button>
        </div>
        <label htmlFor="clone-pain" className="mt-4 block text-sm font-medium">
          Pain point
        </label>
        <textarea
          id="clone-pain"
          value={pain}
          onChange={(event) => setPain(event.target.value)}
          maxLength={400}
          rows={3}
          disabled={Boolean(busy)}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface-2)] px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
        <label htmlFor="clone-audience" className="mt-4 block text-sm font-medium">
          Audience
        </label>
        <textarea
          id="clone-audience"
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          maxLength={240}
          rows={2}
          disabled={Boolean(busy)}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface-2)] px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
      </section>

      <section className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 sm:p-5">
        <p className="text-sm font-medium">Duration</p>
        <div className="mt-3">
          <DurationField value={seconds} disabled={Boolean(busy)} onChange={setSeconds} />
        </div>
        <div className="mt-4">
          <p className="text-sm font-medium">Language</p>
          <div className="mt-2 flex w-fit rounded-xl bg-black/[0.04] p-[3px]" role="group" aria-label="Clone language">
            {(["english", "spanish"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={language === item}
                onClick={() => setLanguage(item)}
                className={`min-h-9 rounded-lg px-4 text-sm capitalize ${language === item ? "bg-black/[0.06] text-[var(--cf-ink)]" : "text-[var(--cf-muted)]"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void go()}
          disabled={!file || !productId || !pain.trim() || !audience.trim() || Boolean(busy)}
          className="btn-primary mt-5 min-h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "continue" ? note || "Adapting the video…" : "Continue"}
        </button>
      </section>
      {error ? <p className="text-sm text-[#e11d48]">{error}</p> : null}
    </div>
  );
}
