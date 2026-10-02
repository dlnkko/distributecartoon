"use client";

import { createClient } from "@/lib/supabase/client";
import { CANONICAL_ORIGIN } from "@/lib/site";

export async function startCheckout(planId: string) {
  const next = `/checkout/${planId}`;
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = next;
    return;
  }
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const origin = local ? window.location.origin : CANONICAL_ORIGIN;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}
