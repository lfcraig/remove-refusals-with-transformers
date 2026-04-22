# Multi-LLM

One prompt → Claude, ChatGPT, Gemini, and Grok answer in parallel → one-click "Synthesize" pass that merges the four answers into a single fact-checked final response.

Works on phone and desktop from one URL. API keys are handled server-side via env vars (recommended) or pasted once in the in-app Settings (stored only in your browser's `localStorage`).

## Quick start

```bash
cd multi-llm
npm install
cp .env.local.example .env.local   # (optional) paste keys here to avoid pasting them in the UI
npm run dev
```

Open http://localhost:3000.

## Deploy (recommended: Vercel)

```bash
# from inside multi-llm/
npx vercel
```

Set these env vars in the Vercel project (any subset — whichever you have):

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`

You now have a single URL you can open on phone + work PC + personal PC.

## How it works

- `app/page.tsx` — single-page UI: prompt box, four result cards, synthesis card, settings modal.
- `app/api/anthropic | openai | google | xai / route.ts` — thin server-side proxies. Each accepts `{ prompt, model, system }` and forwards to the corresponding provider using either the `X-Api-Key-Override` request header (from the browser) or the matching env var.
- `app/api/synthesize/route.ts` — takes `{ prompt, answers[], target }`, builds a merge+fact-check instruction, and routes through the chosen provider.

## Default models

Editable per-model in the Settings modal:

| Provider  | Default model        |
|-----------|----------------------|
| Claude    | `claude-opus-4-7`    |
| ChatGPT   | `gpt-5`              |
| Gemini    | `gemini-2.5-pro`     |
| Grok      | `grok-4`             |

## Shortcuts

- `⌘/Ctrl + Enter` — send the prompt to all enabled providers.

## Notes

- The synthesis pass is one additional API call (to your chosen target), not four. If you want four separate synthesis passes for maximum cross-checking, it's an easy extension — the route already takes a `target` parameter.
- Disabling a provider in Settings skips it entirely (useful if you run out of credit on one).
- Nothing is persisted server-side. Prompts and responses live only in your browser tab until you close it.
