import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        if (headers) {
          Object.entries(headers).forEach(([header, value]) => supabaseResponse.headers.set(header, value));
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path === "/login" || path.startsWith("/auth/") || path.startsWith("/checkout/");
  const isApi = path.startsWith("/api/");

  if (!data?.claims && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (data?.claims && path === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return copyCookies(supabaseResponse, NextResponse.redirect(new URL(safe, request.url)));
  }

  return supabaseResponse;
}
