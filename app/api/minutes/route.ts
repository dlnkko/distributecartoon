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
  if (!body || body.website) return NextResponse.json({ ok: true });

  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 120);
  const brand = String(body.brand || "").trim().slice(0, 80);
  const minutes = Math.round(Number(body.minutes));
  if (!name || !EMAIL.test(email) || !Number.isInteger(minutes) || minutes < 61 || minutes > 100000) {
    return NextResponse.json({ error: "Check the name, email, and minutes." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(CONTACT_EMAIL)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name,
        email,
        brand: brand || "None",
        minutes: String(minutes),
        _subject: `More minutes: ${minutes} for ${name}`,
        _template: "table",
        _captcha: "false",
        _replyto: email,
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 502 });
  }
}
