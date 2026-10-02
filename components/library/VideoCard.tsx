"use client";

import { useEffect, useRef, useState } from "react";
import { downloadHref } from "@/components/library/download";
import type { LibraryGenerating, LibraryVideo, LibraryView } from "@/components/library/types";

function timeAgo(iso: string) {
  const delta = Date.now() - new Date(iso || 0).getTime();
  const mins = Math.max(1, Number.isFinite(delta) ? Math.round(delta / 60000) : 1);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function durationLabel(duration: number, parts: number, index: number) {
  return parts > 1 ? `Part ${index} · ${duration}s` : `${duration}s`;
}

export function VideoCard({
  item,
  view,
  resolveSrc,
  downloadName,
  onPlay,
  onEdit,
}: {
  item: LibraryVideo;
  view: LibraryView;
  resolveSrc: (path?: string) => string;
  downloadName: string;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = resolveSrc(item.src);
  const poster = item.poster ? resolveSrc(item.poster) : "";
  const title = item.title || "Untitled video";
  const list = view === "list";

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (preview) void video.play().catch(() => undefined);
    else video.pause();
  }, [preview]);

  return (
    <article className={`cf-card group relative rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] shadow-[0_16px_40px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ${list ? "flex overflow-hidden" : ""}`}>
      <button
        type="button"
        onClick={onPlay}
        onMouseEnter={() => {
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setPreview(true);
        }}
        onMouseLeave={() => setPreview(false)}
        onFocus={() => {
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setPreview(true);
        }}
        onBlur={() => setPreview(false)}
        className={`no-press relative block min-h-11 w-full text-left ${list ? "w-[42%] max-w-[220px] shrink-0" : ""}`}
        aria-label={`Play ${title}`}
      >
        <div className="relative aspect-video overflow-hidden bg-[#101014]">
          {poster && !posterFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" loading="lazy" decoding="async" onError={() => setPosterFailed(true)} className="cf-media h-full w-full object-cover" />
          ) : (
            <video ref={videoRef} src={`${src}#t=0.1`} muted playsInline preload="metadata" className="cf-media h-full w-full object-cover" />
          )}
          {preview && poster && !posterFailed ? (
            <video src={src} muted playsInline autoPlay loop preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-[11px] tabular-nums text-white backdrop-blur-md">
            {durationLabel(item.duration, item.parts, item.index)}
          </span>
          <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition duration-200 [@media(hover:hover)]:group-hover:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" aria-hidden="true">
                <path fill="currentColor" d="M8 5.8v12.4l11-6.2L8 5.8Z" />
              </svg>
            </span>
          </span>
          {list ? null : (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
              <span className="block truncate text-base font-medium text-white">{title}</span>
              <span className="mt-1 flex items-center gap-2 text-[11px] text-white/70">
                <span>{timeAgo(item.createdAt)}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">Ready</span>
              </span>
            </span>
          )}
        </div>
      </button>

      <div ref={menuRef} className={`absolute left-2 top-2 z-20 flex items-center gap-1 opacity-100 transition duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ${list ? "" : ""}`}>
        <button type="button" onClick={onEdit} className="no-press inline-flex h-11 items-center rounded-xl border border-white/10 bg-black/50 px-3 text-xs text-white backdrop-blur-md" aria-label={`Edit ${title}`}>
          Edit
        </button>
        <a href={downloadHref(src, downloadName)} download={downloadName} className="no-press inline-flex h-11 items-center rounded-xl border border-white/10 bg-black/50 px-3 text-xs text-white backdrop-blur-md" aria-label={`Download ${title}`}>
          Download
        </a>
        <button
          type="button"
          aria-label={`More actions for ${title}`}
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
          className="no-press grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/50 text-white backdrop-blur-md"
        >
          ...
        </button>
        {menu ? (
          <div role="menu" className="absolute left-0 top-12 w-40 overflow-hidden rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface-2)] py-1 shadow-2xl">
            <button type="button" role="menuitem" onClick={onEdit} className="no-press block min-h-11 w-full px-3 text-left text-sm hover:bg-white/5">
              Edit
            </button>
            <a role="menuitem" href={downloadHref(src, downloadName)} download={downloadName} className="block min-h-11 px-3 py-3 text-sm hover:bg-white/5">
              Download
            </a>
          </div>
        ) : null}
      </div>

      {list ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
          <p className="truncate text-base font-medium">{title}</p>
          <p className="mt-1 text-xs text-[var(--cf-muted)]">{timeAgo(item.createdAt)}</p>
          <p className="mt-2 w-fit rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">Ready</p>
        </div>
      ) : null}
    </article>
  );
}

export function ProcessingCard({ item, view }: { item: LibraryGenerating; view: LibraryView }) {
  const list = view === "list";
  return (
    <article className={`cf-card overflow-hidden rounded-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] ${list ? "flex" : ""}`}>
      <div className={`relative aspect-video overflow-hidden bg-[#101014] ${list ? "w-[42%] max-w-[220px] shrink-0" : ""}`}>
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_30%_20%,rgba(255,138,61,0.35),transparent_42%),linear-gradient(160deg,#1b1b20,#0b0b0d)]" />
        <div className="skeleton-scan pointer-events-none absolute inset-y-0 left-0 w-2/3" />
        <div className="absolute inset-0 grid place-items-center">
          <p className="status-breathe text-sm font-medium text-white">
            <span className="status-dots">Processing</span>
          </p>
        </div>
        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-[11px] tabular-nums text-white backdrop-blur-md">{item.duration}s</span>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <span className="block truncate text-base font-medium text-white">{item.title}</span>
          <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white">Processing</span>
        </span>
      </div>
      {list ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4">
          <p className="truncate text-base font-medium">{item.title}</p>
          <p className="mt-1 text-xs text-[var(--cf-muted)]">Processing</p>
        </div>
      ) : null}
    </article>
  );
}

export function CreateCard({ onCreate, view }: { onCreate: () => void; view: LibraryView }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className={`no-press cf-card flex min-h-11 items-center justify-center gap-3 rounded-[20px] border border-dashed border-white/15 bg-transparent px-4 text-left text-white hover:border-[#FF8A3D]/70 hover:bg-white/[0.03] ${view === "list" ? "min-h-24" : "aspect-video"}`}
    >
      <span className="cf-plus grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] text-white shadow-[0_8px_20px_rgba(255,94,98,0.3)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span>
        <span className="block text-base font-medium">Create new</span>
        <span className="mt-0.5 block text-xs text-[var(--cf-muted)]">Start a short film</span>
      </span>
    </button>
  );
}
