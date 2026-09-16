import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "No session." }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, credits, plan")
    .eq("id", user.id)
    .maybeSingle();
  return NextResponse.json({
    id: user.id,
    email: data?.email || user.email,
    displayName: data?.display_name || user.email.split("@")[0] || "Account",
    credits: data?.credits ?? 120,
    plan: data?.plan || "free",
  });
}
