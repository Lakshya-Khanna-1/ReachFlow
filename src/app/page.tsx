import Link from "next/link";
import {
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  Send,
} from "lucide-react";
export default function Campaigns() {
  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-white/10 px-6 text-xs md:px-10">
        <span className="text-zinc-400">
          Workspace <span className="mx-3 text-zinc-700">/</span>
          <span className="text-zinc-200">Campaigns</span>
        </span>
        <span className="flex items-center gap-2 text-zinc-500">
          <span className="size-1.5 rounded-full bg-zinc-500" />
          Not configured
        </span>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-[10px] tracking-[.18em] text-zinc-500">
              THOUGHTFUL OUTREACH
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-3 text-sm text-zinc-400">
              A small list. A personal message. A little progress each day.
            </p>
          </div>
          <Link
            href="/setup"
            className="flex h-9 items-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white"
          >
            Set up workspace <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-9 grid grid-cols-3 divide-x divide-white/10 rounded-lg border border-white/10">
          {["CAMPAIGNS", "EMAILS SENT", "REPLIES"].map((label) => (
            <div key={label} className="p-4 md:p-6">
              <p className="text-[9px] tracking-widest text-zinc-500 md:text-[10px]">
                {label}
              </p>
              <p className="mt-3 text-3xl font-medium tracking-tight">0</p>
            </div>
          ))}
        </div>
        <section className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-6 py-14 text-center">
          <div className="mb-5 grid size-12 place-items-center rounded-xl border border-white/10 bg-white/[.025]">
            <FileSpreadsheet size={22} className="text-zinc-400" />
          </div>
          <h2 className="text-lg font-medium tracking-tight">
            Your first campaign starts here
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
            Connect your tools first. Spreadsheet uploads and personalized
            drafts arrive in the next build stages.
          </p>
          <Link
            href="/setup"
            className="mt-6 flex items-center gap-2 text-sm text-zinc-200 hover:text-white"
          >
            View setup <ArrowRight size={14} />
          </Link>
        </section>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: FileSpreadsheet,
              title: "Bring your list",
              text: "Messy spreadsheets, organized into clean leads.",
            },
            {
              icon: Sparkles,
              title: "Make it personal",
              text: "Ground each message in the details you provide.",
            },
            {
              icon: ShieldCheck,
              title: "Stay in control",
              text: "Review your template before anything sends.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon size={16} className="mt-1 shrink-0 text-zinc-500" />
              <div>
                <h3 className="text-xs font-medium text-zinc-300">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-12 flex items-center gap-2 border-t border-white/10 pt-5 text-[11px] text-zinc-600">
          <Send size={12} />
          Local-first. No tracking pixels. You decide when to send.
        </p>
      </div>
    </>
  );
}
