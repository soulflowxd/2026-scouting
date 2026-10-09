import { useAction, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { Check, Clock3, ListFilter } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useBeforeUnload, useBlocker } from "react-router"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Stepper } from "@/components/stepper"
import { AutoPath, type PathPoint } from "@/components/auto-path"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  autoCycles: number
  autoClimb: AutoClimb
  autoNotes: string
  autoPath: PathPoint[][]
  shift1Cycles: number
  shift2Cycles: number
  shift3Cycles: number
  transitionActivity: string
  endgameCycles: number
  offShiftActivity: string
  teleopNotes: string
  endgameClimb: EndgameClimb
  endgameNotes: string
  driverRating: number
  defenseRating: number
  tags: string[]
  wonAuto: boolean
  wonMatch: boolean
  totalMatchPoints: number
}

const emptyMatchForm: MatchFormState = {
  autoCycles: 0,
  autoClimb: "none",
  autoNotes: "",
  autoPath: [],
  shift1Cycles: 0,
  shift2Cycles: 0,
  shift3Cycles: 0,
  transitionActivity: "",
  endgameCycles: 0,
  offShiftActivity: "",
  teleopNotes: "",
  endgameClimb: "none",
  endgameNotes: "",
  driverRating: 5,
  defenseRating: 5,
  tags: [],
  wonAuto: false,
  wonMatch: false,
  totalMatchPoints: 0,
}

export function MatchScoutingRoute() {
  const me = useQuery(api.members.me)
  const { activeEvent } = useActiveEvent()
  const myAssignments = useQuery(api.scoutAssignments.mine, activeEvent && me?.approvalStatus === "approved" ? { eventId: activeEvent._id } : "skip")
  const matches = useQuery(
    api.matchScouting.matchesForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [matchNumber, setMatchNumber] = useState<number | null>(null)
  const [teamNumber, setTeamNumber] = useState<number | null>(null)
  const [teamSort, setTeamSort] = useState<TeamSort>("teamNumber")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const reportRef = useRef<HTMLElement>(null)
  const [scrollRequest, setScrollRequest] = useState(0)
  function selectTeam(match: number, team: number) {
    setMatchNumber(match)
    setTeamNumber(team)
    setScrollRequest(current => current + 1)
  }

  const selectedMatch = useMemo(
    () => matches?.find((match) => match.matchNumber === matchNumber) ?? null,
    [matchNumber, matches],
  )
  const orderedMatches = useMemo(
    () => [...(matches ?? [])].sort((a, b) => a.matchNumber - b.matchNumber),
    [matches],
  )
  const reportReady = !!selectedMatch && teamNumber !== null && !!me
  useEffect(() => {
    if (!reportReady || !scrollRequest) return
    const frame = window.requestAnimationFrame(() => {
      reportRef.current?.focus({ preventScroll: true })
      reportRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [scrollRequest, reportReady])

  if (!activeEvent) return <EmptyEvent />

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Match scouting</h1>
          <p className="text-sm text-muted-foreground">
            {eventLabel(activeEvent)} · Select a team to claim its robot and start scouting.
          </p>
        </div>
        <div className="rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {orderedMatches.length} matches
        </div>
      </div>
      {myAssignments?.enabled && <section className="grid gap-3 rounded-xl border border-primary/30 bg-card p-4" aria-label="My scouting assignments">
        <div><h2 className="text-sm font-semibold">Your regular teams: {myAssignments.teams.map(team => team.label).join(", ") || "None assigned yet"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{myAssignments.teams.length || myAssignments.matchAssignments.length ? "Your group size depends on available scouts. If your teams play together, follow the match assignment below—you may cover a different team." : "Ask an admin to include you and assign your teams. Confirmed substitute handoffs still work."}</p>
        </div>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {myAssignments.matchAssignments.map(slot => <Button key={`${slot.matchNumber}-${slot.teamNumber}`} size="sm" variant="outline" onClick={() => selectTeam(slot.matchNumber, slot.teamNumber)}>QM{slot.matchNumber} · {slot.label}</Button>)}
          {!myAssignments.hasSchedule && <p className="text-xs text-muted-foreground">Match assignments will appear when the event schedule is available.</p>}
        </div>
      </section>}
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
                aria-pressed={teamSort === option.value}
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
                aria-pressed={sortDirection === option.value}
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
                    selectTeam(match.matchNumber, team)
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
                    selectTeam(match.matchNumber, team)
                  }}
                />
              </article>
            )
          })}
        </div>
      </div>
      {selectedMatch && teamNumber !== null && me && (
        <section ref={reportRef} tabIndex={-1} aria-label={`QM${selectedMatch.matchNumber} team ${teamNumber} match report`} className="scroll-mt-20 focus:outline-none">
        <MatchForm
          key={`${activeEvent._id}:${selectedMatch.matchNumber}:${teamNumber}:${me.tokenIdentifier}`}
          scoutToken={me.tokenIdentifier}
          eventId={activeEvent._id}
          matchNumber={selectedMatch.matchNumber}
          teamNumber={teamNumber}
        />
        </section>
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
            <span className="flex flex-wrap gap-x-1 text-[11px] font-medium">
              {teamMetricLabel(teamStats, team).split(" / ").map(metric => <span key={metric}>{metric}</span>)}
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
  scoutToken,
  eventId,
  matchNumber,
  teamNumber,
}: {
  scoutToken: string
  eventId: Id<"events">
  matchNumber: number
  teamNumber: number
}) {
  const claims = useQuery(api.matchScouting.claimsForMatch, { eventId, matchNumber })
  const tbaMatch = useQuery(api.tbaMatches.forMatch, { eventId, matchNumber })
  const refreshTba = useAction(api.tbaMatches.refresh)
  const [tbaStatus, setTbaStatus] = useState("loading")
  const side = tbaMatch?.redTeams.includes(teamNumber) ? "red" : tbaMatch?.blueTeams.includes(teamNumber) ? "blue" : null
  const officialResult = side ? tbaMatch?.tbaResult?.[side] : undefined
  useEffect(() => {
    let active = true
    const refresh = () => { void refreshTba({ eventId, matchNumber }).then(status => { if (active) setTbaStatus(status) }).catch(() => { if (active) setTbaStatus("unavailable") }) }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [eventId, matchNumber, refreshTba])
  const scoutingClosed = useQuery(api.events.list)?.find(event => event._id === eventId)?.scoutingEnabled === false
  const me = useQuery(api.members.me)
  const releaseClaim = useMutation(api.matchScouting.releaseClaim)
  const assignments = useQuery(api.scoutAssignments.mine, { eventId })
  const substitutes = useQuery(api.matchScouting.availableSubstitutes)
  const requestSubstitute = useMutation(api.matchScouting.requestSubstitute)
  const [substituteId, setSubstituteId] = useState("")
  const [requestingSub, setRequestingSub] = useState(false)
  const claimRobot = useMutation(api.matchScouting.claimRobot)
  const saveReport = useMutation(api.matchScouting.saveReport)
  const reportSubmitted = useQuery(api.matchScouting.reportSubmitted, { eventId, matchNumber, teamNumber })
  const draftKey = `scouting:match-draft:${scoutToken}:${eventId}:${matchNumber}:${teamNumber}`
  const [initialDraft] = useState(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(draftKey) ?? "null")
      if (!saved || typeof saved !== "object") return emptyMatchForm
      const draft = saved as Record<string, unknown>
      const result = { ...emptyMatchForm }
      for (const field of Object.keys(emptyMatchForm) as (keyof MatchFormState)[]) {
        const value = draft[field]
        if (typeof emptyMatchForm[field] === "number" && typeof value === "number" && Number.isFinite(value)) Object.assign(result, { [field]: value })
        if (typeof emptyMatchForm[field] === "string" && typeof value === "string") Object.assign(result, { [field]: value })
        if (typeof emptyMatchForm[field] === "boolean" && typeof value === "boolean") Object.assign(result, { [field]: value })
      }
      result.tags = Array.isArray(draft.tags) ? draft.tags.filter((tag): tag is string => typeof tag === "string" && matchTags.includes(tag)) : []
      if (Array.isArray(draft.autoPath) && draft.autoPath.length <= 200 && draft.autoPath.every(path => Array.isArray(path) && path.every(p => p && typeof p.x === "number" && Number.isFinite(p.x) && p.x >= 0 && p.x <= 1000 && typeof p.y === "number" && Number.isFinite(p.y) && p.y >= 0 && p.y <= 500)) && draft.autoPath.reduce((count, path) => count + path.length, 0) <= 2000) result.autoPath = draft.autoPath
      if (!["none", "level1"].includes(result.autoClimb)) result.autoClimb = "none"
      if (!["none", "level1", "level2", "level3"].includes(result.endgameClimb)) result.endgameClimb = "none"
      return result
    } catch { return emptyMatchForm }
  })
  const [form, setForm] = useState<MatchFormState>(initialDraft)
  const [savedForm, setSavedForm] = useState(() => JSON.stringify(initialDraft))
  const [hasDraft, setHasDraft] = useState(initialDraft !== emptyMatchForm)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dirty = JSON.stringify(form) !== savedForm
  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(form))
      setSavedForm(JSON.stringify(form))
      setHasDraft(true)
      toast.success("Draft saved on this device. It has not been submitted.")
      return true
    } catch { toast.error("Could not save the draft. Check device storage and try again."); return false }
  }
  useBeforeUnload((event) => {
    if (dirty) { event.preventDefault(); event.returnValue = "" }
  })
  const blocker = useBlocker(dirty && !saving)
  const claim = claims?.find((item) => item.teamNumber === teamNumber && item.status === "active")
  const myClaim = claims?.find((item) => item.scoutToken === me?.tokenIdentifier && item.status === "active")
  const claimedByOther = !!claim && claim.scoutToken !== me?.tokenIdentifier
  const allowedByAssignment = !!assignments && (!assignments.enabled || me?.role === "admin" || (assignments.hasSchedule ? assignments.matchAssignments.some(slot => slot.matchNumber === matchNumber && slot.teamNumber === teamNumber) : assignments.teams.some(team => team.teamNumber === teamNumber)) || (!!claim && claim.scoutToken === me?.tokenIdentifier))
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
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
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
      setSavedForm(JSON.stringify(emptyMatchForm))
      setHasDraft(false)
      try { localStorage.removeItem(draftKey) } catch { /* Submission succeeded even if local cleanup fails. */ }
    } catch (error) {
      toast.error(error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : "Save failed")
    } finally {
      savingRef.current = false
      setSaving(false)
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
      {blocker.state === "blocked" && <div role="alert" className="sticky top-14 z-30 grid gap-3 rounded-xl border bg-background p-4 shadow-lg">
        <p>You have unsaved changes. Save a draft before leaving?</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => blocker.reset()}>Keep scouting</Button>
          <Button onClick={() => { if (saveDraft()) blocker.proceed() }}>Save draft and leave</Button>
          <Button variant="outline" onClick={() => blocker.proceed()}>Discard and leave</Button>
        </div>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
        <p role="status" className="text-xs text-muted-foreground">{hasDraft ? "Draft saved on this device" : "Drafts stay on this device"}{dirty ? " · Unsaved changes" : ""} · Not submitted</p>
        <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>Save draft</Button>
      </div>
      {reportSubmitted && <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">Report already submitted for team {teamNumber} in QM{matchNumber}. An admin must delete it in team details before this robot can be scouted again.</p>}
      <fieldset disabled={saving || reportSubmitted !== false} className="grid min-w-0 gap-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              QM{matchNumber} · Team {teamNumber}
            </h2>
            <p className="text-sm text-muted-foreground">
              {claimedByOther ? `Claimed by ${claim?.scoutName ?? "another scout"}` : claim ? "Claimed by you" : myClaim ? `You have team ${myClaim.teamNumber} claimed in this match` : "Claim required before submit"}
            </p>
            {assignments?.enabled && !allowedByAssignment && <p className="mt-1 text-xs text-muted-foreground">This isn’t your assignment for this match. Check your match shortcuts above, ask an admin to update the assignments, or accept a substitute handoff.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
          {myClaim && <Button type="button" variant="outline" disabled={claimPending || !!myClaim.substituteToken} onClick={() => void onRelease()}>Release team {myClaim.teamNumber}</Button>}
          <Button type="button" onClick={() => void onClaim()} disabled={!allowedByAssignment || scoutingClosed || claims === undefined || me === undefined || Boolean(claim) || Boolean(myClaim) || claimPending}>
            Claim
          </Button>
          </div>
        </div>
      </div>
      {myClaim && !myClaim.substituteToken && <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Need a break? Arrange a substitute</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">Stay assigned until your substitute accepts and you confirm the handoff. Finish your report first; device-only drafts do not transfer.</p>
          <label className="grid gap-1 text-sm">Substitute scout
            <select className="min-h-11 rounded-lg border bg-background px-3" value={substituteId} onChange={event => setSubstituteId(event.target.value)}>
              <option value="">Choose a scout</option>
              {substitutes?.map(scout => <option key={scout._id} value={scout._id}>{scout.name}</option>)}
            </select>
          </label>
          <Button disabled={!substituteId || requestingSub || scoutingClosed} onClick={async () => {
            setRequestingSub(true)
            try { await requestSubstitute({ claimId: myClaim._id, substituteId: substituteId as Id<"members"> }); toast.success("Substitute requested. Keep scouting until both confirmations are complete.") }
            catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not request substitute") }
            finally { setRequestingSub(false) }
          }}>Request substitute</Button>
        </div>
      </details>}
      <FormSection title="Autonomous">
        {officialResult?.wonAuto !== undefined ? <p className="text-sm font-medium">TBA: {officialResult.tiedAuto ? "Auto fuel tied" : officialResult.wonAuto ? "Won auto" : "Lost auto"} · {officialResult.autoAllianceFuel}–{officialResult.opponentAutoFuel} fuel</p> : <>
        <Button type="button" variant={form.wonAuto ? "default" : "outline"} aria-pressed={form.wonAuto}
          onClick={() => setForm(current => ({ ...current, wonAuto: !current.wonAuto }))}>
          {form.wonAuto && <Check aria-hidden="true" />}Won auto
        </Button>
        </>}
        <Stepper
          id="autoCycles"
          label="Auto cycles"
          value={form.autoCycles}
          onChange={(autoCycles) => setForm((current) => ({ ...current, autoCycles }))}
        />
        <OptionGroup
          label="Tower climb"
          value={form.autoClimb}
          options={["none", "level1"]}
          onChange={(autoClimb) =>
            setForm((current) => ({ ...current, autoClimb: autoClimb as AutoClimb }))
          }
        />
        <div className="grid gap-2">
        <Label htmlFor="auto-notes">Auto notes</Label>
        <Textarea
          id="auto-notes"
          value={form.autoNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, autoNotes: event.target.value }))
          }
          placeholder="What did you notice during auto?"
          aria-label="Auto notes"
        />
        </div>
        <div id="observed-auto-path" className="grid min-w-0 gap-2">
          <h3 className="text-sm font-medium">Observed auto path</h3>
          <p className="text-xs text-muted-foreground">Draw where this robot actually drove during auto, not its planned pit path. Use Line to draw or Points to connect taps. If it did not move, tap its starting position.</p>
          <AutoPath value={form.autoPath} onChange={autoPath => setForm(current => ({ ...current, autoPath }))} />
        </div>
      </FormSection>
      <FormSection title="Teleop">
        <p className="text-sm text-muted-foreground">1 cycle = one intake set followed immediately by one shooting set.</p>
        <label className="grid gap-2 text-sm font-medium">
          What does the robot do in transition? (required)
          <Textarea required value={form.transitionActivity}
            onChange={event => setForm(current => ({ ...current, transitionActivity: event.target.value }))}
            placeholder="For example: shoot preloaded fuel, collect, reposition, or idle" />
        </label>
        <div className="grid gap-4 lg:grid-cols-3">
          {(["shift1Cycles", "shift2Cycles", "shift3Cycles"] as const).map((field, index) => (
            <div key={field} className="rounded-lg border bg-muted/20 p-3">
              <Stepper id={field} label={`Shift ${index + 1} cycles`} value={form[field]}
                onChange={value => setForm(current => ({ ...current, [field]: value }))} />
            </div>
          ))}
        </div>
        <label className="grid gap-2 text-sm font-medium">
          What does the robot do off-shift? (required)
          <Textarea required value={form.offShiftActivity}
            onChange={(event) => setForm(current => ({ ...current, offShiftActivity: event.target.value }))}
            placeholder="For example: collect fuel, defend, feed teammates, or idle" />
        </label>
        <div className="grid gap-2">
        <Label htmlFor="teleop-notes">Teleop notes (observations)</Label>
        <Textarea
          id="teleop-notes"
          value={form.teleopNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, teleopNotes: event.target.value }))
          }
          placeholder="Describe the robot’s performance and consistency."
          aria-label="Teleop notes (observations)"
        />
        </div>
      </FormSection>
      <FormSection title="Endgame">
        <Stepper id="endgameCycles" label="Endgame cycles" value={form.endgameCycles}
          onChange={(endgameCycles) => setForm(current => ({ ...current, endgameCycles }))} />
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
        <div className="grid gap-2">
        <Label htmlFor="endgame-notes">Endgame notes</Label>
        <Textarea
          id="endgame-notes"
          value={form.endgameNotes}
          onChange={(event) =>
            setForm((current) => ({ ...current, endgameNotes: event.target.value }))
          }
          placeholder="Describe the climb or other endgame behavior."
          aria-label="Endgame notes"
        />
        </div>
      </FormSection>
      <FormSection title="Match result">
        {officialResult ? <div className="grid gap-1">
          <p className="text-sm font-semibold">{officialResult.tiedMatch ? "Tied match" : officialResult.wonMatch ? "Won match" : "Lost match"} · {officialResult.totalMatchPoints} alliance points</p>
          <a className="text-xs text-primary underline" href={`https://www.thebluealliance.com/match/${tbaMatch!.tbaMatchKey}`} target="_blank" rel="noreferrer">Automatically synced from The Blue Alliance</a>
          <p className="text-xs text-muted-foreground">Robot cycles and activities still come from your observations.</p>
        </div> : <>
        <Button type="button" variant={form.wonMatch ? "default" : "outline"} aria-pressed={form.wonMatch}
          onClick={() => setForm(current => ({ ...current, wonMatch: !current.wonMatch }))}>
          {form.wonMatch && <Check aria-hidden="true" />}Won match
        </Button>
        <Stepper id="totalMatchPoints" label="Total alliance match points" max={9999} value={form.totalMatchPoints}
          onChange={totalMatchPoints => setForm(current => ({ ...current, totalMatchPoints }))} />
        <p className="text-xs text-muted-foreground">Enter the alliance’s final score, not this robot’s individual points.</p>
        <p className="text-xs text-muted-foreground">{tbaStatus === "manual" ? "This event uses manual results." : tbaStatus === "loading" ? "Checking TBA for match results…" : tbaStatus === "unavailable" ? "TBA is unavailable. You can enter results manually; we’ll retry automatically." : "TBA results haven’t posted yet. Enter results manually or keep scouting; they’ll sync when available."}</p>
        </>}
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
              aria-pressed={form.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      </FormSection>
      <Button type="button" size="lg" disabled={!allowedByAssignment || scoutingClosed || saving || !form.offShiftActivity.trim() || !form.transitionActivity.trim()} onClick={() => void onSubmit()}>
        {saving ? "Saving report…" : "Submit match report"}
      </Button>
      </fieldset>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="border-b pb-3 text-base font-semibold tracking-tight">{title}</h3>
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
      <div role="group" aria-label={label} className={cn("grid grid-cols-2 gap-2", options.length > 2 && "sm:grid-cols-4")}>
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            variant={value === option ? "default" : "outline"}
            aria-pressed={value === option}
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
