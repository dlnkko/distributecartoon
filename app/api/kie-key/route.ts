import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { activeMembership } from "@/lib/billing";
import { acceptableKieKey, kieKeyHint, removeKieKey, saveKieKey } from "@/lib/user-kie";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE });
  const [hint, membership] = await Promise.all([kieKeyHint(user.id), activeMembership()]);
  return NextResponse.json({ saved: Boolean(hint), hint, member: Boolean(membership) }, { headers: PRIVATE });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE });
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = String(body.apiKey || "");
  if (!acceptableKieKey(apiKey)) {
    return NextResponse.json({ error: "That key does not look like a KIE API key." }, { status: 400, headers: PRIVATE });
  }
  const saved = await saveKieKey(user.id, apiKey);
  if (!saved) return NextResponse.json({ error: "Couldn't save that key. Try again." }, { status: 500, headers: PRIVATE });
  return NextResponse.json({ saved: true, hint: apiKey.trim().slice(-4) }, { headers: PRIVATE });
}

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE });
  const removed = await removeKieKey(user.id);
  if (!removed) return NextResponse.json({ error: "Couldn't remove the key. Try again." }, { status: 500, headers: PRIVATE });
  return NextResponse.json({ saved: false }, { headers: PRIVATE });
}
