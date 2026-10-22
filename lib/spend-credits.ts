import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const MAX_CREDITS = 20000;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdmin(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function spendCredits(
  amount: number,
  projectId: string,
): Promise<{ ok: true; credits: number } | { ok: false; error: string }> {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CREDITS || !projectId) {
    return { ok: false, error: "Couldn't price that video." };
  }
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims) {
    if (process.env.NODE_ENV === "development") return { ok: true, credits: -1 };
    return { ok: false, error: "Sign in first." };
  }
  if (process.env.NODE_ENV === "development") {
    const userId = String(claims.claims.sub || "");
    const client = admin();
    if (client && userId) {
      await client.from("generation_charges").insert({ user_id: userId, project_id: projectId, credits: amount });
    }
    return { ok: true, credits: -1 };
  }
  const { data, error } = await supabase.rpc("spend_credits_for_generation", {
    amount,
    project_id: projectId,
  });
  if (error) {
    const short = /not enough credits/i.test(error.message);
    return { ok: false, error: short ? `You need ${amount} credits to generate this video.` : "Couldn't use those credits." };
  }
  return { ok: true, credits: Number(data) };
}
