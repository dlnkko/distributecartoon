import { NextResponse } from "next/server";
import { providerStatus, saveSecrets } from "@/lib/config";

export async function GET() {
  return NextResponse.json(providerStatus());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    openaiApiKey?: string;
    kieApiKey?: string;
    falKey?: string;
    openaiModel?: string;
  };
  const next = saveSecrets({
    ...(body.openaiApiKey ? { openaiApiKey: body.openaiApiKey } : {}),
    ...(body.kieApiKey ? { kieApiKey: body.kieApiKey } : {}),
    ...(body.falKey ? { falKey: body.falKey } : {}),
    ...(body.openaiModel ? { openaiModel: body.openaiModel } : {}),
  });
  return NextResponse.json({
    ...providerStatus(),
    saved: Boolean(next.openaiApiKey || next.kieApiKey || next.falKey),
  });
}
