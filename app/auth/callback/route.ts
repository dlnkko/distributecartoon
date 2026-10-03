import { NextResponse } from "next/server";
import { CANONICAL_ORIGIN, isAliasHost } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base =
    !isLocal && forwardedHost
      ? isAliasHost(forwardedHost) ? CANONICAL_ORIGIN : `https://${forwardedHost.split(",")[0].trim()}`
      : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(safeNext, base));
      response.cookies.set("cf-signed-out", "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=google", base));
}
