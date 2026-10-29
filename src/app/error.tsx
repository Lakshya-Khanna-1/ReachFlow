"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-10">
      <h1 className="text-2xl font-semibold">This view could not load</h1>
      <p className="text-sm text-zinc-400">
        Retry the view. If the problem continues, restart ReachFlow and check
        the worker message.
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
