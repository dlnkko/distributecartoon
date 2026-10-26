"use client";

import { useEffect, useState } from "react";

export function KieKeyGate() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/kie-key")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { saved?: boolean; member?: boolean };
      })
      .then((body) => {
        if (live && body?.member && !body.saved) setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/kie-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Couldn't save that key.");
      setApiKey("");
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't save that key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-dark fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-[var(--cf-line)] bg-[var(--cf-surface)] p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Your plan is active</p>
        <h2 className="display mt-2 text-2xl">Add your KIE API key</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          The membership pays for the Clickframes workflow. Video runs on your KIE account, so each render is billed there and stays cheap. This key is used only for your films.
        </p>
        <label className="mt-5 block text-sm">
          KIE API key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
            placeholder="Paste the key from kie.ai"
            required
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={busy || apiKey.trim().length < 12} className="cf-btn btn-primary mt-5 w-full rounded-xl py-2.5 text-sm font-semibold">
          {busy ? "Saving…" : "Save key"}
        </button>
      </form>
    </div>
  );
}
