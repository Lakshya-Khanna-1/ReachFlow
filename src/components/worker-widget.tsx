"use client";
import { useEffect, useState } from "react";
type Status = {
  status: string;
  paused: boolean;
  nextSendAt: number | null;
  sentToday: number;
  cap: number;
  dryRun: boolean;
  heartbeat: number | null;
};
export function WorkerWidget() {
  const [data, setData] = useState<Status>();
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const r = await fetch("/api/worker");
        const v = await r.json();
        if (active) {
          if (v.error) setMessage(v.error);
          else setData(v);
        }
      } catch {
        if (active) setMessage("Worker status unavailable");
      }
    }
    void refresh();
    const poll = setInterval(refresh, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);
  async function action(action: string) {
    try {
      const r = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const v = await r.json();
      setMessage(r.ok ? "Worker updated" : v.error);
    } catch {
      setMessage("Worker update failed");
    }
  }
  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">
            {data?.dryRun ? "DRY RUN" : "GMAIL DISPATCHER"}
          </p>
          <h2 className="mt-2 text-lg">
            {data?.sentToday ?? 0} / {data?.cap ?? "—"} today
          </h2>
        </div>
        <div className="flex gap-3">
          <button
            className="btn"
            onClick={() => action(data?.paused ? "resume" : "pause")}
          >
            {data?.paused ? "Resume sending" : "Pause sending"}
          </button>
          <button
            className="btn"
            disabled={!data?.paused}
            onClick={() => action("reconcile")}
          >
            Reconcile uncertain sends
          </button>
        </div>
      </div>
      <p className="text-sm text-zinc-300">
        {data?.status ?? "Connecting to worker…"}
      </p>
      {data?.heartbeat && now - data.heartbeat > 15000 && (
        <p className="error text-xs">
          Worker heartbeat is stale. Restart ReachFlow to resume.
        </p>
      )}
      {data?.nextSendAt && data.nextSendAt > now && (
        <p className="text-xs text-zinc-400">
          Next check: {new Date(data.nextSendAt).toLocaleString()} ·{" "}
          {Math.max(0, Math.ceil((data.nextSendAt - now) / 1000))}s
        </p>
      )}
      <p role="status" className="text-xs text-zinc-400">
        {message}
      </p>
    </section>
  );
}
