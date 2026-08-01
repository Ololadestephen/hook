import Link from "next/link";

export type TransactionTone = "neutral" | "pending" | "success" | "error";

type TransactionNoticeProps = {
  href?: string;
  message: string;
  title: string;
  tone?: TransactionTone;
};

const toneStyles: Record<TransactionTone, { icon: string; shell: string; symbol: string }> = {
  neutral: {
    icon: "info",
    shell: "border-outline-variant bg-background/50",
    symbol: "bg-white/[0.06] text-on-surface-variant"
  },
  pending: {
    icon: "progress_activity",
    shell: "border-primary/25 bg-primary/[0.07]",
    symbol: "bg-primary/10 text-primary"
  },
  success: {
    icon: "check_circle",
    shell: "border-primary/30 bg-primary/10",
    symbol: "bg-primary/15 text-primary"
  },
  error: {
    icon: "error",
    shell: "border-error/30 bg-error/[0.07]",
    symbol: "bg-error/10 text-error"
  }
};

export function TransactionNotice({ href, message, title, tone = "neutral" }: TransactionNoticeProps) {
  const style = toneStyles[tone];

  return (
    <aside aria-live="polite" className={`rounded-xl border p-3.5 ${style.shell}`} role="status">
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg ${style.symbol} ${tone === "pending" ? "animate-spin" : ""}`}>
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{message}</p>
          {href && (
            <Link className="mt-2 inline-flex text-xs font-bold text-primary hover:underline" href={href} target="_blank">
              View transaction ↗
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
