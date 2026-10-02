import { createClient } from "@/lib/supabase/server";

export async function spendCredits(amount: number): Promise<{ ok: true; credits: number } | { ok: false; error: string }> {
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, error: "Couldn't price that video." };
  }
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims) {
    if (process.env.NODE_ENV === "development") return { ok: true, credits: -1 };
    return { ok: false, error: "Sign in first." };
  }
  const { data, error } = await supabase.rpc("spend_credits", { amount });
  if (error) {
    const short = /not enough credits/i.test(error.message);
    return { ok: false, error: short ? `You need ${amount} credits to generate this video.` : "Couldn't use those credits." };
  }
  return { ok: true, credits: Number(data) };
}
