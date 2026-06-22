import { useAction, useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { MapPinned, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Stepper } from "@/components/stepper"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { eventLabel, useActiveEvent } from "@/lib/active-event"

type PitFormState = {
  canScoreFuelHub: boolean
  canIntakeDepot: boolean
  canIntakeFloor: boolean
  canPreload: boolean
  preloadCount: number
  canClimbLevel1: boolean
  canClimbLevel2: boolean
  canClimbLevel3: boolean
  canAutoClimbLevel1: boolean
  canCrossBump: boolean
  canCrossTrench: boolean
  drivetrain: string
  notes: string
}

const emptyPitForm: PitFormState = {
  canScoreFuelHub: false,
  canIntakeDepot: false,
  canIntakeFloor: false,
  canPreload: false,
  preloadCount: 0,
  canClimbLevel1: false,
  canClimbLevel2: false,
  canClimbLevel3: false,
  canAutoClimbLevel1: false,
  canCrossBump: false,
  canCrossTrench: false,
  drivetrain: "",
  notes: "",
}

export function PitScoutingRoute() {
  const { activeEvent } = useActiveEvent()
  const teams = useQuery(
    api.teams.list,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const fetchPitMap = useAction(api.nexus.fetchPitMap)
  const [pitMap, setPitMap] = useState<{
    eventKey: string
    pits: { teamNumber: number; location: string }[]
    message?: string
  } | null>(null)
  const [pitMapError, setPitMapError] = useState<string | null>(null)
  const [pitMapLoading, setPitMapLoading] = useState(false)

  const pitByTeam = useMemo(
    () => new Map((pitMap?.pits ?? []).map((pit) => [pit.teamNumber, pit.location])),
    [pitMap],
  )

  const loadPitMap = useCallback(async (eventId: Id<"events">) => {
    setPitMapLoading(true)
    setPitMapError(null)
    try {
      const result = await fetchPitMap({ eventId })
      setPitMap(result)
    } catch (error) {
      setPitMap(null)
      setPitMapError(error instanceof Error ? error.message : "Could not load Nexus pit map")
    } finally {
      setPitMapLoading(false)
    }
  }, [fetchPitMap])

  useEffect(() => {
    if (activeEvent) {
      void loadPitMap(activeEvent._id)
    }
  }, [activeEvent, loadPitMap])

  if (!activeEvent) {
    return <EmptyEvent />
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pit Scouting</h1>
        <p className="text-sm text-muted-foreground">
          {eventLabel(activeEvent)}. Pick a team, scout with taps, avoid long typing.
        </p>
      </div>
      {selectedTeam === null ? (
        <>
          <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MapPinned className="size-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">Nexus pit map</h2>
                  <p className="text-sm text-muted-foreground">
                    {pitMapLoading
                      ? "Loading from FRC Nexus..."
                      : pitMap?.pits.length
                        ? `${pitMap.pits.length} pit locations loaded for ${pitMap.eventKey}.`
                        : pitMapError ?? pitMap?.message ?? "No pit map loaded yet."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadPitMap(activeEvent._id)}
                disabled={pitMapLoading}
              >
                <RefreshCw className={pitMapLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                Refresh
              </Button>
            </div>
            {pitMap?.pits.length ? (
              <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
                {pitMap.pits.map((pit) => (
                  <div key={`${pit.teamNumber}-${pit.location}`} className="rounded-lg border bg-background px-3 py-2">
                    <p className="font-semibold">{pit.teamNumber}</p>
                    <p className="text-sm text-muted-foreground">{pit.location}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(teams ?? []).map((team) => {
              const pitLocation = pitByTeam.get(team.teamNumber)
              return (
                <button
                  key={team._id}
                  type="button"
                  onClick={() => setSelectedTeam(team.teamNumber)}
                  className="grid gap-2 rounded-xl border bg-card p-4 text-left shadow-sm"
                >
                  <p className="text-xl font-semibold">{team.teamNumber}</p>
                  <p className="text-sm text-muted-foreground">{team.nickname}</p>
                  {pitLocation ? (
                    <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-sm font-medium text-primary">
                      Pit {pitLocation}
                    </span>
                  ) : null}
                  <span className={team.pitScouted ? "text-sm text-primary" : "text-sm text-muted-foreground"}>
                    {team.pitScouted ? "Scouted" : "Not scouted"}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <PitForm
          eventId={activeEvent._id}
          teamNumber={selectedTeam}
          onBack={() => setSelectedTeam(null)}
        />
      )}
    </section>
  )
}

function PitForm({
  eventId,
  teamNumber,
  onBack,
}: {
  eventId: Id<"events">
  teamNumber: number
  onBack: () => void
}) {
  const reports = useQuery(api.pit.getForTeam, { eventId, teamNumber })
  const save = useMutation(api.pit.save)
  const [form, setForm] = useState<PitFormState>(emptyPitForm)

  useEffect(() => {
    const latest = reports?.[0]
    if (latest) {
      setForm({
        canScoreFuelHub: latest.canScoreFuelHub,
        canIntakeDepot: latest.canIntakeDepot,
        canIntakeFloor: latest.canIntakeFloor,
        canPreload: latest.canPreload,
        preloadCount: latest.preloadCount,
        canClimbLevel1: latest.canClimbLevel1,
        canClimbLevel2: latest.canClimbLevel2,
        canClimbLevel3: latest.canClimbLevel3,
        canAutoClimbLevel1: latest.canAutoClimbLevel1,
        canCrossBump: latest.canCrossBump,
        canCrossTrench: latest.canCrossTrench,
        drivetrain: latest.drivetrain,
        notes: latest.notes,
      })
    } else {
      setForm(emptyPitForm)
    }
  }, [reports])

  const setBool = (key: keyof PitFormState, value: boolean) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function onSubmit() {
    try {
      await save({ eventId, teamNumber, ...form })
      toast.success(`Saved pit report for ${teamNumber}`)
      onBack()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Team {teamNumber}</h2>
          <p className="text-sm text-muted-foreground">Pit scouting form</p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
      <FormSection title="Fuel">
        <CheckRow label="Scores Fuel in Hub" checked={form.canScoreFuelHub} onChange={(value) => setBool("canScoreFuelHub", value)} />
        <CheckRow label="Intakes from Depot" checked={form.canIntakeDepot} onChange={(value) => setBool("canIntakeDepot", value)} />
        <CheckRow label="Intakes floor/Neutral Zone" checked={form.canIntakeFloor} onChange={(value) => setBool("canIntakeFloor", value)} />
        <CheckRow label="Can preload Fuel" checked={form.canPreload} onChange={(value) => setBool("canPreload", value)} />
        <Stepper
          id="preloadCount"
          label="Preload count"
          value={form.preloadCount}
          max={8}
          onChange={(preloadCount) => setForm((current) => ({ ...current, preloadCount }))}
        />
      </FormSection>
      <FormSection title="Tower">
        <CheckRow label="Climb Level 1" checked={form.canClimbLevel1} onChange={(value) => setBool("canClimbLevel1", value)} />
        <CheckRow label="Climb Level 2" checked={form.canClimbLevel2} onChange={(value) => setBool("canClimbLevel2", value)} />
        <CheckRow label="Climb Level 3" checked={form.canClimbLevel3} onChange={(value) => setBool("canClimbLevel3", value)} />
        <CheckRow label="Auto climb Level 1" checked={form.canAutoClimbLevel1} onChange={(value) => setBool("canAutoClimbLevel1", value)} />
      </FormSection>
      <FormSection title="Mobility">
        <CheckRow label="Crosses Bump" checked={form.canCrossBump} onChange={(value) => setBool("canCrossBump", value)} />
        <CheckRow label="Crosses Trench" checked={form.canCrossTrench} onChange={(value) => setBool("canCrossTrench", value)} />
      </FormSection>
      <FormSection title="Notes">
        <div className="grid gap-2">
          <Label htmlFor="drivetrain">Drivetrain</Label>
          <Input
            id="drivetrain"
            value={form.drivetrain}
            onChange={(event) =>
              setForm((current) => ({ ...current, drivetrain: event.target.value }))
            }
            placeholder="swerve, tank, etc."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pitNotes">Robot notes</Label>
          <Textarea
            id="pitNotes"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={3}
          />
        </div>
      </FormSection>
      <Button type="button" size="lg" onClick={() => void onSubmit()}>
        Submit pit report
      </Button>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-lg bg-muted px-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}

function EmptyEvent() {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h1 className="text-xl font-semibold">No event yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask an admin to import an event first.
      </p>
    </section>
  )
}
