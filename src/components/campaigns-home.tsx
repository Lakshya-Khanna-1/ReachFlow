"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkerWidget } from "./worker-widget";
import { ResultsDashboard } from "./results-dashboard";
import { useEffect, useState } from "react";
type Campaign = { id: string; name: string; status: string; createdAt: number };
export function CampaignsHome() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setItems(v);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      router.push(`/campaigns/${v.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create campaign");
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <header>
        <p className="mb-3 text-xs tracking-widest text-zinc-500">
          THOUGHTFUL OUTREACH
        </p>
        <h1 className="text-3xl font-semibold">Campaigns</h1>
        <p className="mt-3 text-sm text-zinc-400">
          A small list. A personal message. A little progress each day.
        </p>
      </header>
      <WorkerWidget />
      <ResultsDashboard />
      <form className="panel flex flex-wrap items-end gap-4" onSubmit={create}>
        <label className="min-w-48 flex-1">
          New campaign name
          <input
            className="field"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </form>
      <p className="error" role="status">
        {error}
      </p>
      <div className="space-y-3">
        {items.length ? (
          items.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="panel flex justify-between hover:border-white/30"
            >
              <span>{c.name}</span>
              <span className="text-sm text-zinc-400">{c.status} →</span>
            </Link>
          ))
        ) : (
          <section className="panel py-16 text-center">
            <h2 className="text-lg">Your first campaign starts here</h2>
            <p className="mt-3 text-sm text-zinc-500">
              Create a campaign, then bring your spreadsheet.
            </p>
            <Link href="/setup" className="btn mt-6">
              View setup checklist
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
