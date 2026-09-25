import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { confirmWhopPayment } from "@/lib/whop";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; paymentId?: string };
  if (!body.projectId || !body.paymentId) {
    return NextResponse.json({ error: "Missing payment." }, { status: 400 });
  }
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  try {
    const project = await confirmWhopPayment(loaded.project, body.paymentId);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment is not complete yet." },
      { status: 409 },
    );
  }
}
