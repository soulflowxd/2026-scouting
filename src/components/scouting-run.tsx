import { Check, ChevronRight, Flag } from "lucide-react"
import { cn } from "@/lib/utils"

export type ScoutingRunStep = { title: string; done: boolean; detail: string }

export function ScoutingRun({ title, steps }: { title: string; steps: ScoutingRunStep[] }) {
  const completed = steps.filter(step => step.done).length
  const next = steps.find(step => !step.done)

  return <section aria-label={`${title} scouting guide`} className="rounded-xl border bg-card p-3 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold"><Flag className="size-4 text-primary" aria-hidden="true" />{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{next ? `Next: ${next.detail}` : "All guide steps covered. Review your report before submitting."}</p>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary" aria-label={`${completed} of ${steps.length} guide steps covered`}>{completed}/{steps.length}</span>
    </div>
    <div role="progressbar" aria-label="Scouting guide progress" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={steps.length} className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${completed / steps.length * 100}%` }} />
    </div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:mt-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
      {steps.map((step, index) => <button key={step.title} type="button" onClick={() => document.getElementById(`scouting-step-${step.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-12 sm:shrink", step.done ? "border-primary/35 bg-primary/10 text-foreground" : "bg-background hover:bg-muted/60")}>
        {step.done ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums">{index + 1}</span>}
        <span className="min-w-0 flex-1">{step.title}</span><ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>)}
    </div>
    <p className="mt-3 hidden text-xs text-muted-foreground sm:block">Zero activity can be a valid observation. This guide is optional; only submitting the report sends scouting data.</p>
  </section>
}
