import Link from "next/link";
import { AppNav } from "../components/AppNav";

const steps = [
  {
    title: "Choose a pair",
    body: "Select two Sepolia tokens."
  },
  {
    title: "Choose protection",
    body: "Pick the preset that fits the market."
  },
  {
    title: "Create and fund",
    body: "Launch the pool and add liquidity."
  }
] as const;

const protections = [
  "Large and one-sided swaps pay more.",
  "Toxic flow raises fees temporarily."
] as const;

export default function ProtectPage() {
  return (
    <main className="app-shell min-h-screen bg-background pb-24 text-on-background lg:pb-0 lg:pl-[250px]">
      <AppNav active="protect" />
      <section className="px-4 py-5 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-5 border-b border-outline-variant/60 pb-5 md:mb-6 md:pb-6">
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.035em] md:text-[34px]">Protect liquidity</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
              HookFlow adjusts fees for large, one-sided, and toxic flow.
            </p>
          </header>

        <section className="mb-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <article className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 md:p-5">
            <h2 className="font-display text-lg font-bold md:text-xl">How it works</h2>
            <div className="mt-5 grid gap-3">
              {steps.map((step, index) => (
                <div className="grid gap-3 rounded border border-outline-variant/60 bg-background/60 p-4 sm:grid-cols-[44px_1fr]" key={step.title}>
                  <div className="grid h-10 w-10 place-items-center rounded bg-primary/10 font-mono text-sm font-bold text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-on-background">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-on-surface-variant">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-5">
            <article className="rounded-lg border border-primary/20 bg-primary/10 p-4 md:p-5">
              <h2 className="font-display text-lg font-bold md:text-xl">What it protects</h2>
              <div className="mt-4 space-y-3">
                {protections.map((item) => (
                  <div className="flex gap-3 text-sm leading-6" key={item}>
                    <span className="material-symbols-outlined mt-0.5 text-base text-primary">check_circle</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 border-t border-primary/20 pt-4 text-sm leading-6 text-on-surface-variant">
                Only pools created with the HookFlow hook are protected.
              </p>
              <Link className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-on-primary" href="/create">
                Create protected pool <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            </article>
          </aside>
        </section>
        </div>
      </section>
    </main>
  );
}
