"use client";

import type { LibraryZone } from "@/components/library/types";

export function MobileNav({
  zone,
  onVideos,
  onDrafts,
  onProducts,
  onStories,
  onCreate,
  onSong,
  onAccount,
  createLocked = false,
}: {
  zone: LibraryZone;
  onVideos: () => void;
  onDrafts: () => void;
  onProducts: () => void;
  onStories: () => void;
  onCreate: () => void;
  onSong: () => void;
  onAccount: () => void;
  createLocked?: boolean;
}) {
  const items = [
    { label: "Create", onClick: onCreate, icon: PlusGlyph, active: false, locked: createLocked },
    { label: "Suno", onClick: onSong, icon: SongGlyph, active: false, locked: createLocked },
    { label: "Videos", onClick: onVideos, icon: VideosGlyph, active: zone === "videos", locked: false },
    { label: "Stories", onClick: onStories, icon: StoryGlyph, active: zone === "stories", locked: false },
    { label: "Products", onClick: onProducts, icon: ProductGlyph, active: zone === "products", locked: false },
    { label: "Drafts", onClick: onDrafts, icon: DraftGlyph, active: zone === "drafts", locked: false },
    { label: "Account", onClick: onAccount, icon: AccountGlyph, active: false, locked: false },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cf-line)] bg-[rgba(20,20,23,0.82)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-7">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={item.onClick}
              disabled={item.locked}
              className={`no-press flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${item.active ? "text-white" : "text-[var(--cf-muted)]"}`}
            >
              <item.icon />
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function StoryGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3.2h6.2L12.5 6.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3.7a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8h5M5 10.5h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ProductGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5.5 8 3l5 2.5v6L8 14.5 3 11.5v-6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 8.2V14" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function VideosGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.8 6.2 10 8l-3.2 1.8V6.2Z" fill="currentColor" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SongGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 12.2V3.2l7-1.2v8.4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="4.4" cy="12.2" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.4" cy="10.4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DraftGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.5h5.2L12.5 5.8V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-10A.5.5 0 0 1 4 2.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 2.8V6h3.2M5.2 8.5h5.6M5.2 11h3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function AccountGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 13.2c.7-2 2.4-3 4.5-3s3.8 1 4.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
