import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { cancelMembership, loadMembership } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const membership = await loadMembership(user.id);
    return NextResponse.json({ membership });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the membership.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const result = await cancelMembership(user.id);
    if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel the membership.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
