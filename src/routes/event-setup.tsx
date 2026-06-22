import { useAction, useMutation, useQuery } from "convex/react"
import { CheckCircle2, RefreshCw, UploadCloud } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { eventLabel, useActiveEvent } from "@/lib/active-event"

export function EventSetupRoute() {
  const me = useQuery(api.members.me)
  const { activeEvent, events, selectActiveEvent } = useActiveEvent()
  const createOrSelect = useMutation(api.events.createOrSelect)
  const importEvent = useAction(api.imports.importEvent)
  const refreshStats = useAction(api.imports.refreshStats)
  const [eventKey, setEventKey] = useState("2026nvlv")
  const [pending, setPending] = useState(false)

  const isAdmin = me?.role === "admin"

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      const result = await importEvent({ eventKey })
      selectActiveEvent(result.eventId)
      toast.success(`Imported ${result.teamCount} teams`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed")
    } finally {
      setPending(false)
    }
  }

  async function onRefresh(id: Id<"events">) {
    setPending(true)
    try {
      await refreshStats({ eventId: id })
      toast.success("Stats refreshed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed")
    } finally {
      setPending(false)
    }
  }

  async function onSelect(id: Id<"events">, key: string) {
    setPending(true)
    try {
      selectActiveEvent(id)
      await createOrSelect({ eventKey: key })
      toast.success("Event selected")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Event select failed")
    } finally {
      setPending(false)
    }
  }

  async function onCreateOnly() {
    setPending(true)
    try {
      const id = await createOrSelect({ eventKey })
      selectActiveEvent(id)
      toast.success("Event selected")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Event setup failed")
    } finally {
      setPending(false)
    }
  }

  if (!isAdmin) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">Event Setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin only. Add your email to `ADMIN_EMAILS` in Convex ENV.
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Event Setup</h1>
        <p className="text-sm text-muted-foreground">
          API keys live in Convex ENV. Enter only the event key here.
        </p>
      </div>
      <form onSubmit={onImport} className="grid gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor="eventKey">TBA event key</Label>
          <Input
            id="eventKey"
            value={eventKey}
            onChange={(event) => setEventKey(event.target.value)}
            placeholder="2026nvlv"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            <UploadCloud aria-hidden="true" />
            Import event
          </Button>
          <Button type="button" variant="outline" onClick={onCreateOnly} disabled={pending}>
            Create empty event
          </Button>
        </div>
      </form>
      <Separator />
      <div className="grid gap-3">
        {events?.map((event) => {
          const isActive = activeEvent?._id === event._id
          return (
            <div
              key={event._id}
              className={
                isActive
                  ? "grid gap-3 rounded-xl border border-primary bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center"
                  : "grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              }
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{eventLabel(event)}</p>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.importStatus} {event.importMessage ? `- ${event.importMessage}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant={isActive ? "secondary" : "default"}
                  onClick={() => void onSelect(event._id, event.eventKey)}
                  disabled={pending || isActive}
                >
                  {isActive ? "Selected" : "Select event"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onRefresh(event._id)}
                  disabled={pending || event.importStatus !== "ready"}
                >
                  <RefreshCw aria-hidden="true" />
                  Refresh stats
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
