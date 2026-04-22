import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { prompt, model, system } = await req.json();
  const key =
    req.headers.get("x-api-key-override") || process.env.GOOGLE_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing Google API key" }, { status: 400 });

  const modelId = model || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const err = await r.text();
    return NextResponse.json({ error: err }, { status: r.status });
  }
  const data = await r.json();
  const text =
    (data.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text)
      .filter(Boolean)
      .join("\n") || "";
  return NextResponse.json({ text, raw: data });
}
