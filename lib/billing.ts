import { createClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveMembership(userId: string, plan: string, paymentId: string) {
  const client = admin();
  if (!client || !userId) return false;
  const { error } = await client.from("memberships").upsert({
    user_id: userId,
    plan,
    status: "active",
    whop_payment_id: paymentId || null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("membership save failed", error.message);
  return !error;
}

export async function activeMembership() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("memberships").select("plan, status").eq("status", "active").maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
