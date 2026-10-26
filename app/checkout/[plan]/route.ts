import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL("/#workflow", origin));
}
