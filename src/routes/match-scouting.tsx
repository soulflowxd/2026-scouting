import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { Check, Clock3, ListFilter } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Stepper } from "@/components/stepper"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { climbLabels, matchTags } from "@/lib/labels"
import { cn } from "@/lib/utils"

type AutoClimb = "none" | "level1"
type EndgameClimb = "none" | "level1" | "level2" | "level3"
type TeamSort = "teamNumber" | "epa" | "averageRp"
type SortDirection = "asc" | "desc"

type TeamStat = {
  teamNumber: number
  epa?: number
  averageRp?: number
}

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
  const { activeEvent } = useActiveEvent()
  const matches = useQuery(
    api.matchScouting.matchesForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [matchNumber, setMatchNumber] = useState<number | null>(null)
  const [teamNumber, setTeamNumber] = useState<number | null>(null)
  const [teamSort, setTeamSort] = useState<TeamSort>("teamNumber")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const selectedMatch = useMemo(
    () => matches?.find((match) => match.matchNumber === matchNumber) ?? null,
    [matchNumber, matches],
  )
  const orderedMatches = useMemo(
    () => [...(matches ?? [])].sort((a, b) => a.matchNumber - b.matchNumber),
    [matches],
  )

  if (!activeEvent) return <EmptyEvent />

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Match Scouting</h1>
          <p className="text-sm text-muted-foreground">
            {eventLabel(activeEvent)} · Select a team to claim its robot and start scouting.
          </p>
        </div>
        <div className="rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {orderedMatches.length} matches
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/25 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="size-4 text-muted-foreground" aria-hidden="true" />
            Team order
          </div>
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Sort teams by">
            {teamSortOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-md px-3",
                  teamSort === option.value && "bg-background shadow-sm hover:bg-background",
                )}
                onClick={() => setTeamSort(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Sort direction">
            {sortDirectionOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-md px-3",
                  sortDirection === option.value &&
                    "bg-background shadow-sm hover:bg-background",
                )}
                onClick={() => setSortDirection(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
            Select a team card to begin
          </p>
        </div>
        <div className="max-h-[34rem] overflow-y-auto">
          {matches === undefined && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading match schedule…
            </p>
          )}
          {matches !== undefined && orderedMatches.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No qualification matches are available yet.
            </p>
          )}
          {orderedMatches.map((match) => {
            const isSelected = matchNumber === match.matchNumber
            return (
              <article
                key={match._id}
                className={cn(
                  "grid gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4 lg:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)] lg:items-center",
                  isSelected && "bg-primary/[0.045]",
                )}
              >
                <div className="flex items-center justify-between gap-3 lg:block">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tracking-tight">
                      QM{match.matchNumber}
                    </span>
                    {isSelected && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" aria-hidden="true" />
                        <span className="sr-only">Selected match</span>
                      </span>
                    )}
                  </div>
                  {match.scheduledTime && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {new Date(match.scheduledTime * 1000).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <AllianceRow
                  label="Red alliance"
                  teams={match.redTeams}
                  teamStats={match.teamStats}
                  teamSort={teamSort}
                  sortDirection={sortDirection}
                  tone="red"
                  selectedTeam={isSelected ? teamNumber : null}
                  onSelect={(team) => {
                    setMatchNumber(match.matchNumber)
                    setTeamNumber(team)
                  }}
                />
                <AllianceRow
                  label="Blue alliance"
                  teams={match.blueTeams}
                  teamStats={match.teamStats}
                  teamSort={teamSort}
                  sortDirection={sortDirection}
                  tone="blue"
                  selectedTeam={isSelected ? teamNumber : null}
                  onSelect={(team) => {
                    setMatchNumber(match.matchNumber)
                    setTeamNumber(team)
                  }}
                />
              </article>
            )
          })}
        </div>
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

function AllianceRow({
  label,
  teams,
  teamStats,
  teamSort,
  sortDirection,
  tone,
  selectedTeam,
  onSelect,
}: {
  label: string
  teams: number[]
  teamStats: TeamStat[]
  teamSort: TeamSort
  sortDirection: SortDirection
  tone: "red" | "blue"
  selectedTeam: number | null
  onSelect: (teamNumber: number) => void
}) {
  const sortedTeams = sortTeamNumbers(teams, teamStats, teamSort, sortDirection)
  return (
    <div className="grid gap-1.5">
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide",
          tone === "red" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300",
        )}
      >
        {label}
      </span>
      <div className="grid grid-cols-3 gap-1.5">
        {sortedTeams.map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => onSelect(team)}
            aria-pressed={selectedTeam === team}
            className={cn(
              "grid min-w-0 gap-0.5 rounded-lg border px-2 py-2 text-left transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone === "red"
                ? "border-red-500/25 bg-red-500/8 text-red-800 hover:bg-red-500/15 dark:text-red-200"
                : "border-blue-500/25 bg-blue-500/8 text-blue-800 hover:bg-blue-500/15 dark:text-blue-200",
              selectedTeam === team &&
                (tone === "red"
                  ? "border-red-500 bg-red-500/20 ring-2 ring-red-500/25"
                  : "border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/25"),
            )}
          >
            <span className="truncate text-sm font-semibold">{team}</span>
            <span className="truncate text-[10px] font-medium opacity-75">
              {teamMetricLabel(teamStats, team)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

const teamSortOptions: { label: string; value: TeamSort }[] = [
  { label: "Team #", value: "teamNumber" },
  { label: "EPA", value: "epa" },
  { label: "RP", value: "averageRp" },
]

const sortDirectionOptions: { label: string; value: SortDirection }[] = [
  { label: "Low to high", value: "asc" },
  { label: "High to low", value: "desc" },
]

function sortTeamNumbers(
  teams: number[],
  stats: TeamStat[],
  sortBy: TeamSort,
  direction: SortDirection,
) {
  return [...teams].sort((a, b) => {
    const multiplier = direction === "asc" ? 1 : -1
    if (sortBy === "teamNumber") return (a - b) * multiplier
    const aValue = stats.find((item) => item.teamNumber === a)?.[sortBy]
    const bValue = stats.find((item) => item.teamNumber === b)?.[sortBy]
    if (aValue === undefined && bValue === undefined) return (a - b) * multiplier
    if (aValue === undefined) return 1
    if (bValue === undefined) return -1
    return (aValue - bValue) * multiplier || a - b
  })
}

function teamMetricLabel(stats: TeamStat[], teamNumber: number) {
  const stat = stats.find((item) => item.teamNumber === teamNumber)
  const epa = stat?.epa === undefined ? "EPA --" : `EPA ${stat.epa.toFixed(1)}`
  const rp = stat?.averageRp === undefined ? "RP --" : `RP ${stat.averageRp.toFixed(1)}`
  return `${epa} / ${rp}`
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
  const scoutingClosed = useQuery(api.events.list)?.find(event => event._id === eventId)?.scoutingEnabled === false
  const me = useQuery(api.members.me)
  const releaseClaim = useMutation(api.matchScouting.releaseClaim)
  const claimRobot = useMutation(api.matchScouting.claimRobot)
  const saveReport = useMutation(api.matchScouting.saveReport)
  const [form, setForm] = useState<MatchFormState>(emptyMatchForm)
  const claim = claims?.find((item) => item.teamNumber === teamNumber && item.status === "active")
  const myClaim = claims?.find((item) => item.scoutToken === me?.tokenIdentifier && item.status === "active")
  const claimedByOther = !!claim && claim.scoutToken !== me?.tokenIdentifier
  const [claimPending, setClaimPending] = useState(false)

  async function onRelease() {
    if (!myClaim) return
    setClaimPending(true)
    try {
      await releaseClaim({ claimId: myClaim._id })
      toast.success(`Released team ${myClaim.teamNumber}`)
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "Could not release claim. Please try again.")
    } finally { setClaimPending(false) }
  }

  async function onClaim() {
    setClaimPending(true)
    try {
      await claimRobot({ eventId, matchNumber, teamNumber })
      toast.success(`Claimed ${teamNumber} in QM${matchNumber}`)
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : "Could not claim robot. Please try again.")
    } finally {
      setClaimPending(false)
    }
  }

  async function onSubmit() {
    const reportedBreakdown = form.tags.includes("Broke down")
    const breakdownMessage = `Team ${teamNumber} broke down in QM${matchNumber}. Ask the team what failed on the robot.`
    const breakdownToastId = `breakdown-${eventId}-${matchNumber}-${teamNumber}`
    try {
      await saveReport({ eventId, matchNumber, teamNumber, ...form })
      if (reportedBreakdown) {
        toast.warning(breakdownMessage, {
          id: breakdownToastId,
          duration: 10_000,
        })
      } else {
        toast.success(`Saved QM${matchNumber} report for ${teamNumber}`)
      }
      setForm(emptyMatchForm)
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : "Save failed")
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
              {claimedByOther ? `Claimed by ${claim?.scoutName ?? "another scout"}` : claim ? "Claimed by you" : myClaim ? `You have team ${myClaim.teamNumber} claimed in this match` : "Claim required before submit"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
          {myClaim && <Button type="button" variant="outline" disabled={claimPending} onClick={() => void onRelease()}>Release team {myClaim.teamNumber}</Button>}
          <Button type="button" onClick={() => void onClaim()} disabled={scoutingClosed || claims === undefined || me === undefined || Boolean(claim) || Boolean(myClaim) || claimPending}>
            Claim
          </Button>
          </div>
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
      <Button type="button" size="lg" disabled={scoutingClosed} onClick={() => void onSubmit()}>
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
