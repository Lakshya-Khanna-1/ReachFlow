"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
type Row = {
  draft: {
    id: string;
    subject: string;
    body: string;
    flags: string[];
    status: string;
    edited: boolean;
  };
  lead: Record<string, string>;
  segment: string;
};
type Data = {
  version: { id: string; approved: boolean; testedAt: number | null } | null;
  rows: Row[];
  spot: Row[];
  counts: Record<string, number>;
  sample: string;
  mode: string;
  cap: number;
};
export function ReviewPanel({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Data>();
  const [filter, setFilter] = useState("attention");
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<Row>();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmQueue, setConfirmQueue] = useState(false);
  const parent = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    fetch(`/api/review?campaignId=${campaignId}&status=${filter}`)
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setData(v);
      })
      .catch((e) => setMessage(e.message));
  }, [campaignId, filter]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  async function action(
    action: string,
    ids = selected,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, action, ids, ...extra }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(action === "queue" ? `Queued ${v.queued} drafts.` : "Saved.");
      setSelected([]);
      setDrawer(undefined);
      setConfirmQueue(false);
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }
  const columns: ColumnDef<Row>[] = [
    {
      id: "select",
      header: "Select",
      cell: ({ row }) => (
        <input
          aria-label={`Select ${row.original.lead.email}`}
          type="checkbox"
          checked={selected.includes(row.original.draft.id)}
          onChange={(e) =>
            setSelected(
              e.target.checked
                ? [...selected, row.original.draft.id]
                : selected.filter((id) => id !== row.original.draft.id),
            )
          }
        />
      ),
    },
    {
      id: "recipient",
      header: "Recipient",
      cell: ({ row }) => (
        <div className="truncate">
          <p>{row.original.lead.name || row.original.lead.email}</p>
          <p className="text-xs text-zinc-500">{row.original.segment}</p>
        </div>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <button
          className="truncate text-left hover:underline"
          onClick={() => {
            setDrawer(row.original);
            setSubject(row.original.draft.subject);
            setBody(row.original.draft.body);
          }}
        >
          {row.original.draft.subject}
        </button>
      ),
    },
    {
      id: "status",
      header: "Status / flags",
      cell: ({ row }) => (
        <span className="text-xs text-amber-300">
          {row.original.draft.status} {row.original.draft.flags.join(", ")}
        </span>
      ),
    },
  ];
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack handles its own table state; this view is not compiler-memoized.
  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const virtual = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => 64,
    overscan: 5,
  });
  return (
    <section className="panel space-y-5">
      <h2 className="text-lg">4. Approve & review</h2>
      <p className="text-sm text-zinc-400">
        Approve one tested template, then review exceptions and a random
        spot-check. Flagged messages require your explicit approval.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn"
          disabled={busy || !data?.version?.testedAt || data.version.approved}
          onClick={() => action("approveTemplate")}
        >
          {data?.version?.approved
            ? "Template approved"
            : "Approve tested template"}
        </button>
        <select
          aria-label="Draft status filter"
          className="field max-w-48 !mt-0"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected([]);
          }}
        >
          {[
            "attention",
            "all",
            "pending",
            "approved",
            "rejected",
            "failed",
            "sent",
            "uncertain",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          className="btn"
          disabled={busy || !selected.length}
          onClick={() => action("approve")}
        >
          Approve selected
        </button>
        <button
          className="btn"
          disabled={busy || !selected.length}
          onClick={() => action("reject")}
        >
          Reject selected
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        {Object.entries(data?.counts ?? {})
          .map(([s, n]) => `${s}: ${n}`)
          .join(" · ")}
      </p>
      <div
        ref={parent}
        className="h-96 overflow-auto rounded border border-white/10"
      >
        <div className="sticky top-0 z-10 grid grid-cols-[60px_1fr_1fr_1fr] bg-zinc-900 p-3 text-xs text-zinc-400">
          {table
            .getHeaderGroups()
            .map((g) =>
              g.headers.map((h) => (
                <div key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </div>
              )),
            )}
        </div>
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((item) => {
            const row = table.getRowModel().rows[item.index];
            return (
              <div
                key={row.id}
                className="absolute left-0 top-0 grid w-full grid-cols-[60px_1fr_1fr_1fr] gap-2 border-t border-white/5 p-3 text-sm"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="min-w-0 overflow-hidden">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {!data?.rows.length && (
          <p className="p-8 text-center text-sm text-zinc-500">
            No drafts in this view.
          </p>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Showing up to 5,000 drafts in the selected view.
      </p>
      <details>
        <summary className="cursor-pointer text-sm">
          Random spot-check ({data?.spot.length ?? 0})
        </summary>
        <div className="mt-4 space-y-4">
          {data?.spot.map((r) => (
            <article
              key={r.draft.id}
              className="rounded border border-white/10 p-4"
            >
              <p className="text-xs text-zinc-500">{r.lead.email}</p>
              <h3 className="mt-2">{r.draft.subject}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">
                {r.draft.body}
              </p>
            </article>
          ))}
        </div>
      </details>
      <button
        className="btn primary"
        disabled={busy || !data?.counts.approved}
        onClick={() => setConfirmQueue(true)}
      >
        Approve for sending
      </button>
      <p className="text-sm text-zinc-400" role="status">
        {message}
      </p>
      {confirmQueue && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="queue-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5"
        >
          <div className="panel max-w-md space-y-5">
            <h3 id="queue-title" className="text-lg">
              Confirm {data?.mode}
            </h3>
            <p className="text-sm">
              {data?.counts.approved} approved drafts · about{" "}
              {Math.ceil((data?.counts.approved ?? 0) / (data?.cap ?? 20))} days
              at {data?.cap}/day, longer during warm-up and weekends.
            </p>
            <p className="text-sm text-zinc-400">
              Plain text, first email only. Sending occurs during your
              configured hours while this app is running. Gmail may throttle or
              suspend cold outreach.
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => action("queue")}
            >
              Confirm {data?.mode}
            </button>
            <button className="btn ml-3" onClick={() => setConfirmQueue(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {drawer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="draft-title"
          className="fixed inset-0 z-50 flex justify-end bg-black/80"
        >
          <div className="h-full w-full max-w-2xl space-y-4 overflow-auto border-l border-white/10 bg-zinc-950 p-6">
            <h3 id="draft-title" className="text-lg">
              {drawer.lead.email}
            </h3>
            <p className="text-xs text-amber-300">
              {drawer.draft.flags.join(", ")}
            </p>
            <details>
              <summary>Original sample</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-400">
                {data?.sample}
              </p>
            </details>
            <label>
              Subject
              <input
                className="field"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Body
              <textarea
                className="field"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action("edit", [drawer.draft.id], { subject, body })
                }
              >
                Save edits
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => action("approve", [drawer.draft.id])}
              >
                Approve draft
              </button>
            </div>
            <label>
              Regeneration instruction
              <input
                className="field"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </label>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                if (
                  drawer.draft.edited &&
                  !window.confirm(
                    "Overwrite your manual edits with a new generation?",
                  )
                )
                  return;
                void action("regenerate", [drawer.draft.id], {
                  instruction,
                  overwriteEdited: drawer.draft.edited,
                });
              }}
            >
              Regenerate this draft
            </button>
            <button className="btn ml-3" onClick={() => setDrawer(undefined)}>
              Close
            </button>
            <p role="status" className="text-sm error">
              {message}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
