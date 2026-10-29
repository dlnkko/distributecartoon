"use client";

import { useEffect, useState } from "react";

type KeyState = { saved?: boolean; hint?: string; member?: boolean };

const KEY_PROMISE = [
  "Encrypted before it is stored. The database only holds a sealed copy.",
  "Never sent back to your browser or shown again. Only the last four characters appear.",
  "Used only to render your own films. Remove it from your account any time.",
];

async function sendKey(apiKey: string) {
  const response = await fetch("/api/kie-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const body = (await response.json().catch(() => ({}))) as KeyState & { error?: string };
  if (!response.ok) throw new Error(body.error || "Couldn't save that key.");
  return body;
}

function KeyPromise() {
  return (
    <ul className="mt-4 space-y-2 rounded-2xl border border-black/[0.08] bg-[var(--cf-surface-2)] p-4 text-xs leading-relaxed text-[var(--muted)]">
      {KEY_PROMISE.map((line) => (
        <li key={line} className="flex gap-2">
          <span aria-hidden="true" className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#3d5afe]" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function KeyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="password"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-2 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2"
      placeholder="Paste the key from kie.ai"
      required
    />
  );
}

export function KieKeyGate() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/kie-key")
      .then(async (response) => (response.ok ? ((await response.json()) as KeyState) : null))
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
      await sendKey(apiKey);
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
          The membership pays for the Clickframes workflow. Video runs on your KIE account, so each render is billed there and stays cheap.
        </p>
        <KeyPromise />
        <label className="mt-5 block text-sm">
          KIE API key
          <KeyInput value={apiKey} onChange={setApiKey} />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy || apiKey.trim().length < 12} className="cf-btn btn-primary mt-5 w-full rounded-xl py-2.5 text-sm font-semibold">
          {busy ? "Saving…" : "Save key"}
        </button>
      </form>
    </div>
  );
}

export function KieKeyCard() {
  const [state, setState] = useState<KeyState | null>(null);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/kie-key")
      .then(async (response) => (response.ok ? ((await response.json()) as KeyState) : {}))
      .then((body) => {
        if (live) setState(body);
      })
      .catch(() => live && setState({}));
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = await sendKey(apiKey);
      setState((current) => ({ ...current, saved: true, hint: body.hint }));
      setApiKey("");
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't save that key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/kie-key", { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Couldn't remove the key.");
      setState((current) => ({ ...current, saved: false, hint: "" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't remove the key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--bg)] px-4 py-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="block text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Video billing</span>
          <span className="display mt-1 block text-xl">Your KIE key</span>
        </div>
        <span className="text-right text-xs tabular-nums text-[var(--muted)]">
          {state === null ? "Checking…" : state.saved ? `Saved, ends in ${state.hint}` : "Not added"}
        </span>
      </div>
      <KeyPromise />
      {editing ? (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <KeyInput value={apiKey} onChange={setApiKey} />
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={busy || apiKey.trim().length < 12} className="cf-btn btn-primary rounded-xl px-4 py-2 text-sm font-semibold">
              {busy ? "Saving…" : "Save key"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-[var(--muted)] hover:text-[var(--cf-ink)]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={busy || state === null} onClick={() => setEditing(true)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm">
            {state?.saved ? "Replace key" : "Add key"}
          </button>
          {state?.saved ? (
            <button type="button" disabled={busy} onClick={() => void remove()} className="text-sm text-[var(--muted)] hover:text-red-600">
              {busy ? "Removing…" : "Remove key"}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
