import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SEALED = "v1:";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The secret lives only in the server environment, never in the database, so a copy
// of the table alone cannot be turned back into anyone's key.
function sealingKey() {
  const raw = (process.env.KIE_KEY_SECRET || "").trim();
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

function seal(userId: string, apiKey: string) {
  const key = sealingKey();
  if (!key) return process.env.NODE_ENV === "development" ? apiKey : null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return SEALED + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function unseal(userId: string, stored: string) {
  if (!stored.startsWith(SEALED)) return stored;
  const key = sealingKey();
  if (!key) return "";
  try {
    const packed = Buffer.from(stored.slice(SEALED.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    console.warn("kie key could not be opened", userId);
    return "";
  }
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
  const stored = String(data?.api_key || "").trim();
  if (!stored) return "";
  const apiKey = unseal(userId, stored).trim();
  if (apiKey && !stored.startsWith(SEALED) && sealingKey()) await saveKieKey(userId, apiKey);
  return apiKey;
}

export async function kieKeyHint(userId: string) {
  const apiKey = await kieKeyForUser(userId);
  return apiKey ? apiKey.slice(-4) : "";
}

export async function saveKieKey(userId: string, apiKey: string) {
  const client = admin();
  const key = apiKey.trim();
  if (!client || !userId || !acceptableKieKey(key)) return false;
  const sealed = seal(userId, key);
  if (!sealed) {
    console.warn("kie key save refused: KIE_KEY_SECRET is missing");
    return false;
  }
  const { error } = await client.from("user_kie_keys").upsert({
    user_id: userId,
    api_key: sealed,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("kie key save failed", error.message);
  return !error;
}

export async function removeKieKey(userId: string) {
  const client = admin();
  if (!client || !userId) return false;
  const { error } = await client.from("user_kie_keys").delete().eq("user_id", userId);
  if (error) console.warn("kie key delete failed", error.message);
  return !error;
}
