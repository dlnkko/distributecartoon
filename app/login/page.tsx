"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { CANONICAL_ORIGIN } from "@/lib/site";

export default function LoginPage() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setBusy(true);
    setStatus("");
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const origin = local ? window.location.origin : CANONICAL_ORIGIN;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setStatus(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="library-shell relative min-h-screen overflow-hidden">
      <div className="relative grid min-h-screen place-items-center px-4 py-10">
        <div className="pointer-events-none absolute -left-16 top-16 h-64 w-64 rounded-full bg-[#ff8a3d]/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-56 w-56 rounded-full bg-[#ff5e62]/20 blur-3xl" />
        <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[var(--cf-surface)] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <Brand tone="accent" />
          <h1 className="land-display mt-6 text-4xl text-white">Studio</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--cf-muted)]">
            Sign in with Google to save your shorts, credits, and generated videos.
          </p>
          {status ? <p className="mt-4 text-sm text-red-300">{status}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void signInWithGoogle()}
            className="btn-primary mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#141417] disabled:opacity-50"
          >
            <GoogleIcon />
            {busy ? "Redirecting…" : "Continue with Google"}
          </button>
        </section>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
