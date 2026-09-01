import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { prompt, model, system } = await req.json();
  const key =
    req.headers.get("x-api-key-override") || process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing Anthropic API key" }, { status: 400 });

  const body: any = {
    model: model || "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const err = await r.text();
    return NextResponse.json({ error: err }, { status: r.status });
  }
  const data = await r.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return NextResponse.json({ text, raw: data });
}
