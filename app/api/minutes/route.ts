import { NextResponse } from "next/server";
import { CONTACT_EMAIL } from "@/lib/site";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    brand?: string;
    minutes?: number;
    website?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "Check the name, email, and minutes." }, { status: 400 });
  if (body.website) return NextResponse.json({ ok: true });

  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 120);
  const brand = String(body.brand || "").trim().slice(0, 80);
  const minutes = Math.round(Number(body.minutes));
  if (!name || !EMAIL.test(email) || !Number.isInteger(minutes) || minutes < 61 || minutes > 100000) {
    return NextResponse.json({ error: "Check the name, email, and minutes." }, { status: 400 });
  }

  const sent = await deliverMinutes({ name, email, brand, minutes });
  if (!sent) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 502 });
  return NextResponse.json({ ok: true });
}

async function deliverMinutes(input: { name: string; email: string; brand: string; minutes: number }) {
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_EMAIL)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.clickframes.app",
        Referer: "https://www.clickframes.app/",
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        brand: input.brand || "None",
        minutes: String(input.minutes),
        _subject: `More minutes: ${input.minutes} for ${input.name}`,
        _template: "table",
        _captcha: "false",
        _replyto: input.email,
      }),
    });
    const detail = await response.text();
    const parsed = JSON.parse(detail) as { success?: string | boolean };
    const ok = response.ok && (parsed.success === true || parsed.success === "true");
    if (!ok) console.error("minutes form", response.status, detail.slice(0, 240));
    return ok;
  } catch (error) {
    console.error("minutes form", error instanceof Error ? error.message : "fetch failed");
    return false;
  }
}
