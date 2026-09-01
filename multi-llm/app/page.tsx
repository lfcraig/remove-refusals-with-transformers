"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProviderId = "anthropic" | "openai" | "google" | "xai";

type Provider = {
  id: ProviderId;
  label: string;
  defaultModel: string;
};

const PROVIDERS: Provider[] = [
  { id: "anthropic", label: "Claude", defaultModel: "claude-opus-4-7" },
  { id: "openai", label: "ChatGPT", defaultModel: "gpt-5" },
  { id: "google", label: "Gemini", defaultModel: "gemini-2.5-pro" },
  { id: "xai", label: "Grok", defaultModel: "grok-4" },
];

type Result = {
  status: "idle" | "loading" | "done" | "error";
  text: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
};

type Settings = {
  keys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  synthTarget: ProviderId;
  enabled: Record<ProviderId, boolean>;
};

const defaultSettings = (): Settings => ({
  keys: { anthropic: "", openai: "", google: "", xai: "" },
  models: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.defaultModel])) as Settings["models"],
  synthTarget: "anthropic",
  enabled: { anthropic: true, openai: true, google: true, xai: true },
});

const STORAGE_KEY = "multi-llm.settings.v1";

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [results, setResults] = useState<Record<ProviderId, Result>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.id, { status: "idle", text: "" }])) as any
  );
  const [synthesis, setSynthesis] = useState<Result>({ status: "idle", text: "" });
  const [loaded, setLoaded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...defaultSettings(), ...parsed, keys: { ...defaultSettings().keys, ...(parsed.keys || {}) }, models: { ...defaultSettings().models, ...(parsed.models || {}) }, enabled: { ...defaultSettings().enabled, ...(parsed.enabled || {}) } });
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings, loaded]);

  const activeProviders = useMemo(
    () => PROVIDERS.filter((p) => settings.enabled[p.id]),
    [settings.enabled]
  );

  const anyLoading =
    Object.values(results).some((r) => r.status === "loading") ||
    synthesis.status === "loading";
  const allDone =
    activeProviders.length > 0 &&
    activeProviders.every((p) => results[p.id].status === "done");

  async function callProvider(p: Provider, text: string) {
    const started = Date.now();
    setResults((r) => ({ ...r, [p.id]: { status: "loading", text: "", startedAt: started } }));
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const key = settings.keys[p.id]?.trim();
      if (key) headers["x-api-key-override"] = key;
      const res = await fetch(`/api/${p.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: text, model: settings.models[p.id] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({ ...r, [p.id]: { status: "error", text: "", error: typeof data?.error === "string" ? data.error : JSON.stringify(data?.error ?? data), startedAt: started, endedAt: Date.now() } }));
        return;
      }
      setResults((r) => ({ ...r, [p.id]: { status: "done", text: data.text || "(empty response)", startedAt: started, endedAt: Date.now() } }));
    } catch (e: any) {
      setResults((r) => ({ ...r, [p.id]: { status: "error", text: "", error: e?.message || String(e), startedAt: started, endedAt: Date.now() } }));
    }
  }

  async function askAll() {
    const text = prompt.trim();
    if (!text) return;
    setSynthesis({ status: "idle", text: "" });
    // reset only active ones; keep disabled providers as idle blanks
    setResults((r) => {
      const next = { ...r };
      for (const p of PROVIDERS) {
        next[p.id] = settings.enabled[p.id]
          ? { status: "loading", text: "" }
          : { status: "idle", text: "" };
      }
      return next;
    });
    await Promise.all(activeProviders.map((p) => callProvider(p, text)));
  }

  async function synthesize() {
    const answers = activeProviders
      .map((p) => ({ provider: p.label, model: settings.models[p.id], text: results[p.id].text }))
      .filter((a) => a.text && a.text.trim().length > 0);
    if (answers.length === 0) return;

    const started = Date.now();
    setSynthesis({ status: "loading", text: "", startedAt: started });
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const key = settings.keys[settings.synthTarget]?.trim();
      if (key) headers["x-api-key-override"] = key;
      const res = await fetch(`/api/synthesize`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, answers, target: settings.synthTarget }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSynthesis({ status: "error", text: "", error: typeof data?.error === "string" ? data.error : JSON.stringify(data?.error ?? data), startedAt: started, endedAt: Date.now() });
        return;
      }
      setSynthesis({ status: "done", text: data.text || "(empty response)", startedAt: started, endedAt: Date.now() });
    } catch (e: any) {
      setSynthesis({ status: "error", text: "", error: e?.message || String(e), startedAt: started, endedAt: Date.now() });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      askAll();
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  const duration = (r: Result) =>
    r.startedAt && r.endedAt ? `${((r.endedAt - r.startedAt) / 1000).toFixed(1)}s` : "";

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>Multi-LLM</h1>
          <div className="sub">One prompt → Claude, ChatGPT, Gemini, Grok → synthesize.</div>
        </div>
        <div className="inline">
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            ⚙︎ Settings
          </button>
        </div>
      </header>

      <textarea
        ref={taRef}
        className="prompt"
        placeholder="Ask once. Compare four answers. Synthesize the best one.  (⌘/Ctrl + Enter to send)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="actions">
        <button className="btn primary" onClick={askAll} disabled={!prompt.trim() || anyLoading}>
          {anyLoading ? "Running…" : `Ask all ${activeProviders.length}`}
        </button>
        <button
          className="btn synth"
          onClick={synthesize}
          disabled={!allDone || anyLoading}
          title={allDone ? "Fact-check + merge all answers" : "Waiting for all answers"}
        >
          Synthesize ({PROVIDERS.find((p) => p.id === settings.synthTarget)?.label})
        </button>
        <div className="spacer" />
        <span className="muted">
          Tip: <span className="kbd">⌘/Ctrl</span> + <span className="kbd">Enter</span> to send
        </span>
      </div>

      <div className="grid">
        {PROVIDERS.map((p) => {
          const r = results[p.id];
          const disabled = !settings.enabled[p.id];
          return (
            <div
              key={p.id}
              className={`card ${r.status === "loading" ? "loading" : ""}`}
              style={disabled ? { opacity: 0.4 } : undefined}
            >
              <header>
                <div className="provider">
                  <span className={`dot ${p.id}`} />
                  {p.label}
                </div>
                <span className="model">{settings.models[p.id]}</span>
              </header>
              <div className="body">
                {disabled
                  ? "(disabled in settings)"
                  : r.status === "error"
                    ? ""
                    : r.text || (r.status === "loading" ? "" : "—")}
              </div>
              <div className="status">
                <span>
                  {r.status === "loading" && "thinking…"}
                  {r.status === "done" && `done · ${duration(r)}`}
                  {r.status === "error" && <span className="err">error</span>}
                  {r.status === "idle" && !disabled && "ready"}
                </span>
                {r.status === "done" && (
                  <button className="copy-btn" onClick={() => copy(r.text)}>
                    Copy
                  </button>
                )}
                {r.status === "error" && (
                  <span className="err" title={r.error} style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.error}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(synthesis.status !== "idle") && (
        <div className="synthesis">
          <header>
            <div className="provider">
              <span className="dot" style={{ background: "var(--accent-2)" }} />
              Synthesis
              <span className="model" style={{ marginLeft: 8 }}>
                via {PROVIDERS.find((p) => p.id === settings.synthTarget)?.label} ({settings.models[settings.synthTarget]})
              </span>
            </div>
            {synthesis.status === "done" && (
              <button className="copy-btn" onClick={() => copy(synthesis.text)}>Copy</button>
            )}
          </header>
          <div className="body">
            {synthesis.status === "loading" && "Merging and fact-checking…"}
            {synthesis.status === "done" && synthesis.text}
            {synthesis.status === "error" && <span className="err">Error: {synthesis.error}</span>}
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}

function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<Settings>(settings);

  function save() {
    onChange(local);
    onClose();
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>Settings</strong>
          <button className="icon-btn" onClick={onClose}>Close</button>
        </header>
        <div className="body">
          <div className="muted">
            Keys are stored only in this browser (localStorage). They are sent per-request to the built-in proxy routes on this server, which forward them to the provider. If the server has keys configured in env vars, leave these blank to use those.
          </div>

          {PROVIDERS.map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div className="inline" style={{ justifyContent: "space-between" }}>
                <label className="inline" style={{ gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={local.enabled[p.id]}
                    onChange={(e) =>
                      setLocal({ ...local, enabled: { ...local.enabled, [p.id]: e.target.checked } })
                    }
                  />
                  <strong>{p.label}</strong>
                </label>
              </div>
              <div className="field">
                <label>API key</label>
                <input
                  type="password"
                  placeholder={`${p.label} API key`}
                  value={local.keys[p.id]}
                  onChange={(e) => setLocal({ ...local, keys: { ...local.keys, [p.id]: e.target.value } })}
                />
              </div>
              <div className="field">
                <label>Model</label>
                <input
                  type="text"
                  placeholder={p.defaultModel}
                  value={local.models[p.id]}
                  onChange={(e) => setLocal({ ...local, models: { ...local.models, [p.id]: e.target.value } })}
                />
              </div>
            </div>
          ))}

          <div className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <label>Synthesis target (which model merges + fact-checks)</label>
            <select
              value={local.synthTarget}
              onChange={(e) => setLocal({ ...local, synthTarget: e.target.value as ProviderId })}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
