import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { prompt, model, system } = await req.json();
  const key = req.headers.get("x-api-key-override") || process.env.XAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing xAI API key" }, { status: 400 });

  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || "grok-4",
      messages,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    return NextResponse.json({ error: err }, { status: r.status });
  }
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ text, raw: data });
}
