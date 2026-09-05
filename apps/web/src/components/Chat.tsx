import { useState } from "react";
import { streamChat } from "../lib/api";
import type { Citation } from "@meu-gpt/shared";

export function Chat() {
  const [slot, setSlot] = useState<"fast" | "cheap" | "quality">("cheap");
  const [useRag, setUseRag] = useState(false);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ role: string; content: string }[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!input.trim() || busy) return;
    const user = { role: "user", content: input };
    setLog((l) => [...l, user]);
    setInput("");
    setBusy(true);
    setCitations([]);
    let acc = "";
    setLog((l) => [...l, { role: "assistant", content: "" }]);
    await streamChat(
      { slot, messages: [...log, user], useRag },
      {
        onToken: (t) => {
          acc += t;
          setLog((l) => {
            const c = [...l];
            c[c.length - 1] = { role: "assistant", content: acc };
            return c;
          });
        },
        onDone: (_full, cits) => {
          setCitations(cits);
          setBusy(false);
        },
        onError: (m) => {
          setLog((l) => [...l, { role: "system", content: `erro: ${m} — confira token (localStorage meu-gpt-token) e OPENROUTER_API_KEY no Worker.` }]);
          setBusy(false);
        },
      },
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">meu-gpt</h1>
        <select value={slot} onChange={(e) => setSlot(e.target.value as typeof slot)} className="rounded bg-zinc-800 px-2 py-1 text-sm">
          <option value="fast">fast</option>
          <option value="cheap">cheap</option>
          <option value="quality">quality</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-zinc-300">
          <input type="checkbox" checked={useRag} onChange={(e) => setUseRag(e.target.checked)} /> RAG
        </label>
      </header>

      <div className="flex flex-1 flex-col gap-2 rounded border border-zinc-800 p-3">
        {log.length === 0 && <p className="text-sm text-zinc-500">Pergunte algo. Ligue RAG depois de ingerir um doc via POST /api/v1/documents/ingest.</p>}
        {log.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end rounded bg-zinc-800 px-3 py-2 text-sm" : "rounded bg-zinc-900 px-3 py-2 text-sm"}>
            <span className="mb-1 block text-[11px] uppercase text-zinc-500">{m.role}</span>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {citations.length > 0 && (
          <div className="rounded border border-zinc-800 p-2 text-xs text-zinc-400">
            <p className="mb-1 font-semibold">Citações (evento final):</p>
            {citations.map((c) => (
              <p key={c.chunkId}>[{c.title}] {c.chunkId} — score {c.score.toFixed(3)}</p>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="digite e Enter..."
          className="flex-1 rounded bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <button onClick={send} disabled={busy} className="rounded bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50">
          {busy ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
