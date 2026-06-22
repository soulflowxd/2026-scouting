import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export function HomeRoute() {
  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">2026 Scouting</p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-normal text-balance">
          Framework baseline
        </h1>
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button type="button">Primary action</Button>
        <Button type="button" variant="outline">
          Secondary action
        </Button>
      </div>
    </section>
  )
}
