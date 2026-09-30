"use client";

export function MobileNav({
  onVideos,
  onCreate,
  onSong,
  onAccount,
}: {
  onVideos: () => void;
  onCreate: () => void;
  onSong: () => void;
  onAccount: () => void;
}) {
  const items = [
    { label: "Your videos", onClick: onVideos, icon: VideosGlyph, active: true },
    { label: "Create", onClick: onCreate, icon: PlusGlyph, active: false },
    { label: "Suno video", onClick: onSong, icon: SongGlyph, active: false },
    { label: "Account", onClick: onAccount, icon: AccountGlyph, active: false },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cf-line)] bg-[rgba(20,20,23,0.82)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={item.onClick}
              className={`no-press flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] ${item.active ? "text-white" : "text-[var(--cf-muted)]"}`}
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

function AccountGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 13.2c.7-2 2.4-3 4.5-3s3.8 1 4.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
