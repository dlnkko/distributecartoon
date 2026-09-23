import { after, NextResponse } from "next/server";
import { driveProduce } from "@/lib/produce";
import { activeProjectIds, workerTokenMatches } from "@/lib/worker-db";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(request: Request) {
  if (!workerTokenMatches(request.headers.get("x-worker-token"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ids = await activeProjectIds();
  after(Promise.allSettled(ids.map((id) => driveProduce(id, 120_000))));
  return NextResponse.json({ ok: true, active: ids.length });
}
