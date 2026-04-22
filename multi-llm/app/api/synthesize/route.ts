import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300;

const SYNTH_SYSTEM = `You are a synthesis assistant. The user originally sent a single prompt to four leading AI models and received four answers. Your job is to produce ONE final answer that is better than any individual answer.

Do all of the following:
1. Fact-check the four answers against each other. Flag any contradiction, and state which answer(s) appear correct and why.
2. Extract the strongest ideas, wording, and evidence from each answer.
3. Merge them into a single coherent response that fits the original prompt's intent and format (e.g. if the prompt asks for an email, return an email; if it asks a question, answer the question).
4. Omit filler, repetition, and anything unverifiable.
5. If the four answers disagree on something important and you cannot resolve it, say so briefly at the end under "Unresolved:".

Return only the final response. Do not narrate your process unless the original prompt asks you to.`;

type Answer = { provider: string; model: string; text: string };

function buildUserMessage(originalPrompt: string, answers: Answer[]) {
  const blocks = answers
    .map(
      (a, i) =>
        `--- Answer ${i + 1} (${a.provider} / ${a.model}) ---\n${a.text.trim()}`
    )
    .join("\n\n");
  return `ORIGINAL PROMPT:\n${originalPrompt.trim()}\n\nFOUR CANDIDATE ANSWERS:\n\n${blocks}\n\nProduce the single best final response per the instructions.`;
}

export async function POST(req: NextRequest) {
  const { prompt, answers, target } = await req.json();
  if (!prompt || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: "Missing prompt or answers" }, { status: 400 });
  }

  const user = buildUserMessage(prompt, answers);
  const route =
    target === "openai"
      ? "openai"
      : target === "google"
        ? "google"
        : target === "xai"
          ? "xai"
          : "anthropic";

  const origin = new URL(req.url).origin;
  const forwardHeaders: Record<string, string> = { "content-type": "application/json" };
  const override = req.headers.get("x-api-key-override");
  if (override) forwardHeaders["x-api-key-override"] = override;

  const r = await fetch(`${origin}/api/${route}`, {
    method: "POST",
    headers: forwardHeaders,
    body: JSON.stringify({ prompt: user, system: SYNTH_SYSTEM }),
  });

  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
