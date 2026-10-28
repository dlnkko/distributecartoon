import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { workflowMinutes } from "@/lib/workflow-minutes";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE });
  const minutes = await workflowMinutes(user.id);
  return NextResponse.json({ minutes }, { headers: PRIVATE });
}
