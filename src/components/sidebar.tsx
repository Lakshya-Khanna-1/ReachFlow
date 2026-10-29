"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Layers2,
  Inbox,
  ListChecks,
  Settings2,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
const links = [
  { href: "/", label: "Campaigns", icon: Layers2 },
  { href: "/replies", label: "Replies", icon: Inbox },
  { href: "/setup", label: "Setup", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="flex flex-col border-b border-white/10 bg-[#101012] p-5 md:min-h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <Link
        href="/"
        className="mb-10 flex items-center gap-3 font-semibold tracking-tight"
      >
        <span className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/5">
          <ArrowUpRight size={19} />
        </span>
        ReachFlow
        <span className="text-[10px] font-normal text-zinc-500">LOCAL</span>
      </Link>
      <p className="mb-3 text-[10px] font-medium tracking-[.16em] text-zinc-500">
        WORKSPACE
      </p>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap gap-1 md:flex-col"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white",
              path === href && "bg-white/[.07] text-zinc-100",
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden pt-16 md:block">
        <div className="rounded-lg border border-white/10 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Radio size={13} className="text-amber-400" />
            Local workspace
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Your workspace stays on this computer.
          </p>
        </div>
        <p className="mt-4 text-[11px] text-zinc-600">ReachFlow · v0.1</p>
      </div>
    </aside>
  );
}
