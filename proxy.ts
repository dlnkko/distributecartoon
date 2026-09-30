import { NextResponse, type NextRequest } from "next/server";
import { CANONICAL_ORIGIN, isAliasHost } from "@/lib/site";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0];
  if (isAliasHost(host)) {
    const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_ORIGIN);
    return NextResponse.redirect(url, 308);
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/media|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
