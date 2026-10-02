"use client";

import { useState } from "react";

export function BeforeAfter() {
  const [spot, setSpot] = useState(56);

  return (
    <div className="film-frame relative aspect-video overflow-hidden bg-[#101014]">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        poster="/media/poster.svg"
        muted
        loop
        playsInline
        preload="none"
        aria-label="Animated character"
      >
        <source src="/media/personal-after.webm" type="video/webm" />
        <source src="/media/personal-after.mp4" type="video/mp4" />
      </video>
      <img
        src="/media/personal-before.jpg"
        alt="The original photo"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - spot}% 0 0)` }}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${spot}%` }}>
        <div className="h-full w-px bg-white/80" />
      </div>
      <div className="pointer-events-none absolute left-3 top-3 text-[10px] uppercase tracking-[0.16em] text-white/70">
        Photo
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-[10px] uppercase tracking-[0.16em] text-white/70">
        Character
      </div>
      <input
        className="absolute inset-x-0 bottom-3 mx-auto w-[calc(100%-1.5rem)]"
        type="range"
        min={8}
        max={92}
        value={spot}
        aria-label="Compare the photo and the animated character"
        onChange={(event) => setSpot(Number(event.target.value))}
      />
    </div>
  );
}
