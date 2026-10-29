"use client";
import { useEffect, useState } from "react";
import type { Analysis } from "@/lib/contracts";
type Campaign = {
  name: string;
  brief: string;
  sample: string;
  tone: string;
  minWords: number;
  maxWords: number;
  bannedPhrases: string[];
};
export function TemplatePanel({
  campaignId,
  onChange,
}: {
  campaignId: string;
  onChange: () => void;
}) {
  const [c, setC] = useState<Campaign>();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [slots, setSlots] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch(`/api/template?campaignId=${campaignId}`)
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setC(v.campaign);
        if (v.version) {
          const a = JSON.parse(v.version.analysis);
          setAnalysis(a);
          setSlots(JSON.stringify(a.variable_slots, null, 2));
        }
      })
      .catch((e) => setMessage(e.message));
  }, [campaignId]);
  async function submit(action: "analyze" | "save") {
    setBusy(true);
    try {
      const edited =
        action === "save"
          ? { ...analysis, variable_slots: JSON.parse(slots) }
          : undefined;
      const r = await fetch("/api/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          campaign: c,
          action,
          analysis: edited,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setAnalysis(v.analysis);
      setSlots(JSON.stringify(v.analysis.variable_slots, null, 2));
      setMessage("Template version saved. Run a new test before approval.");
      onChange();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Template failed");
    } finally {
      setBusy(false);
    }
  }
  if (!c)
    return (
      <section className="panel" role="status">
        {message || "Loading template…"}
      </section>
    );
  return (
    <section className="panel space-y-4">
      <h2 className="text-lg">2. Brief & master template</h2>
      <label>
        Campaign brief: offer, audience and CTA
        <textarea
          className="field"
          rows={3}
          value={c.brief}
          onChange={(e) => setC({ ...c, brief: e.target.value })}
        />
      </label>
      <label>
        Sample email
        <textarea
          className="field"
          rows={7}
          value={c.sample}
          onChange={(e) => setC({ ...c, sample: e.target.value })}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          Tone
          <select
            className="field"
            value={c.tone}
            onChange={(e) => setC({ ...c, tone: e.target.value })}
          >
            {["professional", "friendly", "direct", "warm"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Minimum words
          <input
            className="field"
            type="number"
            value={c.minWords}
            onChange={(e) => setC({ ...c, minWords: Number(e.target.value) })}
          />
        </label>
        <label>
          Maximum words
          <input
            className="field"
            type="number"
            value={c.maxWords}
            onChange={(e) => setC({ ...c, maxWords: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Banned phrases (one per line)
        <textarea
          className="field"
          value={c.bannedPhrases.join("\n")}
          onChange={(e) =>
            setC({
              ...c,
              bannedPhrases: e.target.value.split("\n").filter(Boolean),
            })
          }
        />
      </label>
      <button className="btn" disabled={busy} onClick={() => submit("analyze")}>
        {busy ? "Working…" : "Analyze template"}
      </button>
      {analysis && (
        <div className="space-y-4 border-t border-white/10 pt-5">
          <label>
            Core message
            <textarea
              className="field"
              value={analysis.core_message}
              onChange={(e) =>
                setAnalysis({ ...analysis, core_message: e.target.value })
              }
            />
          </label>
          <label>
            CTA
            <input
              className="field"
              value={analysis.cta}
              onChange={(e) =>
                setAnalysis({ ...analysis, cta: e.target.value })
              }
            />
          </label>
          <label>
            Fixed phrases (verbatim, one per line)
            <textarea
              className="field"
              value={analysis.fixed_phrases.join("\n")}
              onChange={(e) =>
                setAnalysis({
                  ...analysis,
                  fixed_phrases: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Variable slots (JSON)
            <textarea
              className="field font-mono text-xs"
              rows={7}
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => submit("save")}
          >
            Save edited analysis
          </button>
        </div>
      )}
      <p className="text-sm text-zinc-400" role="status">
        {message}
      </p>
    </section>
  );
}
