"use client";
import { useEffect, useState } from "react";
type Reply = {
  event: { id: string; type: string; snippet: string; createdAt: number };
  log: { threadId: string; dryRun: boolean };
  contact: { email: string };
  lead: Record<string, string>;
  original: { subject: string; body: string };
};
export function RepliesInbox() {
  const [items, setItems] = useState<Reply[]>([]);
  const [selected, setSelected] = useState<Reply>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/results?mode=replies");
        const v = await r.json();
        if (active) {
          if (v.error) setError(v.error);
          else setItems(v);
        }
      } catch {
        if (active) setError("Replies unavailable");
      }
    }
    void load();
    const t = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <h1 className="text-3xl font-semibold">Replies</h1>
      <p className="text-sm text-zinc-400">
        Caught up on startup, checked every five minutes while the app runs.
      </p>
      <p role="status" className="error">
        {error}
      </p>
      <div className="grid gap-5 md:grid-cols-[1fr_1.5fr]">
        <div className="panel max-h-[650px] overflow-auto">
          {items.length ? (
            items.map((item) => (
              <button
                key={item.event.id}
                className="block w-full border-b border-white/10 py-4 text-left hover:bg-white/5"
                onClick={() => setSelected(item)}
              >
                <p className="text-sm">
                  {item.lead.name || item.contact.email}{" "}
                  <span className="ml-2 text-xs text-amber-300">
                    {item.event.type}
                  </span>
                </p>
                <p className="mt-2 truncate text-xs text-zinc-500">
                  {item.event.snippet}
                </p>
              </button>
            ))
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500">
              No replies yet. Conversations will appear here after sending.
            </p>
          )}
        </div>
        <article className="panel">
          {selected ? (
            <>
              <p className="text-xs text-zinc-500">
                {selected.contact.email} · {selected.lead.company} ·{" "}
                {new Date(selected.event.createdAt).toLocaleString()}
              </p>
              <h2 className="mt-4 text-lg">{selected.event.type}</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                {selected.event.snippet}
              </p>
              <a
                className="btn mt-5"
                target="_blank"
                rel="noreferrer"
                href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(selected.log.threadId)}`}
              >
                Open Gmail thread
              </a>
              <h3 className="mt-8 border-t border-white/10 pt-5 text-sm">
                Original: {selected.original.subject}
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-400">
                {selected.original.body}
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Choose a conversation.</p>
          )}
        </article>
      </div>
    </div>
  );
}
