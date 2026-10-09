import { RefreshCw } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

export function RouteError() {
  return <main className="grid min-h-svh place-items-center bg-background p-4 text-foreground">
    <section role="alert" aria-labelledby="route-error-title" className="grid w-full max-w-md gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <h1 id="route-error-title" className="text-2xl font-semibold tracking-tight">This page couldn’t load</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">Your submitted reports are safe. Check your connection, then reload the page to try again.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" />Reload page</Button>
        <a href="/teams" className={buttonVariants({ variant: "outline" })}>Back to teams</a>
      </div>
    </section>
  </main>
}
