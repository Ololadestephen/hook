"use client";

import Link from "next/link";
import Image from "next/image";
import icon from "../icon.png";

const navItems = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Overview", icon: "space_dashboard", key: "dashboard" },
  { href: "/protect", label: "LP Protection", shortLabel: "Protect", icon: "shield", key: "protect" },
  { href: "/create", label: "Create Pool", shortLabel: "Create", icon: "add_chart", key: "create" },
  { href: "/pools", label: "My Pools", shortLabel: "Pools", icon: "waterfall_chart", key: "pools" },
  { href: "/phantom", label: "Phantom Router", shortLabel: "Phantom", icon: "encrypted", key: "phantom" }
] as const;

type AppNavProps = {
  active: (typeof navItems)[number]["key"];
};

export function AppNav({ active }: AppNavProps) {
  return (
    <aside className="sticky top-0 z-50 border-b border-white/[0.07] bg-surface-container-low/95 lg:fixed lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[250px] lg:border-b-0 lg:border-r lg:border-white/5 lg:backdrop-blur-xl">
      <div className="flex h-full flex-col px-3 py-2.5 lg:gap-7 lg:px-5 lg:py-6">
        <div className="flex h-11 items-center justify-between lg:h-auto lg:border-b lg:border-white/5 lg:pb-5">
          <Link className="flex items-center gap-3" href="/">
            <Image alt="HookFlow Logo" className="h-8 w-8 rounded-lg shadow-sm lg:h-9 lg:w-9 lg:rounded-xl" src={icon} />
            <p className="font-display text-lg font-bold tracking-[-0.03em] text-white lg:text-xl">HookFlow</p>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary lg:hidden"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Sepolia</span>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-[60] grid grid-cols-5 border-t border-white/10 bg-surface-container-low/95 px-1.5 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(0,0,0,.28)] backdrop-blur-xl lg:static lg:flex lg:flex-col lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {navItems.map((item) => {
            const isActive = item.key === active;

            return (
              <Link
                className={`group relative inline-flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border px-1 py-1.5 text-[9px] font-bold uppercase tracking-[0.06em] transition duration-200 lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3.5 lg:text-xs lg:tracking-[0.1em] ${
                  isActive
                    ? "border-primary/20 bg-primary/10 text-primary shadow-glow"
                    : "border-transparent bg-transparent text-on-surface-variant hover:border-white/5 hover:bg-white/5 hover:text-on-background"
                }`}
                href={item.href}
                key={item.key}
              >
                {isActive && <div className="absolute left-0 top-1/2 hidden h-7 w-[3px] -translate-y-1/2 rounded-r bg-primary shadow-[0_0_12px_rgba(78,222,163,0.9)] lg:block" />}
                <span className="material-symbols-outlined relative z-10 text-[20px] lg:text-xl">{item.icon}</span>
                <span className="relative z-10 truncate lg:hidden">{item.shortLabel}</span>
                <span className="relative z-10 hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden rounded-xl border border-primary/15 bg-primary/[0.06] p-4 lg:block">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-primary"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />Ethereum Sepolia</div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">HookFlow and Nox contracts are live.</p>
        </div>
      </div>
    </aside>
  );
}
