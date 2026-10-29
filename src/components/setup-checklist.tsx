"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function SetupChecklist() {
  const [items, setItems] = useState<{ label: string; ok: boolean }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setItems(v.items);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="space-y-5">
      <div className="panel">
        <h2 className="mb-4 text-lg">Ready to reach out?</h2>
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 border-t border-white/10 py-4 text-sm"
          >
            <span className={item.ok ? "success" : "text-amber-300"}>
              {item.ok ? "✓" : "○"}
            </span>
            {item.label}
            <span className="ml-auto text-xs text-zinc-500">
              {item.ok ? "Ready" : "Needs setup"}
            </span>
          </div>
        ))}
        <p role="status" className="error">
          {error}
        </p>
      </div>
      <Link className="btn" href="/settings">
        Open settings
      </Link>
    </div>
  );
}
