import { useMutation, useQuery } from "convex/react"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Stepper } from "@/components/stepper"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { climbLabels, matchTags } from "@/lib/labels"

type AutoClimb = "none" | "level1"
type EndgameClimb = "none" | "level1" | "level2" | "level3"

type MatchFormState = {
  autoFuel: number
  autoClimb: AutoClimb
  autoNotes: string
  teleopFuel: number
  teleopNotes: string
  endgameClimb: EndgameClimb
  endgameNotes: string
  driverRating: number
  defenseRating: number
  tags: string[]
  autoAllianceFuel: number
  opponentAutoFuel: number
}

const emptyMatchForm: MatchFormState = {
  autoFuel: 0,
  autoClimb: "none",
  autoNotes: "",
  teleopFuel: 0,
  teleopNotes: "",
  endgameClimb: "none",
  endgameNotes: "",
  driverRating: 5,
  defenseRating: 5,
  tags: [],
  autoAllianceFuel: 0,
  opponentAutoFuel: 0,
}

export function MatchScoutingRoute() {
  const activeEvent = useQuery(api.events.active)
  const matches = useQuery(
    api.matchScouting.matchesForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [matchNumber, setMatchNumber] = useState<number | null>(null)
  const [teamNumber, setTeamNumber] = useState<number | null>(null)

  const selectedMatch = useMemo(
    () => matches?.find((match) => match.matchNumber === matchNumber) ?? null,
    [matchNumber, matches],
  )
  const matchTeams = selectedMatch
    ? [...selectedMatch.redTeams, ...selectedMatch.blueTeams]
    : []

  if (!activeEvent) return <EmptyEvent />

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Match Scouting</h1>
        <p className="text-sm text-muted-foreground">
          Claim one robot, then submit one match report.
        </p>
      </div>
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <Select
          value={matchNumber === null ? undefined : String(matchNumber)}
          onValueChange={(value) => {
            setMatchNumber(Number(value))
            setTeamNumber(null)
          }}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Select qualification match" />
          </SelectTrigger>
          <SelectContent>
            {(matches ?? [])
              .sort((a, b) => a.matchNumber - b.matchNumber)
              .map((match) => (
                <SelectItem key={match._id} value={String(match.matchNumber)}>
                  QM{match.matchNumber}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {selectedMatch && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {matchTeams.map((team) => (
              <Button
                key={team}
                type="button"
                variant={teamNumber === team ? "default" : "outline"}
                className="h-12"
                onClick={() => setTeamNumber(team)}
              >
                {team}
              </Button>
            ))}
          </div>
        )}
      </div>
      {selectedMatch && teamNumber !== null && (
        <MatchForm
          eventId={activeEvent._id}
          matchNumber={selectedMatch.matchNumber}
          teamNumber={teamNumber}
        />
      )}
    </section>
  )
}

function MatchForm({
  eventId,
  matchNumber,
  teamNumber,
}: {
  eventId: Id<"events">
  matchNumber: number
  teamNumber: number
}) {
  const claims = useQuery(api.matchScouting.claimsForMatch, { eventId, matchNumber })
  const claimRobot = useMutation(api.matchScouting.claimRobot)
  const saveReport = useMutation(api.matchScouting.saveReport)
  const [form, setForm] = useState<MatchFormState>(emptyMatchForm)
  const claim = claims?.find((item) => item.teamNumber === teamNumber && item.status === "active")

  async function onClaim() {
    try {
      await claimRobot({ eventId, matchNumber, teamNumber })
      toast.success(`Claimed ${teamNumber} in QM${matchNumber}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Claim failed")
    }
  }

  async function onSubmit() {
    try {
      await saveReport({ eventId, matchNumber, teamNumber, ...form })
      toast.success(`Saved QM${matchNumber} report for ${teamNumber}`)
      setForm(emptyMatchForm)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    }
  }

  const toggleTag = (tag: string) =>
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }))

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              QM{matchNumber} · Team {teamNumber}
            </h2>
            <p className="text-sm text-muted-foreground">
              {claim ? "Robot claimed" : "Claim required before submit"}
            </p>
          </div>
          <Button type="button" onClick={() => void onClaim()} disabled={Boolean(claim)}>
            Claim
          </Button>
        </div>
      </div>
      <FormSection title="Autonomous">
        <Stepper
          id="autoFuel"
          label="Fuel scored in Hub"
          value={form.autoFuel}
          onChange={(autoFuel) => setForm((current) => ({ ...current, autoFuel }))}
        />
        <OptionGroup
          label="Tower climb"
          value={form.autoClimb}
          options={["none", "level1"]}
          onChange={(autoClimb) =>
            setForm((current) => ({ ...current, autoClimb: autoClimb as AutoClimb }))
          }
        />
        <Textarea
          value={form.autoNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, autoNotes: event.target.value }))
          }
          placeholder="Auto notes"
        />
      </FormSection>
      <FormSection title="Teleop">
        <Stepper
          id="teleopFuel"
          label="Fuel scored in Hub"
          value={form.teleopFuel}
          onChange={(teleopFuel) =>
            setForm((current) => ({ ...current, teleopFuel }))
          }
        />
        <Textarea
          value={form.teleopNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, teleopNotes: event.target.value }))
          }
          placeholder="Teleop notes"
        />
      </FormSection>
      <FormSection title="Hub Shift Context">
        <Stepper
          id="autoAllianceFuel"
          label="Alliance Auto Fuel"
          value={form.autoAllianceFuel}
          onChange={(autoAllianceFuel) =>
            setForm((current) => ({ ...current, autoAllianceFuel }))
          }
        />
        <Stepper
          id="opponentAutoFuel"
          label="Opponent Auto Fuel"
          value={form.opponentAutoFuel}
          onChange={(opponentAutoFuel) =>
            setForm((current) => ({ ...current, opponentAutoFuel }))
          }
        />
      </FormSection>
      <FormSection title="Endgame">
        <OptionGroup
          label="Tower climb"
          value={form.endgameClimb}
          options={["none", "level1", "level2", "level3"]}
          onChange={(endgameClimb) =>
            setForm((current) => ({
              ...current,
              endgameClimb: endgameClimb as EndgameClimb,
            }))
          }
        />
        <Textarea
          value={form.endgameNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, endgameNotes: event.target.value }))
          }
          placeholder="Endgame notes"
        />
      </FormSection>
      <FormSection title="Ratings">
        <Stepper
          id="driverRating"
          label="Driver rating"
          min={1}
          max={10}
          value={form.driverRating}
          onChange={(driverRating) =>
            setForm((current) => ({ ...current, driverRating }))
          }
        />
        <Stepper
          id="defenseRating"
          label="Defense rating"
          min={1}
          max={10}
          value={form.defenseRating}
          onChange={(defenseRating) =>
            setForm((current) => ({ ...current, defenseRating }))
          }
        />
      </FormSection>
      <FormSection title="Tags">
        <div className="flex flex-wrap gap-2">
          {matchTags.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant={form.tags.includes(tag) ? "default" : "outline"}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      </FormSection>
      <Button type="button" size="lg" onClick={() => void onSubmit()}>
        Submit match report
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

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            variant={value === option ? "default" : "outline"}
            className="h-11"
            onClick={() => onChange(option)}
          >
            {climbLabels[option]}
          </Button>
        ))}
      </div>
    </div>
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
