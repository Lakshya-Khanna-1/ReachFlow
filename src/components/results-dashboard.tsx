"use client";
import { useEffect, useState } from "react";
export function ResultsDashboard() {
  const [data, setData] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [list, setList] = useState<{ email: string; reason: string }[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [stats, suppressed] = await Promise.all([
          fetch("/api/results").then((r) => r.json()),
          fetch("/api/results?mode=suppression").then((r) => r.json()),
        ]);
        if (active) {
          if (stats.error) setMessage(stats.error);
          else setData(stats);
          if (Array.isArray(suppressed)) setList(suppressed);
        }
      } catch {
        if (active) setMessage("Results unavailable");
      }
    }
    void load();
    const t = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  async function suppress(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suppress", email }),
    });
    const v = await r.json();
    setMessage(r.ok ? "Address suppressed across all campaigns." : v.error);
    if (r.ok) {
      setList([...list, { email, reason: "Manual opt-out" }]);
      setEmail("");
    }
  }
  return (
    <section className="panel space-y-5">
      <h2 className="text-lg">Outreach funnel</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="rounded border border-white/10 p-3">
            <p className="text-xs capitalize text-zinc-500">{key}</p>
            <p className="mt-2 text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <a className="btn" href="/api/results?mode=export&format=csv">
          Export CSV
        </a>
        <a className="btn" href="/api/results?mode=export&format=xlsx">
          Export XLSX
        </a>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          Suppression list ({list.length})
        </summary>
        <form onSubmit={suppress} className="mt-4 flex gap-3">
          <label className="flex-1">
            Never contact this address
            <input
              required
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn self-end">Suppress</button>
        </form>
        <div className="mt-3 max-h-48 overflow-auto text-xs">
          {list.map((row) => (
            <p key={row.email} className="border-t border-white/10 py-2">
              {row.email} · {row.reason}
            </p>
          ))}
        </div>
      </details>
      <p role="status" className="text-xs text-zinc-400">
        {message}
      </p>
    </section>
  );
}
