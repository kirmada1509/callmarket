import { ArrowRight, Gauge, Scale, ShieldCheck } from "lucide-react";

const principles = [
  {
    icon: Scale,
    title: "Agents bid, not merely vote",
    body: "Each specialist commits to an action, predicted postconditions, calibrated confidence, and cost before selection.",
  },
  {
    icon: ShieldCheck,
    title: "Outcomes settle reputation",
    body: "Deterministic tool-state verification rewards correctness and exposes confident failures without an LLM judge.",
  },
  {
    icon: Gauge,
    title: "Context changes the winner",
    body: "Reputation transfers across stale events, ambiguous writes, and other capabilities—then proves itself on frozen holdouts.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#090b0f] px-6 py-16 text-[#f3f0e8] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-20 flex items-center justify-between border-b border-white/10 pb-5">
          <span className="font-mono text-sm tracking-[0.22em] text-emerald-300">CALLMARKET</span>
          <span className="font-mono text-xs text-white/45">OUTCOME-SETTLED AUTONOMY</span>
        </div>

        <section className="max-w-4xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.24em] text-amber-300">
            Agents should earn the right to act
          </p>
          <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.045em] sm:text-7xl">
            A prediction market for autonomous tool calls.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-white/60">
            Competing agent strategies stake their reputation on verifiable outcomes. The market learns who to trust for each kind of risk—while making every decision inspectable.
          </p>
          <a
            href="/arena"
            className="mt-9 inline-flex items-center gap-3 rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-[#09110e] transition hover:bg-emerald-200"
          >
            Enter the market <ArrowRight size={16} />
          </a>
        </section>

        <section className="mt-24 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
          {principles.map(({ icon: Icon, title, body }) => (
            <article key={title} className="bg-[#0d1015] p-7">
              <Icon className="mb-8 text-emerald-300" size={22} />
              <h2 className="text-lg font-medium">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/50">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
