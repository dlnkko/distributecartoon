"use client";

import { useEffect, useState } from "react";

type Membership = {
  id: string | null;
  plan: string;
  name: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceling: "Cancels at period end",
  canceled: "Canceled",
  completed: "Paid",
  expired: "Expired",
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MembershipPanel({ onClose }: { onClose: () => void }) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/membership")
      .then(async (response) => {
        const body = (await response.json()) as { membership?: Membership | null; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load the membership.");
        return body.membership || null;
      })
      .then((next) => {
        if (live) setMembership(next);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Could not load the membership.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const canCancel = Boolean(membership && !["canceled", "expired", "canceling"].includes(membership.status) && !membership.cancelAtPeriodEnd);
  const period = formatDate(membership?.periodEnd || null);
  const keepsAccess = membership?.status === "active" || membership?.status === "trialing" || membership?.status === "past_due";

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/membership", { method: "POST" });
      const body = (await response.json()) as { membership?: Membership | null; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not cancel the membership.");
      setMembership(body.membership || null);
      setConfirming(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel the membership.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-dark fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[var(--cf-line)] bg-[var(--cf-surface)] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Membership</p>
            <h3 className="display mt-1 text-2xl">{membership?.name || "Your plan"}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[var(--muted)]">
            Close
          </button>
        </div>

        {loading ? <p className="mt-5 text-sm text-[var(--muted)]">Loading membership…</p> : null}

        {!loading && !membership ? <p className="mt-5 text-sm text-[var(--muted)]">You don&apos;t have a membership.</p> : null}

        {!loading && membership ? (
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-[var(--bg)] px-4 py-3">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Status</dt>
              <dd>{STATUS_LABEL[membership.status] || membership.status}</dd>
            </div>
            {period && membership.status !== "canceled" && membership.status !== "expired" ? (
              <div className="flex items-center justify-between rounded-2xl bg-[var(--bg)] px-4 py-3">
                <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{membership.cancelAtPeriodEnd || membership.status === "canceling" ? "Access until" : "Renews"}</dt>
                <dd>{period}</dd>
              </div>
            ) : null}
            {membership.status === "completed" ? <p className="px-1 text-xs text-[var(--muted)]">This purchase does not renew.</p> : null}
            {membership.status === "canceling" || membership.cancelAtPeriodEnd ? <p className="px-1 text-xs text-[var(--muted)]">Cancellation is scheduled. You keep access until the current period ends.</p> : null}
          </dl>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

        {canCancel && !confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="mt-5 w-full rounded-2xl border border-[var(--line)] px-4 py-2.5 text-sm">
            Cancel membership
          </button>
        ) : null}

        {canCancel && confirming ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] p-3">
            <p className="text-sm">{keepsAccess ? "Cancel this membership? You keep access until the current period ends." : "Cancel this membership now?"}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="min-h-10 flex-1 rounded-xl border border-[var(--line)] px-3 text-sm">
                Keep it
              </button>
              <button type="button" onClick={() => void cancel()} disabled={busy} className="min-h-10 flex-1 rounded-xl bg-[linear-gradient(135deg,var(--cf-accent-a),var(--cf-accent-b))] px-3 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Canceling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
