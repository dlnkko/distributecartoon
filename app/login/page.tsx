"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setStatus("Check your email to confirm the account.");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <form onSubmit={(event) => void onSubmit(event)} className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-7 shadow-[0_20px_60px_rgba(28,25,23,0.08)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[var(--accent)]">distribute.to</p>
        <h1 className="display mt-2 text-3xl text-[var(--ink)]">Studio</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Sign in to save your chats, credits, and generated videos.
        </p>
        <label className="mt-6 block text-sm font-medium">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
          />
        </label>
        {status ? <p className="mt-3 text-sm text-[var(--danger)]">{status}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary mt-5 w-full rounded-2xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-sm text-[var(--muted)]"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
        <button
          type="button"
          className="mt-4 w-full text-sm font-medium text-[var(--ink)]"
          onClick={() => {
            router.replace("/");
            router.refresh();
          }}
        >
          Continue to studio
        </button>
      </form>
    </main>
  );
}
