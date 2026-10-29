"use client";
import { useEffect, useState, useCallback } from "react";
import { UploadPanel } from "./upload-panel";
import { TemplatePanel } from "./template-panel";
import { GenerationPanel } from "./generation-panel";
import { ReviewPanel } from "./review-panel";
import { WorkerWidget } from "./worker-widget";
export function CampaignWorkspace({ id }: { id: string }) {
  const [data, setData] = useState<{
    campaign: { name: string };
    leadCount: number;
    mappings: { sheet: string; mapping: Record<string, string> }[];
  }>();
  const [error, setError] = useState("");
  const load = useCallback(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((v) => {
        if (v.error) throw new Error(v.error);
        setData(v);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <h1 className="text-3xl font-semibold">
        {data?.campaign.name ?? "Campaign"}
      </h1>
      <p className="text-sm text-zinc-400">
        {data?.leadCount ?? 0} cleaned leads
      </p>
      <p className="error" role="status">
        {error}
      </p>
      <UploadPanel campaignId={id} onDone={load} />
      {!!data?.mappings.length && (
        <details className="panel">
          <summary className="cursor-pointer text-sm">
            Saved sheet mappings
          </summary>
          {data.mappings.map((m, i) => (
            <div key={i} className="mt-4 text-xs">
              <h3 className="mb-2 text-sm">{m.sheet}</h3>
              {Object.entries(m.mapping).map(([key, value]) => (
                <p key={key} className="py-1 text-zinc-400">
                  {key} → {value}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      <WorkerWidget />
      <TemplatePanel campaignId={id} onChange={load} />
      <GenerationPanel campaignId={id} />
      <ReviewPanel campaignId={id} />
    </div>
  );
}
