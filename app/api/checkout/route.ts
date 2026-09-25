import { NextResponse } from "next/server";
import { loadOwnedProject } from "@/lib/auth";
import { whopClient, whopConfig, whopReady } from "@/lib/whop";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!projectId) return NextResponse.json({ enabled: whopReady() });
  const loaded = await loadOwnedProject(projectId);
  if ("response" in loaded) return loaded.response;
  return NextResponse.json({ enabled: whopReady(), paid: Boolean(loaded.project.paidAt) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string };
  if (!body.projectId) return NextResponse.json({ error: "Missing project." }, { status: 400 });
  const loaded = await loadOwnedProject(body.projectId);
  if ("response" in loaded) return loaded.response;
  const { user, project } = loaded;
  if (project.paidAt) return NextResponse.json({ paid: true, project });
  if (!whopReady()) {
    return NextResponse.json({ error: "Whop is not configured yet." }, { status: 503 });
  }

  const { companyId, planId } = whopConfig();
  const checkout = await whopClient().checkoutConfigurations.create({
    account_id: companyId,
    plan_id: planId,
    mode: "payment",
    metadata: { project_id: project.id, user_id: user.id },
    redirect_url: "https://distribute.to",
  });
  return NextResponse.json({ sessionId: checkout.id });
}
