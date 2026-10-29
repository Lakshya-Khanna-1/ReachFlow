export default function Loading() {
  return (
    <div
      className="space-y-5 p-10"
      role="status"
      aria-label="Loading workspace"
    >
      <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
      <div className="h-48 animate-pulse rounded-lg border border-white/10 bg-white/[.02]" />
      <p className="text-sm text-zinc-500">Loading workspace…</p>
    </div>
  );
}
