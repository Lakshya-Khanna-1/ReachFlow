"use client";
import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/settings";
export function SettingsForm() {
  const [c, setC] = useState<AppSettings>();
  const [keys, setKeys] = useState({ llmKey: "", googleSecret: "" });
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setC(v.config);
        setConfigured(v.configured);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: c, secrets: keys }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setConfigured(v.configured);
      setKeys({ llmKey: "", googleSecret: "" });
      setMessage("Settings saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const r = await fetch("/api/settings/test", { method: "POST" });
      const v = await r.json();
      setMessage(r.ok ? "LLM is reachable." : v.error);
    } catch {
      setMessage("Connection failed");
    } finally {
      setBusy(false);
    }
  }
  if (!c)
    return (
      <div className="p-10" role="status">
        {message || "Loading settings…"}
      </div>
    );
  const text = (key: keyof AppSettings, label: string, type = "text") => (
    <label key={key}>
      {label}
      <input
        className="field"
        type={type}
        value={String(c[key])}
        onChange={(e) =>
          setC({
            ...c,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
      />
    </label>
  );
  const toggle = (
    key: "warmup" | "weekends" | "dryRun" | "noticeAccepted",
    label: string,
  ) => (
    <label className="flex items-center gap-3" key={key}>
      <input
        type="checkbox"
        checked={c[key]}
        onChange={(e) => setC({ ...c, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="text-sm text-zinc-400">
        Save changes before testing connections. Keys stay on this computer.
      </p>
      <section className="panel space-y-4">
        <h2 className="text-lg">Language model</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Provider
            <select
              className="field"
              value={c.provider}
              onChange={(e) =>
                setC({
                  ...c,
                  provider: e.target.value as AppSettings["provider"],
                })
              }
            >
              <option value="local">Local / OpenAI compatible</option>
              <option value="openrouter">OpenRouter</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          {text("model", "Model")}
          {text("baseUrl", "Local base URL")}
          <label>
            API key {configured.llmKey ? "(saved)" : ""}
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep saved key"
              value={keys.llmKey}
              onChange={(e) => setKeys({ ...keys, llmKey: e.target.value })}
            />
          </label>
        </div>
        <button className="btn" disabled={busy} onClick={test}>
          Test saved connection
        </button>
      </section>
      <section className="panel space-y-4">
        <h2 className="text-lg">Sending</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("senderName", "Real sender name")}
          {text("dailyCap", "Daily cap (1–50)", "number")}
          {text("jitterMin", "Minimum delay (60–180 seconds)", "number")}
          {text("jitterMax", "Maximum delay (60–180 seconds)", "number")}
          {text("start", "Business hours start", "time")}
          {text("end", "Business hours end", "time")}
          {text("timezone", "Timezone (IANA name)")}
        </div>
        {toggle("warmup", "Warm up from 5/day, adding 3 per calendar day")}
        {toggle("weekends", "Allow weekends")}
        {toggle("dryRun", "Dry run: simulate delivery without sending email")}
        <label>
          Opt-out footer
          <textarea
            className="field"
            value={c.footer}
            onChange={(e) => setC({ ...c, footer: e.target.value })}
          />
        </label>
      </section>
      <section className="panel space-y-4">
        <h2 className="text-lg">Reply alerts</h2>
        <label>
          Forward-to addresses (one per line)
          <textarea
            className="field"
            value={c.forwardTo.join("\n")}
            onChange={(e) =>
              setC({
                ...c,
                forwardTo: e.target.value
                  .split(/[\n,]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </section>
      <section className="panel space-y-4">
        <h2 className="text-lg">Google</h2>
        {text("googleClientId", "OAuth Client ID")}
        <label>
          Client secret {configured.googleSecret ? "(saved)" : ""}
          <input
            type="password"
            className="field"
            autoComplete="new-password"
            value={keys.googleSecret}
            onChange={(e) => setKeys({ ...keys, googleSecret: e.target.value })}
          />
        </label>
        <p className="text-xs text-zinc-400">
          Gmail connection becomes available in the Google setup stage.
        </p>
      </section>
      <section className="panel space-y-4 text-sm">
        <p>
          Cold outreach from personal Gmail can lead to throttling or
          suspension. Use a dedicated account and keep volume low.
        </p>
        {toggle(
          "noticeAccepted",
          "I understand the personal Gmail sending risks.",
        )}
      </section>
      <div className="sticky bottom-0 flex items-center gap-5 border-t border-white/10 bg-zinc-950 py-4">
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? "Working…" : "Save settings"}
        </button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </div>
  );
}
