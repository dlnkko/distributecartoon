import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { activeMembership } from "@/lib/billing";
import { acceptableKieKey, hasKieKey, saveKieKey } from "@/lib/user-kie";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [saved, membership] = await Promise.all([hasKieKey(user.id), activeMembership()]);
  return NextResponse.json({ saved, member: Boolean(membership) });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = String(body.apiKey || "");
  if (!acceptableKieKey(apiKey)) {
    return NextResponse.json({ error: "That key does not look like a KIE API key." }, { status: 400 });
  }
  const saved = await saveKieKey(user.id, apiKey);
  if (!saved) return NextResponse.json({ error: "Couldn't save that key. Try again." }, { status: 500 });
  return NextResponse.json({ saved: true });
}
