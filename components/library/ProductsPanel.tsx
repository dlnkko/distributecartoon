"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import type { SavedProduct } from "@/lib/saved-products";

function mediaSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

export function ProductsPanel() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [editing, setEditing] = useState<string>("");
  const [name, setName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [useNotes, setUseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/products");
    const json = (await res.json().catch(() => ({}))) as { products?: SavedProduct[]; error?: string };
    if (!res.ok) {
      setError(json.error || "Couldn't load products.");
      return;
    }
    setProducts(json.products || []);
  }

  useEffect(() => {
    void load();
  }, []);

  function blank() {
    setEditing("");
    setName("");
    setPageUrl("");
    setUseNotes("");
    setError("");
  }

  function edit(product: SavedProduct) {
    setEditing(product.id);
    setName(product.name);
    setPageUrl(product.pageUrl);
    setUseNotes(product.useNotes);
    setError("");
  }

  async function saveText() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing || undefined, name, pageUrl, useNotes }),
    });
    const json = (await res.json().catch(() => ({}))) as { product?: SavedProduct; error?: string };
    if (!json.product) {
      setError(json.error || "Couldn't save that product.");
      setBusy(false);
      return;
    }
    setEditing(json.product.id);
    setProducts((current) => [json.product!, ...current.filter((item) => item.id !== json.product!.id)]);
    setBusy(false);
  }

  async function saveFile(kind: "image" | "video", file: File) {
    if (!editing) {
      setError("Save the product first, then add the photo or video.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("id", editing);
    form.set("kind", kind);
    form.set("file", file);
    const res = await fetch("/api/products", { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { product?: SavedProduct; error?: string };
    if (!json.product) setError(json.error || "Couldn't add that file.");
    else setProducts((current) => current.map((item) => (item.id === json.product!.id ? json.product! : item)));
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(json.error || "Couldn't delete that product.");
    else {
      setProducts((current) => current.filter((item) => item.id !== id));
      if (editing === id) blank();
    }
    setBusy(false);
  }

  const current = products.find((item) => item.id === editing);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <form
        className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        onSubmit={(event) => {
          event.preventDefault();
          void saveText();
        }}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--cf-muted)]">{editing ? "Edit product" : "New product"}</p>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Product name"
            className="mt-1 h-11 w-full rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 text-sm text-[var(--cf-ink)] outline-none"
          />
        </label>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          Product page URL
          <input
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder="Product page URL"
            inputMode="url"
            className="mt-1 h-11 w-full rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 text-sm text-[var(--cf-ink)] outline-none"
          />
        </label>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          How it is used
          <textarea
            value={useNotes}
            onChange={(event) => setUseNotes(event.target.value)}
            placeholder="How it is used, when it is used, and anything else the story should know."
            className="mt-1 min-h-28 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm leading-6 text-[var(--cf-ink)] outline-none"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={`inline-flex h-10 cursor-pointer items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm ${!editing || busy ? "cursor-not-allowed opacity-50" : ""}`}>
            {current?.imagePath ? "Replace photo" : "Product photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={!editing || busy}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void saveFile("image", file);
              }}
            />
          </label>
          <label className={`inline-flex h-10 cursor-pointer items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm ${!editing || busy ? "cursor-not-allowed opacity-50" : ""}`}>
            {current?.useVideoPath ? "Replace use video" : "Video of how it is used"}
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              disabled={!editing || busy}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void saveFile("video", file);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[var(--cf-muted)]">Save the name first. The use video can be up to 20 seconds. This stays on your account.</p>
        {error ? <p className="mt-2 text-sm text-[#fb7185]">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={busy} className="btn-primary h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-4 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Save product"}
          </button>
          {editing ? (
            <button type="button" disabled={busy} onClick={blank} className="h-11 rounded-xl border border-white/10 px-4 text-sm">
              New product
            </button>
          ) : null}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((product) => (
          <article key={product.id} className="rounded-2xl border border-[var(--cf-line)] bg-[var(--cf-surface)] p-3">
            <div className="flex gap-3">
              {product.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(product.imagePath)} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-xl bg-white/5 text-[10px] text-[var(--cf-muted)]">No photo</span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{product.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--cf-muted)]">{product.useNotes || "No use notes yet."}</p>
                <p className="mt-1 text-[11px] text-[var(--cf-muted)]">
                  {product.pageUrl ? "Page saved" : "No page"} · {product.useVideoPath ? "Use video saved" : "No use video"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => edit(product)} className="h-8 rounded-lg border border-white/10 px-3 text-xs">
                Edit
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(product.id)} className="h-8 rounded-lg px-3 text-xs text-[var(--cf-muted)]">
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SavedProductPicker({
  projectId,
  selectedIds,
  disabled,
  onChanged,
  onOpenProducts,
}: {
  projectId: string;
  selectedIds: string[];
  disabled?: boolean;
  onChanged: (project: Project) => void;
  onOpenProducts: () => void;
}) {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let stop = false;
    void fetch("/api/products")
      .then((res) => res.json())
      .then((json: { products?: SavedProduct[] }) => {
        if (!stop) setProducts(json.products || []);
      })
      .catch(() => {
        if (!stop) setError("Couldn't load saved products.");
      });
    return () => {
      stop = true;
    };
  }, [projectId]);

  async function toggle(productId: string) {
    setBusyId(productId);
    setError("");
    const res = await fetch("/api/products/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, productId }),
    });
    const json = (await res.json().catch(() => ({}))) as { project?: Project; error?: string };
    if (json.project) onChanged(json.project);
    else setError(json.error || "Couldn't use that product.");
    setBusyId("");
  }

  if (!products.length) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-5">
        <p className="text-sm">No saved products yet.</p>
        <button type="button" onClick={onOpenProducts} className="mt-3 text-sm font-medium text-[#5B8CFF]">
          Add one in Products
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {products.map((product) => {
          const selected = selectedIds.includes(product.id);
          return (
            <button
              key={product.id}
              type="button"
              disabled={disabled || Boolean(busyId)}
              onClick={() => void toggle(product.id)}
              className={`rounded-2xl border p-3 text-left disabled:opacity-50 ${selected ? "border-[#5B8CFF] bg-[#5B8CFF]/10" : "border-[var(--line)] bg-white"}`}
            >
              <span className="flex items-center gap-2">
                {product.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(product.imagePath)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block text-[11px] text-[var(--muted)]">{selected ? "Selected" : "Use this product"}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <button type="button" onClick={onOpenProducts} className="mt-2 text-xs text-[var(--muted)]">
        Manage products
      </button>
    </div>
  );
}
