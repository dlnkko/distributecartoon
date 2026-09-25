"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

export function WhopPay({
  projectId,
  email,
  onPaid,
  onClose,
}: {
  projectId: string;
  email?: string;
  onPaid: (project: Project) => void;
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((response) => response.json())
      .then((json: { sessionId?: string; paid?: boolean; project?: Project; error?: string }) => {
        if (cancelled) return;
        if (json.paid && json.project) {
          onPaid(json.project);
          return;
        }
        if (json.sessionId) setSessionId(json.sessionId);
        else setError(json.error || "Couldn't start checkout.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't start checkout.");
      });
    return () => {
      cancelled = true;
    };
    // onPaid is only used if this project was already paid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function finish(paymentId?: string) {
    if (!paymentId) {
      setError("Waiting for Whop to confirm the payment.");
      return;
    }
    const response = await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, paymentId }),
    });
    const json = (await response.json()) as { project?: Project; error?: string };
    if (json.project?.paidAt) onPaid(json.project);
    else setError(json.error || "Payment is not complete yet.");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-medium">Pay to generate</h3>
          <button type="button" onClick={onClose} className="text-sm text-stone-500">
            Close
          </button>
        </div>
        {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {sessionId ? (
          <WhopCheckoutEmbed
            sessionId={sessionId}
            theme="light"
            returnUrl="https://distribute.to"
            prefill={email ? { email } : undefined}
            onComplete={(_planId, receiptId) => {
              void finish(typeof receiptId === "string" ? receiptId : undefined);
            }}
          />
        ) : !error ? (
          <p className="text-sm text-[var(--muted)]">Loading checkout…</p>
        ) : null}
      </div>
    </div>
  );
}
