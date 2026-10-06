"use client";

import { useEffect, useRef, useState } from "react";

type Clip = { mp4: string; webm: string; poster: string; label: string };

export function VideoCard({
  clip,
  ratio = "aspect-video",
  play = "view",
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
  const held = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const framed = Boolean(clip.poster) && !clip.poster.endsWith("/poster.svg");

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
  }, [clip.mp4]);

  useEffect(() => {
    const video = ref.current;
    const node = box.current;
    if (!video || !node || failed) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (play === "always") {
      void video.play().catch(() => undefined);
      return;
    }
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (play === "hover" && fine) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !held.current) {
          video.muted = true;
          void video.play().catch(() => undefined);
        } else video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [failed, play, clip.mp4]);

  function hover(on: boolean) {
    const video = ref.current;
    if (!video || failed || play !== "hover") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;
    if (on) {
      video.muted = true;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }

  function toggle() {
    const video = ref.current;
    if (!video || failed) return;
    if (video.paused) {
      held.current = false;
      video.muted = true;
      void video.play().catch(() => undefined);
    } else {
      held.current = true;
      video.pause();
    }
  }

  return (
    <figure
      ref={box}
      className={`film-frame relative overflow-hidden bg-[#101014] ${ratio} ${className}`}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
    >
      {framed ? <img src={clip.poster} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      {failed ? null : (
        <video
          ref={ref}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
          poster={clip.poster}
          muted
          loop
          playsInline
          preload={framed || play === "always" ? "auto" : "none"}
          autoPlay={play === "always"}
          aria-label={clip.label}
          onCanPlay={() => setReady(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
        >
          {clip.webm ? <source src={clip.webm} type="video/webm" /> : null}
          <source src={clip.mp4} type="video/mp4" />
        </video>
      )}
      {ready || framed || failed ? null : <Clapper label={clip.label} />}
      <figcaption className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/70">
        <span>{clip.label.replace(/-/g, " ")}</span>
        <span>{frame}</span>
      </figcaption>
      {failed ? null : (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm"
        >
          {playing ? "Pause" : "Play"}
        </button>
      )}
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
