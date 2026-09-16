import { createClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    const claims = data.claims as { sub?: string; email?: string };
    if (!claims.sub) return null;
    return { id: claims.sub, email: claims.email || "" };
  } catch {
    return null;
  }
}
