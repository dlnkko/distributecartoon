"use client";

import { useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/Brand";
import { CreditsPill, CreditsWidget } from "@/components/library/CreditsWidget";
import { FilterChips } from "@/components/library/FilterChips";
import { MobileNav } from "@/components/library/MobileNav";
import type { LibraryFilter, LibraryGenerating, LibraryProfile, LibrarySort, LibraryVideo, LibraryView } from "@/components/library/types";
import { VideoGrid } from "@/components/library/VideoGrid";

function matchesDuration(duration: number, filter: LibraryFilter) {
  if (filter === "60") return duration >= 50 && duration < 90;
  if (filter === "120") return duration >= 90;
  return true;
}

export function LibraryShell({
  videos,
  generating,
  credits,
  profile,
  error,
  onPlay,
  onEdit,
  onCreate,
  onCreateSong,
  onAccount,
  onMembership,
  onLogout,
  resolveSrc,
  downloadName,
}: {
  videos: LibraryVideo[];
  generating: LibraryGenerating[];
  credits: number;
  profile?: LibraryProfile | null;
  error?: string;
  onPlay: (item: LibraryVideo) => void;
  onEdit: (projectId: string) => void;
  onCreate: () => void;
  onCreateSong: () => void;
  onAccount: () => void;
  onMembership: () => void;
  onLogout: () => void;
  resolveSrc: (path?: string) => string;
  downloadName: (item: LibraryVideo) => string;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [view, setView] = useState<LibraryView>("grid");
  const [narrow, setNarrow] = useState(false);
  const [menu, setMenu] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const finished = useMemo(() => {
    const next = videos.filter((item) => {
      if (needle && !(item.title || "untitled video").toLowerCase().includes(needle)) return false;
      if (filter === "processing") return false;
      return matchesDuration(item.duration, filter);
    });
    next.sort((a, b) => {
      if (sort === "longest") return b.duration - a.duration;
      const left = new Date(a.createdAt || 0).getTime();
      const right = new Date(b.createdAt || 0).getTime();
      return sort === "oldest" ? left - right : right - left;
    });
    return next;
  }, [videos, needle, filter, sort]);

  const pending = useMemo(
    () =>
      generating.filter((item) => {
        if (needle && !item.title.toLowerCase().includes(needle)) return false;
        if (filter !== "all" && filter !== "processing" && !matchesDuration(item.duration, filter)) return false;
        return true;
      }),
    [generating, needle, filter],
  );

  const total = videos.length + generating.length;
  const shown = finished.length + pending.length;
  const empty = total === 0;
  const summary = empty
    ? "Finished videos will appear here."
    : generating.length
      ? `${generating.length} processing, ${videos.length} ready`
      : `${videos.length} finished ${videos.length === 1 ? "video" : "videos"}`;

  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-account-menu]")) setMenu(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside className={`relative z-40 hidden shrink-0 flex-col border-r border-[var(--cf-line)] bg-[rgba(20,20,23,0.72)] backdrop-blur-xl lg:flex ${narrow ? "w-[72px]" : "w-[248px]"}`}>
        <div className={`flex items-center pb-3 pt-4 ${narrow ? "flex-col gap-2 px-2" : "justify-between gap-2 px-3"}`}>
          <Brand word={!narrow} tone="accent" compact={narrow} />
          <button type="button" onClick={() => setNarrow((value) => !value)} className={`no-press grid shrink-0 place-items-center rounded-lg text-[var(--cf-muted)] hover:bg-white/5 ${narrow ? "h-7 w-7" : "h-11 w-11 rounded-xl"}`} aria-label={narrow ? "Expand sidebar" : "Collapse sidebar"}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d={narrow ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className={`flex flex-col gap-2 ${narrow ? "items-center px-2" : "px-3"}`}>
          <button type="button" onClick={onCreate} aria-label="Create a video" className={`btn-primary cf-create flex items-center rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(255,94,98,0.32)] ${narrow ? "size-9 justify-center" : "min-h-11 w-full gap-3 px-3"}`}>
            <span className="cf-plus">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={narrow ? "h-3.5 w-3.5" : ""}>
                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            {narrow ? null : "Create a video"}
          </button>
          <button type="button" onClick={onCreateSong} aria-label="Create a suno video" className={`no-press flex items-center rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white hover:bg-white/10 ${narrow ? "size-9 justify-center" : "min-h-11 w-full gap-3 px-3"}`}>
            <SongIcon className={narrow ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {narrow ? null : "Create a suno video"}
          </button>
        </div>
        <nav className={`mt-4 flex flex-1 flex-col gap-1 border-t border-[var(--cf-line)] pt-3 ${narrow ? "items-center px-2" : "px-3"}`} aria-label="Studio">
          <button type="button" aria-label="Your videos" className={`no-press flex items-center rounded-xl bg-[linear-gradient(135deg,rgba(255,138,61,0.2),rgba(255,94,98,0.12))] text-sm font-medium text-white shadow-[0_0_24px_rgba(255,138,61,0.16)] ${narrow ? "size-9 justify-center" : "min-h-11 w-full gap-3 px-3"}`} aria-current="page">
            <FilmIcon className={narrow ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {narrow ? null : "Your videos"}
          </button>
        </nav>
        <div className={narrow ? "px-2 pb-2" : "px-3 pb-2"}>
          <CreditsWidget credits={credits} compact={narrow} />
        </div>
        <div className={`relative ${narrow ? "p-2" : "p-3"}`} data-account-menu>
          <button type="button" onClick={() => setMenu((open) => !open)} className={`no-press flex items-center rounded-xl text-left hover:bg-white/5 ${narrow ? "mx-auto size-9 justify-center" : "min-h-11 w-full gap-3 px-2"}`} aria-expanded={menu} aria-haspopup="menu" aria-label="Account menu">
            <Avatar profile={profile} compact={narrow} />
            {narrow ? null : (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{profile?.displayName || "Your account"}</span>
                <span className="block truncate text-[11px] text-[var(--cf-muted)]">{profile?.email || "Account"}</span>
              </span>
            )}
          </button>
          {menu ? (
            <div role="menu" className={`absolute z-50 w-56 overflow-hidden rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface-2)] py-1 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ${narrow ? "bottom-0 left-[calc(100%+10px)]" : "right-3 bottom-16 left-3 w-auto"}`}>
              <div className="border-b border-[var(--cf-line)] px-3 py-2.5">
                <p className="truncate text-sm font-medium">{profile?.displayName || "Your account"}</p>
                <p className="truncate text-[11px] text-[var(--cf-muted)]">{profile?.email || "Account"}</p>
              </div>
              <button type="button" role="menuitem" onClick={onAccount} className="no-press block min-h-10 w-full whitespace-nowrap px-3 text-left text-sm hover:bg-white/5">
                Account
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onMembership();
                }}
                className="no-press block min-h-10 w-full whitespace-nowrap px-3 text-left text-sm hover:bg-white/5"
              >
                Membership
              </button>
              <button type="button" role="menuitem" onClick={onLogout} className="no-press block min-h-10 w-full whitespace-nowrap px-3 text-left text-sm hover:bg-white/5">
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--cf-line)] bg-[rgba(11,11,13,0.78)] px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute -top-16 left-10 h-40 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.22),transparent_68%)] blur-3xl" />
          <div className="relative flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="display text-[40px] leading-none font-semibold tracking-[-0.045em] sm:text-5xl">Your videos</h2>
              <p className="mt-2 text-sm text-[var(--cf-muted)]">{summary}</p>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <button type="button" className="no-press grid h-11 w-11 place-items-center rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface)]" aria-label={searchOpen ? "Close search" : "Search videos"} aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
                <SearchIcon />
              </button>
              <CreditsPill credits={credits} onClick={() => setCreditsOpen(true)} />
            </div>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <label className={`relative min-w-0 flex-1 ${searchOpen ? "flex" : "hidden lg:block"}`}>
              <span className="sr-only">Search videos</span>
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--cf-muted)]">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search videos"
                className="h-11 w-full rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface)] pr-3 pl-10 text-sm outline-none placeholder:text-[var(--cf-muted)]"
              />
            </label>
            <label className="sr-only" htmlFor="video-sort">Sort videos</label>
            <select
              id="video-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as LibrarySort)}
              className="h-11 rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface)] px-3 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="longest">Longest</option>
            </select>
            <div className="flex h-11 rounded-xl border border-[var(--cf-line)] bg-[var(--cf-surface)] p-1">
              <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`no-press grid h-9 w-11 place-items-center rounded-lg ${view === "grid" ? "bg-white/10 text-white" : "text-[var(--cf-muted)]"}`}>
                <GridIcon />
              </button>
              <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`no-press grid h-9 w-11 place-items-center rounded-lg ${view === "list" ? "bg-white/10 text-white" : "text-[var(--cf-muted)]"}`}>
                <ListIcon />
              </button>
            </div>
          </div>
          <div className="relative mt-3">
            <FilterChips value={filter} onChange={setFilter} />
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-10">
          {error ? <p className="mb-4 text-sm text-[#fb7185]">{error}</p> : null}
          {empty ? (
            <div className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[20px] border border-[var(--cf-line)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,138,61,0.22),transparent_55%),var(--cf-surface)] px-6 py-16 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <p className="display text-3xl">No videos yet</p>
              <p className="mt-2 max-w-sm text-sm text-[var(--cf-muted)]">When a video finishes, it will show up on this board.</p>
              <button type="button" onClick={onCreate} className="btn-primary mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-5 text-sm font-semibold text-white">
                Create a video
              </button>
            </div>
          ) : shown === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--cf-muted)]">No videos match that filter.</p>
          ) : (
            <VideoGrid
              videos={finished}
              generating={pending}
              view={view}
              resolveSrc={resolveSrc}
              downloadName={downloadName}
              onPlay={onPlay}
              onEdit={onEdit}
              onCreate={onCreate}
            />
          )}
        </div>
      </div>

      <MobileNav onVideos={() => undefined} onCreate={onCreate} onSong={onCreateSong} onAccount={onAccount} />

      {creditsOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="no-press absolute inset-0 bg-black/60" aria-label="Close credits" onClick={() => setCreditsOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border border-[var(--cf-line)] bg-[var(--cf-surface)] p-4 shadow-2xl" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Credits</p>
              <button type="button" onClick={() => setCreditsOpen(false)} className="no-press min-h-11 px-3 text-sm text-[var(--cf-muted)]">
                Close
              </button>
            </div>
            <CreditsWidget credits={credits} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ profile, compact = false }: { profile?: LibraryProfile | null; compact?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 ${compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"}`}>
      {profile?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (profile?.displayName || "A").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function FilmIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.8 6.2 10 8l-3.2 1.8V6.2Z" fill="currentColor" />
    </svg>
  );
}

function SongIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 12.2V3.2l7-1.2v8.4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="4.4" cy="12.2" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.4" cy="10.4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.4 10.4 13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
