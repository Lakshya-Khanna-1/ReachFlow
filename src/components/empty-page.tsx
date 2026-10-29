import Link from "next/link";
export function EmptyPage({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12 md:px-10">
      <p className="text-[10px] tracking-[.18em] text-zinc-500">WORKSPACE</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-zinc-400">{description}</p>
      <section className="mt-10 rounded-lg border border-white/10 p-8">
        <h2 className="text-sm font-medium">Coming in the next build stages</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500">
          {detail}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-zinc-300 underline underline-offset-4"
        >
          Back to campaigns
        </Link>
      </section>
    </div>
  );
}
