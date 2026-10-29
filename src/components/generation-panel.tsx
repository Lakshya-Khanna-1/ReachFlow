"use client";
import { useEffect, useState } from "react";
type TestResult = {
  lead: { cleaned: Record<string, string> };
  result: {
    subject: string;
    body: string;
    flags: string[];
    used_fields: string[];
    confidence: number;
    notes: string;
  };
};
export function GenerationPanel({ campaignId }: { campaignId: string }) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [original, setOriginal] = useState("");
  const [job, setJob] = useState<{
    status: string;
    completed: number;
    total: number;
    errors: number;
    tokens: number;
    lastError: string | null;
  }>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const r = await fetch(`/api/generation?campaignId=${campaignId}`);
        const v = await r.json();
        if (active && v.job) setJob(v.job);
        if (active && v.results) {
          setResults(v.results);
          setOriginal(v.sample ?? "");
        }
      } catch {}
    }
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [campaignId]);
  async function action(action: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (v.results) setResults(v.results);
      if (v.sample) setOriginal(v.sample);
      if (v.job) setJob(v.job);
      setMessage(
        action === "test"
          ? "Test run saved. Review each message below."
          : "Job updated.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-5">
      <h2 className="text-lg">3. Test & generate</h2>
      <p className="text-sm text-zinc-400">
        Test three random recipients first. Generation is saved per row and
        resumes after restart.
      </p>
      <div className="flex flex-wrap gap-3">
        {[
          ["test", "Test run (3 recipients)"],
          ["generate", "Generate all drafts"],
          ["pause", "Pause generation"],
          ["resume", "Resume generation"],
          ["cancel", "Cancel generation"],
        ].map(([a, label]) => (
          <button
            key={a}
            className="btn"
            disabled={busy}
            onClick={() => action(a)}
          >
            {label}
          </button>
        ))}
      </div>
      {job && (
        <p className="text-sm">
          {job.status} · {job.completed}/{job.total} rows · {job.errors} errors
          · {job.tokens} tokens{" "}
          {job.lastError && <span className="error">· {job.lastError}</span>}
        </p>
      )}
      <p role="status" className="text-sm text-zinc-400">
        {message}
      </p>
      {results.map((r, i) => (
        <article
          key={i}
          className="grid gap-5 border-t border-white/10 pt-5 md:grid-cols-2"
        >
          <div>
            <h3 className="mb-2 text-xs text-zinc-500">ORIGINAL SAMPLE</h3>
            <p className="mb-5 whitespace-pre-wrap text-sm text-zinc-400">
              {original}
            </p>
            <h3 className="mb-2 text-xs text-zinc-500">SOURCE ROW</h3>
            <pre className="whitespace-pre-wrap text-xs text-zinc-400">
              {JSON.stringify(r.lead.cleaned, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="font-medium">{r.result.subject}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
              {r.result.body.split(/(\s+)/).map((word, i) => (
                <span
                  key={i}
                  className={
                    original.toLowerCase().includes(word.toLowerCase())
                      ? undefined
                      : "text-emerald-300"
                  }
                >
                  {word}
                </span>
              ))}
            </p>
            <p className="mt-3 text-xs text-amber-300">
              {r.result.flags.join(", ") || "Checks passed"}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Used: {r.result.used_fields.join(", ")} · Confidence:{" "}
              {r.result.confidence} · {r.result.notes}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}
