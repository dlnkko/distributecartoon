"use client";

import { useEffect, useRef, useState } from "react";

type Clip = { mp4: string; webm: string; poster: string; label: string };

export function VideoCard({
  clip,
  ratio = "aspect-video",
  play = "hover",
  frame = "01",
  className = "",
}: {
  clip: Clip;
  ratio?: string;
  play?: "hover" | "view" | "always";
  frame?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    const node = box.current;
    if (!video || !node || failed || play === "always") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (play === "hover" && fine) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.55 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [failed, play, clip.mp4]);

  function hover(on: boolean) {
    const video = ref.current;
    if (!video || failed || play === "always") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;
    if (on) void video.play().catch(() => undefined);
    else {
      video.pause();
      video.currentTime = 0;
    }
  }

  return (
    <figure
      ref={box}
      className={`film-frame relative overflow-hidden bg-[#101014] ${ratio} ${className}`}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
    >
      {failed ? null : (
        <video
          ref={ref}
          className={`h-full w-full object-cover ${ready ? "opacity-100" : "opacity-0"}`}
          poster={clip.poster}
          muted
          loop
          playsInline
          preload={play === "always" ? "metadata" : "none"}
          autoPlay={play === "always"}
          aria-label={clip.label}
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
        >
          {clip.webm ? <source src={clip.webm} type="video/webm" /> : null}
          <source src={clip.mp4} type="video/mp4" />
        </video>
      )}
      {ready && !failed ? null : <Clapper label={clip.label} />}
      <figcaption className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/70">
        <span>{clip.label.replace(/-/g, " ")}</span>
        <span>{frame}</span>
      </figcaption>
    </figure>
  );
}

function Clapper({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-end bg-[url('/media/poster.svg')] bg-cover p-4">
      <div className="land-clapper w-full max-w-xs" aria-hidden="true">
        <div className="land-clapper-sticks" />
        <p className="px-3 py-2 text-xs text-white/80">{label}</p>
      </div>
    </div>
  );
}
