"use client";
import { useState } from "react";
type Preview = {
  name: string;
  headers: string[];
  originalHeaders: string[];
  count: number;
  blankRows: number;
  preview: Record<string, string>[];
};
export function UploadPanel({
  campaignId,
  onDone,
}: {
  campaignId: string;
  onDone: () => void;
}) {
  const [upload, setUpload] = useState<{
    uploadId: string;
    sheets: Preview[];
  }>();
  const [selected, setSelected] = useState<number[]>([]);
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function parse(form: FormData) {
    setBusy(true);
    setMessage("Parsing on a background thread…");
    try {
      const r = await fetch("/api/upload", { method: "POST", body: form });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setUpload(v);
      setSelected(v.sheets.map((_: Preview, i: number) => i));
      setMessage("Choose the sheets to import.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    try {
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          uploadId: upload?.uploadId,
          selected,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(
        `Imported ${v.imported}. Invalid: ${v.invalid}; duplicates: ${v.duplicates}; already registered: ${v.alreadyContacted}; blank rows: ${v.blankRows}. ${v.details.join("; ")}`,
      );
      setUpload(undefined);
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-4">
      <h2 className="text-lg">1. Bring your list</h2>
      <label>
        Lead spreadsheet
        <input
          aria-label="Lead spreadsheet"
          className="field"
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const f = new FormData();
              f.set("file", file);
              void parse(f);
            }
          }}
        />
      </label>
      <label>
        Or paste CSV, tab-separated rows, or a JSON array
        <textarea
          className="field"
          rows={3}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
      </label>
      <button
        className="btn"
        disabled={busy || !paste.trim()}
        onClick={() => {
          const f = new FormData();
          f.set("paste", paste);
          void parse(f);
        }}
      >
        Preview pasted rows
      </button>
      {upload && (
        <div className="space-y-4">
          {upload.sheets.map((s, i) => (
            <div key={i} className="rounded border border-white/10 p-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, i]
                        : selected.filter((n) => n !== i),
                    )
                  }
                />
                {s.name} · {s.count} rows · {s.blankRows} blank
              </label>
              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      {s.originalHeaders.map((h, i) => (
                        <th key={i} className="p-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.preview.map((row, i) => (
                      <tr key={i}>
                        {s.headers.map((h) => (
                          <td key={h} className="p-2 text-zinc-400">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <button
            className="btn primary"
            disabled={busy || !selected.length}
            onClick={confirm}
          >
            Import selected sheets
          </button>
        </div>
      )}
      <p role="status" className="text-sm text-zinc-400">
        {message}
      </p>
    </section>
  );
}
