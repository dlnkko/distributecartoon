"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import { MAX_PRODUCT_PHOTOS, MAX_PRODUCT_VIDEOS, type SavedMedia, type SavedProduct } from "@/lib/saved-products";

function mediaSrc(publicPath?: string) {
  if (!publicPath) return "";
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  const relative = publicPath.replace(/^\/(?:generated|api\/media)\//, "").replace(/^\//, "");
  return `/api/media/${relative}`;
}

function LocalPhoto({ file }: { file: File }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return <span className="h-12 w-12 shrink-0 rounded-lg bg-black/[0.04]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />;
}

export function ProductsPanel() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string>("");
  const [name, setName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [useNotes, setUseNotes] = useState("");
  const [whenNotes, setWhenNotes] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [keptPhotos, setKeptPhotos] = useState<SavedMedia[]>([]);
  const [keptVideos, setKeptVideos] = useState<SavedMedia[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
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
    setWhenNotes("");
    setExtraContext("");
    setKeptPhotos([]);
    setKeptVideos([]);
    setPhotoFiles([]);
    setVideoFiles([]);
    setError("");
  }

  function startAdd() {
    blank();
    setOpen(true);
  }

  function edit(product: SavedProduct) {
    setEditing(product.id);
    setName(product.name);
    setPageUrl(product.pageUrl);
    setUseNotes(product.useNotes);
    setWhenNotes(product.whenNotes);
    setExtraContext(product.extraContext);
    setKeptPhotos(product.photos);
    setKeptVideos(product.videos);
    setPhotoFiles([]);
    setVideoFiles([]);
    setError("");
    setOpen(true);
  }

  function addPhotos(list: FileList | null) {
    const incoming = Array.from(list || []);
    const room = MAX_PRODUCT_PHOTOS - keptPhotos.length - photoFiles.length;
    if (incoming.length > room) setError("You can add up to 5 photos.");
    if (room > 0) setPhotoFiles((current) => [...current, ...incoming.slice(0, room)]);
  }

  function addVideos(list: FileList | null) {
    const incoming = Array.from(list || []);
    const room = MAX_PRODUCT_VIDEOS - keptVideos.length - videoFiles.length;
    if (incoming.length > room) setError("You can add up to 2 videos.");
    if (room > 0) setVideoFiles((current) => [...current, ...incoming.slice(0, room)]);
  }

  function remember(product: SavedProduct) {
    setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
  }

  async function upload(id: string, kind: "image" | "video", file: File) {
    const form = new FormData();
    form.set("id", id);
    form.set("kind", kind);
    form.set("file", file);
    const res = await fetch("/api/products", { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { product?: SavedProduct; error?: string };
    if (!json.product) throw new Error(json.error || "Couldn't add that file.");
    return json.product;
  }

  async function saveText() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing || undefined,
        name,
        pageUrl,
        useNotes,
        whenNotes,
        extraContext,
        photoPaths: keptPhotos.map((item) => item.path),
        videoPaths: keptVideos.map((item) => item.path),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { product?: SavedProduct; error?: string };
    if (!json.product) {
      setError(json.error || "Couldn't save that product.");
      setBusy(false);
      return;
    }
    let product = json.product;
    const photos = photoFiles;
    const videos = videoFiles;
    setPhotoFiles([]);
    setVideoFiles([]);
    try {
      for (const file of photos) product = await upload(product.id, "image", file);
      for (const file of videos) product = await upload(product.id, "video", file);
    } catch (error) {
      remember(product);
      setEditing(product.id);
      setKeptPhotos(product.photos);
      setKeptVideos(product.videos);
      setError(error instanceof Error ? error.message : "Couldn't add that file.");
      setBusy(false);
      return;
    }
    remember(product);
    blank();
    setOpen(false);
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
      if (editing === id) {
        blank();
        setOpen(false);
      }
    }
    setBusy(false);
  }

  const photoCount = keptPhotos.length + photoFiles.length;
  const videoCount = keptVideos.length + videoFiles.length;

  if (!open) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {error ? <p className="text-sm text-[#e11d48]">{error}</p> : null}
        {products.length === 0 ? (
          <button type="button" onClick={startAdd} className="flex min-h-40 flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--cf-line)] bg-[var(--cf-surface)] px-6 py-10 text-center shadow-[0_1px_2px_rgba(12,12,12,0.04)]">
            <span className="display text-2xl">Add your first product</span>
            <span className="mt-2 max-w-sm text-sm text-[var(--cf-muted)]">Save the page, the photos, and how it is used. Then pick it in any video.</span>
          </button>
        ) : (
          <ul className="flex flex-col gap-2">
            <li>
              <button type="button" onClick={startAdd} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--cf-line)] bg-[var(--cf-surface)] px-3 text-left text-sm font-medium">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/[0.04] text-lg">+</span>
                Add a product
              </button>
            </li>
            {products.map((product) => (
              <li key={product.id}>
                <article className="flex items-center gap-3 rounded-2xl border border-[var(--cf-line)] bg-[var(--cf-surface)] p-2.5 shadow-[0_1px_2px_rgba(12,12,12,0.04)]">
                  {product.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaSrc(product.imagePath)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-black/[0.04] text-[10px] text-[var(--cf-muted)]">No photo</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{product.name}</h3>
                    <p className="truncate text-xs text-[var(--cf-muted)]">
                      {product.photos.length} {product.photos.length === 1 ? "photo" : "photos"} · {product.videos.length} {product.videos.length === 1 ? "video" : "videos"}
                    </p>
                  </div>
                  <button type="button" onClick={() => edit(product)} className="h-8 rounded-lg border border-black/[0.08] px-3 text-xs">
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove(product.id)} className="h-8 rounded-lg px-3 text-xs text-[var(--cf-muted)]">
                    Delete
                  </button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <button type="button" onClick={() => { blank(); setOpen(false); }} className="self-start text-sm text-[var(--cf-muted)]">
        Products
      </button>
      <form
        className="rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 shadow-[0_1px_2px_rgba(12,12,12,0.04)]"
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
            placeholder="How it is used."
            className="mt-1 min-h-20 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm leading-6 text-[var(--cf-ink)] outline-none"
          />
        </label>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          When it is used
          <textarea
            value={whenNotes}
            onChange={(event) => setWhenNotes(event.target.value)}
            placeholder="When it is used."
            className="mt-1 min-h-20 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm leading-6 text-[var(--cf-ink)] outline-none"
          />
        </label>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          Additional context <span className="text-[var(--cf-muted)]">· optional</span>
          <textarea
            value={extraContext}
            onChange={(event) => setExtraContext(event.target.value)}
            placeholder="Anything else the story should know."
            className="mt-1 min-h-20 w-full resize-none rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm leading-6 text-[var(--cf-ink)] outline-none"
          />
        </label>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          Photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            disabled={busy || photoCount >= MAX_PRODUCT_PHOTOS}
            onChange={(event) => {
              addPhotos(event.target.files);
              event.target.value = "";
            }}
            className="mt-1 block w-full rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-black/[0.06] file:px-3 file:py-1.5 file:text-sm file:text-[var(--cf-ink)]"
          />
        </label>
        <p className="mt-1 text-[11px] text-[var(--cf-muted)]">{photoCount} of 5 photos</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {keptPhotos.map((item) => (
            <li key={item.path} className="flex items-center gap-2 rounded-xl bg-black/[0.04] px-2 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaSrc(item.path)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs">{item.path.split("/").pop()}</span>
              <button type="button" onClick={() => setKeptPhotos((current) => current.filter((photo) => photo.path !== item.path))} className="px-1 text-sm text-[var(--cf-muted)]" aria-label="Remove photo">
                ×
              </button>
            </li>
          ))}
          {photoFiles.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-xl bg-black/[0.04] px-2 py-1.5">
              <LocalPhoto file={file} />
              <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
              <button type="button" onClick={() => setPhotoFiles((current) => current.filter((_, item) => item !== index))} className="px-1 text-sm text-[var(--cf-muted)]" aria-label="Remove photo">
                ×
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 block text-xs text-[var(--cf-muted)]">
          Videos
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            disabled={busy || videoCount >= MAX_PRODUCT_VIDEOS}
            onChange={(event) => {
              addVideos(event.target.files);
              event.target.value = "";
            }}
            className="mt-1 block w-full rounded-xl border border-[var(--cf-line)] bg-[var(--cf-bg)] px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-black/[0.06] file:px-3 file:py-1.5 file:text-sm file:text-[var(--cf-ink)]"
          />
        </label>
        <p className="mt-1 text-[11px] text-[var(--cf-muted)]">{videoCount} of 2 videos. Each one can be up to 20 seconds.</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {keptVideos.map((item) => (
            <li key={item.path}>
              <button type="button" onClick={() => setKeptVideos((current) => current.filter((video) => video.path !== item.path))} className="rounded-lg bg-black/[0.04] px-2 py-1 text-[11px]">
                {item.path.split("/").pop()} ×
              </button>
            </li>
          ))}
          {videoFiles.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <button type="button" onClick={() => setVideoFiles((current) => current.filter((_, item) => item !== index))} className="rounded-lg bg-black/[0.04] px-2 py-1 text-[11px]">
                {file.name} ×
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-4 text-[var(--cf-muted)]">This stays on your account.</p>
        {error ? <p className="mt-2 text-sm text-[#e11d48]">{error}</p> : null}
        <div className="mt-4">
          <button type="submit" disabled={busy} className="btn-primary h-11 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-4 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Save product"}
          </button>
        </div>
      </form>
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
  const [open, setOpen] = useState(false);
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

  const chosen = products.filter((product) => selectedIds.includes(product.id));

  function row(product: SavedProduct, selected: boolean) {
    return (
      <button
        key={product.id}
        type="button"
        disabled={disabled || Boolean(busyId)}
        onClick={() => void toggle(product.id)}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50 ${selected ? "bg-black/[0.04]" : "hover:bg-black/[0.04]"}`}
      >
        {product.imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(product.imagePath)} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-black/[0.06] text-sm font-medium text-[var(--muted)]">
            {product.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{product.name}</span>
          <span className="block text-[11px] text-[var(--muted)]">{selected ? "Selected" : "Use this product"}</span>
        </span>
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full ${selected ? "bg-[linear-gradient(135deg,#3d5afe,#5b6cff)] text-white" : "border border-black/10"}`}
          aria-hidden
        >
          {selected ? (
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3.5 8.2 6.4 11l6.1-6.2" />
            </svg>
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-[var(--cf-surface)]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          className="flex h-12 w-full items-center justify-between px-4 text-sm font-medium disabled:opacity-50"
          aria-expanded={open}
        >
          Choose product
          <svg viewBox="0 0 16 16" className={`size-4 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 6.5 8 10.5 12 6.5" />
          </svg>
        </button>
        {chosen.length && !open ? <div className="border-t border-black/[0.08]">{chosen.map((product) => row(product, true))}</div> : null}
        {open ? (
          <div className="border-t border-black/[0.08]">
            {products.length ? (
              products.map((product) => row(product, selectedIds.includes(product.id)))
            ) : (
              <p className="px-4 py-3 text-sm text-[var(--muted)]">No saved products yet.</p>
            )}
            <button
              type="button"
              onClick={onOpenProducts}
              className="flex w-full items-center gap-3 border-t border-black/[0.08] px-3 py-2.5 text-left text-sm text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--ink)]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-dashed border-black/10 text-lg leading-none">+</span>
              Add new product
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
