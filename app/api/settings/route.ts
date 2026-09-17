import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { providerStatus } from "@/lib/config";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(providerStatus());
}

export async function POST() {
  return NextResponse.json({ error: "Keys are configured on the server." }, { status: 403 });
}
