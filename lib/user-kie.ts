import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function acceptableKieKey(value: string) {
  const key = value.trim();
  return key.length >= 12 && key.length <= 200 && !/\s/.test(key);
}

export async function kieKeyForUser(userId: string) {
  const client = admin();
  if (!client || !userId) return "";
  const { data, error } = await client.from("user_kie_keys").select("api_key").eq("user_id", userId).maybeSingle();
  if (error) {
    console.warn("kie key read failed", error.message);
    return "";
  }
  return String(data?.api_key || "").trim();
}

export async function hasKieKey(userId: string) {
  return Boolean(await kieKeyForUser(userId));
}

export async function saveKieKey(userId: string, apiKey: string) {
  const client = admin();
  const key = apiKey.trim();
  if (!client || !userId || !acceptableKieKey(key)) return false;
  const { error } = await client.from("user_kie_keys").upsert({
    user_id: userId,
    api_key: key,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("kie key save failed", error.message);
  return !error;
}
