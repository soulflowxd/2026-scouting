import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { AutoPath } from "@/components/auto-path"
import { PitPhotos } from "@/components/pit-photos"
import { TeamAvatar } from "@/components/team-avatar"
import { useTeamColors } from "@/lib/team-colors"
import { pitMeasurements } from "@/lib/pit-measurements"
import { Separator } from "@/components/ui/separator"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { climbLabels, tierLabels } from "@/lib/labels"

type TeamSort = "teamNumber" | "epa" | "averageRp" | "xp"
type SortDirection = "asc" | "desc"
type XpScope = "season" | "all"

export function TeamsRoute() {
  const { activeEvent } = useActiveEvent()
  const [xpScope, setXpScope] = useState<XpScope>(() =>
    localStorage.getItem("match13-xp-scope") === "all" ? "all" : "season",
  )
  const teams = useQuery(
    api.teams.list,
    activeEvent ? { eventId: activeEvent._id, xpScope } : "skip",
  )
  const [search, setSearch] = useState("")
  const teamColors = useTeamColors((teams ?? []).map(team => team.teamNumber))
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<TeamSort>("teamNumber")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (teams ?? [])
      .filter(
        (team) =>
          !needle ||
          String(team.teamNumber).includes(needle) ||
          team.eventTeamAlias?.toLowerCase().includes(needle) ||
          team.nickname.toLowerCase().includes(needle),
      )
      .sort((a, b) => sortTeams(a, b, sortBy, sortDirection))
  }, [search, sortBy, sortDirection, teams])
  const hasEpa = (teams ?? []).some((team) => team.epa !== undefined)
  const hasRp = (teams ?? []).some((team) => team.averageRp !== undefined)

  if (!activeEvent) {
    return <EmptyEvent />
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_320px] sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Teams</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} teams at {eventLabel(activeEvent)}
          </p>
        </div>
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search teams"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teams"
            className="pl-9"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <label className="grid gap-1 text-xs font-medium">Sort by
          <select value={sortBy} onChange={event => setSortBy(event.target.value as TeamSort)} className="min-h-11 rounded-lg border bg-card px-2 text-base">
            {teamSortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">Order
          <select value={sortDirection} onChange={event => setSortDirection(event.target.value as SortDirection)} className="min-h-11 rounded-lg border bg-card px-2 text-base">
            {sortDirectionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="col-span-2 grid gap-1 text-xs font-medium">xP scope
          <select value={xpScope} onChange={event => { setXpScope(event.target.value as "season" | "all"); localStorage.setItem("match13-xp-scope", event.target.value) }} className="min-h-11 rounded-lg border bg-card px-2 text-base">
            <option value="season">In season</option><option value="all">Including offseason</option>
          </select>
        </label>
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <span className="text-sm font-medium">xP scope</span>
        <div role="group" aria-label="xP scope" className="inline-flex gap-1">
          {([
            { value: "season", label: "In season" },
            { value: "all", label: "Including offseason" },
          ] as const).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              aria-pressed={xpScope === option.value}
              variant={xpScope === option.value ? "default" : "outline"}
              onClick={() => {
                setXpScope(option.value)
                localStorage.setItem("match13-xp-scope", option.value)
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <span className="text-sm font-medium">Sort</span>
        {teamSortOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={sortBy === option.value ? "default" : "outline"}
            aria-pressed={sortBy === option.value}
            onClick={() => setSortBy(option.value)}
          >
            {option.label}
          </Button>
        ))}
        <span className="ml-2 text-sm font-medium">Order</span>
        {sortDirectionOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={sortDirection === option.value ? "default" : "outline"}
            aria-pressed={sortDirection === option.value}
            onClick={() => setSortDirection(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {(!hasEpa || !hasRp) && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {!hasEpa && <p>No current-event/current-year Statbotics EPA imported yet.</p>}
          {!hasRp && <p>No RP data imported yet for this event.</p>}
          <p>EPA/RP sort changes once those fields have numeric values.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((team) => (
          <button
            key={team._id}
            type="button"
            onClick={() => setSelectedTeam(team.teamNumber)}
            className="relative grid gap-3 overflow-hidden rounded-xl border bg-card p-4 pt-5 text-left shadow-sm transition hover:border-primary/50"
          >
            {teamColors[team.teamNumber] && <span aria-hidden="true" className="absolute inset-x-0 top-0 flex h-1.5">
              <span className="w-2/3" style={{ backgroundColor: teamColors[team.teamNumber].primary }} />
              <span className="w-1/3" style={{ backgroundColor: teamColors[team.teamNumber].secondary }} />
            </span>}
            <div className="flex items-start justify-between gap-3">
              <TeamAvatar teamNumber={team.teamNumber} />
              <div className="min-w-0 flex-1">
                <p className={`text-xl font-semibold ${team.picked ? "line-through text-muted-foreground" : ""}`}>{team.eventTeamAlias ?? team.teamNumber}</p>
                <p className={`text-sm text-muted-foreground ${team.picked ? "line-through" : ""}`}>{team.nickname}</p>
                {team.picked && <p className="mt-1 text-xs font-medium text-muted-foreground">Picked</p>}
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs">
                {tierLabels[team.pickTier]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Metric label="EPA" value={fmt(team.epa)} />
              <Metric label="xP" value={fmt(team.xp)} />
              <Metric label="Avg RP" value={fmt(team.averageRp)} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3 text-xs">
              {[["Pit", team.pitScouted ? "Scouted" : "Not scouted"], ["Reports", String(team.matchReportCount)], ["Driver", String(team.averageDriverRating)], ["Teleop fuel", String(team.averageTeleopFuel)]].map(([label, value]) => <div key={label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
            </dl>
          </button>
        ))}
      </div>
      <TeamDetailDialog
        eventId={activeEvent._id}
        xpScope={xpScope}
        teamNumber={selectedTeam}
        onOpenChange={(open) => {
          if (!open) setSelectedTeam(null)
        }}
      />
    </section>
  )
}

export function TeamDetailDialog({
  eventId,
  xpScope,
  teamNumber,
  onOpenChange,
}: {
  eventId: Id<"events">
  xpScope?: XpScope
  teamNumber: number | null
  onOpenChange: (open: boolean) => void
}) {
  const detail = useQuery(
    api.teams.detail,
    teamNumber === null ? "skip" : { eventId, teamNumber, xpScope },
  )
  const setPicked = useMutation(api.teams.setPicked)
  const removePitReport = useMutation(api.pit.remove)
  const removeMatchReport = useMutation(api.matchScouting.removeReport)
  const me = useQuery(api.members.me)
  const [savingPicked, setSavingPicked] = useState(false)

  async function togglePicked() {
    if (!detail || teamNumber === null) return
    setSavingPicked(true)
    try {
      await setPicked({ eventId, teamNumber, picked: !detail.picked })
    } catch {
      toast.error("Could not update picked status. Please try again.")
    } finally { setSavingPicked(false) }
  }

  return (
    <Dialog open={teamNumber !== null} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {detail && <TeamAvatar teamNumber={detail.team.teamNumber} />}
            {detail?.team.eventTeamAlias ?? detail?.team.teamNumber ?? teamNumber} {detail?.team.nickname ?? ""}
          </DialogTitle>
          <DialogDescription>
            {[detail?.team.city, detail?.team.stateProv, detail?.team.country]
              .filter(Boolean)
              .join(", ") || "Team detail"}
          </DialogDescription>
        </DialogHeader>
        {detail === undefined ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : detail === null ? (
          <p className="text-sm text-muted-foreground">This team is not available in this event.</p>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <p className={`text-sm font-medium ${detail.picked ? "line-through text-muted-foreground" : ""}`}>
                {detail.picked ? "Picked · unavailable for selection" : "Available for selection"}
              </p>
              {me?.role === "admin" && <Button type="button" variant="outline" size="sm" disabled={savingPicked} onClick={() => void togglePicked()}>
                {savingPicked ? "Saving…" : detail.picked ? "Undo picked" : "Mark as picked"}
              </Button>}
              <p className="basis-full text-xs text-muted-foreground">Picked status is shared across this event's pick lists.</p>
            </div>
            <div className="grid gap-2">
              <h2 className="font-medium">Breakdown history</h2>
              {[...new Set([
                ...detail.matchReports.filter(report => report.tags.includes("Broke down")).map(report => report.matchNumber),
                ...detail.breakdownFollowUps.map(report => report.matchNumber),
              ])].sort((a, b) => b - a).map(matchNumber => {
                const followUp = detail.breakdownFollowUps.find(report => report.matchNumber === matchNumber)
                const reports = detail.matchReports.filter(report => report.matchNumber === matchNumber && report.tags.includes("Broke down"))
                return (
                  <div key={matchNumber} className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <p className="font-medium">QM{matchNumber} · {followUp ? "Pit follow-up recorded" : "Awaiting pit follow-up"}</p>
                    {followUp ? (
                      <>
                        <p className="whitespace-pre-wrap break-words"><span className="font-medium">What broke:</span> {followUp.whatBroke}</p>
                        <p className="whitespace-pre-wrap break-words"><span className="font-medium">Cause:</span> {followUp.cause || "Not recorded"}</p>
                        <p className="whitespace-pre-wrap break-words"><span className="font-medium">Repair status:</span> {followUp.repairStatus}</p>
                        {followUp.notes && <p className="whitespace-pre-wrap break-words"><span className="font-medium">Notes:</span> {followUp.notes}</p>}
                        <p className="text-xs text-muted-foreground">Recorded by {followUp.scoutName}</p>
                      </>
                    ) : <p className="text-muted-foreground">No repair information yet. Ask the team at their pit.</p>}
                    {reports.map(report => (
                      <p key={report._id} className="whitespace-pre-wrap break-words text-muted-foreground">
                        {[report.autoNotes, report.teleopNotes, report.endgameNotes].filter(Boolean).join(" · ") || "Match scout reported a breakdown without notes."}
                      </p>
                    ))}
                  </div>
                )
              })}
              {!detail.matchReports.some(report => report.tags.includes("Broke down")) && detail.breakdownFollowUps.length === 0 && <p className="text-sm text-muted-foreground">No breakdowns reported at this event.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Avg Auto Cycles" value={String(detail.averages.autoCycles ?? "—")} />
              <Metric label="Avg Shift 1 Cycles" value={String(detail.averages.shift1Cycles ?? "—")} />
              <Metric label="Avg Shift 2 Cycles" value={String(detail.averages.shift2Cycles ?? "—")} />
              <Metric label="Avg Shift 3 Cycles" value={String(detail.averages.shift3Cycles ?? "—")} />
              <Metric label="Avg Endgame Cycles" value={String(detail.averages.endgameCycles ?? "—")} />
              <Metric
                label="Auto Hub Win"
                value={`${Math.round(detail.averages.autoHubWinRate * 100)}%`}
              />
              <Metric label="Auto Climb Avg" value={String(detail.averages.autoClimb)} />
              <Metric
                label="Endgame Climb Avg"
                value={String(detail.averages.endgameClimb)}
              />
              <Metric label="Driver Avg" value={String(detail.averages.driverRating)} />
            </div>
            <Separator />
            <div className="grid gap-2">
              <h2 className="font-medium">External stats</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="OPR" value={fmt(detail.stats?.opr)} />
                <Metric label="DPR" value={fmt(detail.stats?.dpr)} />
                <Metric label="CCWM" value={fmt(detail.stats?.ccwm)} />
                <Metric label="EPA" value={fmt(detail.stats?.epa)} />
                <Metric label="xP" value={fmt(detail.stats?.xp)} />
                <Metric label="Match13 EPA" value={fmt(detail.stats?.match13Epa)} />
                <Metric label="Auto xP" value={fmt(detail.stats?.autoXp)} />
                <Metric label="Teleop xP" value={fmt(detail.stats?.teleopXp)} />
                <Metric label="Endgame xP" value={fmt(detail.stats?.endgameXp)} />
                <Metric label="RP1 probability" value={percent(detail.stats?.predictedRp1)} />
                <Metric label="RP2 probability" value={percent(detail.stats?.predictedRp2)} />
                <Metric label="RP3 probability" value={percent(detail.stats?.predictedRp3)} />
                <Metric label="Record" value={`${detail.stats?.wins ?? 0}-${detail.stats?.losses ?? 0}-${detail.stats?.ties ?? 0}`} />
                <Metric label="Avg RP" value={fmt(detail.stats?.averageRp)} />
                <Metric label="Auto EPA" value={fmt(detail.stats?.autoEpa)} />
                <Metric label="Teleop EPA" value={fmt(detail.stats?.teleopEpa)} />
                <Metric label="Endgame EPA" value={fmt(detail.stats?.endgameEpa)} />
              </div>
            </div>
            <Separator />
            <div className="grid gap-2">
              <h2 className="font-medium">Pit scouting</h2>
              {detail.pitReports.length ? (
                detail.pitReports.map((report) => (
                  <div key={report._id} className="rounded-lg bg-muted p-3 text-sm">
                    {me?.role === "admin" && <DeleteReportControl
                      label={`pit report for team ${detail.team.eventTeamAlias ?? teamNumber}`}
                      onDelete={() => removePitReport({ reportId: report._id })}
                    />}
                    {!!report.photoIds?.length && <PitPhotos photoIds={report.photoIds} />}
                    <p>
                      Fuel hub: {report.canScoreFuelHub ? "yes" : "no"} · Preload:{" "}
                      {report.preloadCount}
                    </p>
                    <p>
                      Climb L1/L2/L3: {report.canClimbLevel1 ? "Y" : "N"}/
                      {report.canClimbLevel2 ? "Y" : "N"}/
                      {report.canClimbLevel3 ? "Y" : "N"}
                    </p>
                    <p className="text-muted-foreground">{report.notes || "No notes"}</p>
                    <p>Intakes from Outpost: {report.canIntakeOutpost === undefined ? "Not recorded" : report.canIntakeOutpost ? "Yes" : "No"}</p>
                    <p>Electrical quality: {report.electricalQuality === undefined ? "Not recorded" : `${report.electricalQuality}/10`}</p>
                    <p>Build quality: {report.buildQuality === undefined ? "Not recorded" : `${report.buildQuality}/10`}</p>
                    <p>Programming language: {report.programmingLanguage || "Not recorded"}</p>
                    {report.drivetrain && <p>Drivetrain: {report.drivetrain}</p>}
                    {report.drivetrain.toLowerCase().includes("swerve") && report.swerveType && <p>Swerve: {report.swerveType}</p>}
                    {report.drivetrain.toLowerCase().includes("swerve") && report.tread && <p>Tread: {report.tread}</p>}
                    {report.motorBrand && <p>Motors: {report.motorBrand}</p>}
                    {report.robotArchitecture && <p>Architecture: {report.robotArchitecture}</p>}
                    {report.allianceRole && <p>Alliance role: {report.allianceRole}</p>}
                    {report.autoDescription && <p className="whitespace-pre-wrap break-words">Auto: {report.autoDescription}</p>}
                    {report.autoScore !== undefined && <p>Auto scoring (fuel): {report.autoScore}</p>}
                    {report.teleopScore !== undefined && <p>Teleop scoring (fuel): {report.teleopScore}</p>}
                    {report.cyclesPerShift !== undefined && <p>Cycles per shift: {report.cyclesPerShift}</p>}
                    {!!report.autoPath?.length && <AutoPath value={report.autoPath} readOnly />}
                    {report.bps !== undefined && <p>BPS: {report.bps}</p>}
                    {pitMeasurements.map(([key, label]) => report[key] !== undefined ? <p key={key}>{label}: {report[key]}</p> : null)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No pit reports yet.</p>
              )}
            </div>
            <div className="grid gap-2">
              <h2 className="font-medium">Match reports</h2>
              {detail.matchReports.length ? (
                detail.matchReports.map((report) => (
                  <div key={report._id} className="rounded-lg border p-3 text-sm">
                    {me?.role === "admin" && <DeleteReportControl
                      label={`QM${report.matchNumber} report for team ${detail.team.eventTeamAlias ?? teamNumber}`}
                      onDelete={() => removeMatchReport({ reportId: report._id })}
                    />}
                    <p className="font-medium">QM{report.matchNumber}</p>
                    <p>
                      {report.autoCycles !== undefined
                        ? `Auto ${report.autoCycles} cycles, ${report.shift1Cycles !== undefined ? `Shift 1: ${report.shift1Cycles}, Shift 2: ${report.shift2Cycles}, Shift 3: ${report.shift3Cycles}` : `Legacy cycles per shift: ${report.teleopCyclesPerShift}`}, Endgame ${report.endgameCycles} cycles · Climb `
                        : `Legacy fuel counts: Auto ${report.autoFuel}, Teleop ${report.teleopFuel} · Climb `}
                      {climbLabels[report.endgameClimb]}
                    </p>
                    <p>Driver {report.driverRating}/10 · Defense {report.defenseRating}/10</p>
                    {(report.wonAuto !== undefined || report.wonMatch !== undefined || report.totalMatchPoints !== undefined) && <p>
                      Auto win: {report.wonAuto === undefined ? "Unknown" : report.wonAuto ? "Yes" : "No"} · Match win: {report.wonMatch === undefined ? "Unknown" : report.wonMatch ? "Yes" : "No"} · Alliance points: {report.totalMatchPoints ?? "Unknown"}
                    </p>}
                    {report.offShiftActivity && <p className="whitespace-pre-wrap break-words">Off-shift: {report.offShiftActivity}</p>}
                    {report.transitionActivity && <p className="whitespace-pre-wrap break-words">Transition: {report.transitionActivity}</p>}
                    {!!report.tags.length && <p className="mt-1 text-muted-foreground">{report.tags.join(" · ")}</p>}
                    {report.autoNotes && <p className="whitespace-pre-wrap break-words">Auto: {report.autoNotes}</p>}
                    {!!report.autoPath?.length && <div className="mt-3 grid gap-2"><p className="font-medium">Observed auto path</p><AutoPath value={report.autoPath} readOnly /></div>}
                    {report.teleopNotes && <p className="whitespace-pre-wrap break-words">Teleop: {report.teleopNotes}</p>}
                    {report.endgameNotes && <p className="whitespace-pre-wrap break-words">Endgame: {report.endgameNotes}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No match reports yet.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const teamSortOptions: { label: string; value: TeamSort }[] = [
  { label: "Team #", value: "teamNumber" },
  { label: "EPA", value: "epa" },
  { label: "xP", value: "xp" },
  { label: "RP", value: "averageRp" },
]

const sortDirectionOptions: { label: string; value: SortDirection }[] = [
  { label: "Low to high", value: "asc" },
  { label: "High to low", value: "desc" },
]

function sortTeams(
  a: { teamNumber: number; epa?: number; averageRp?: number; xp?: number },
  b: { teamNumber: number; epa?: number; averageRp?: number; xp?: number },
  sortBy: TeamSort,
  direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1
  if (sortBy === "teamNumber") return (a.teamNumber - b.teamNumber) * multiplier
  const aValue = a[sortBy]
  const bValue = b[sortBy]
  if (aValue === undefined && bValue === undefined) {
    return (a.teamNumber - b.teamNumber) * multiplier
  }
  if (aValue === undefined) return 1
  if (bValue === undefined) return -1
  return (aValue - bValue) * multiplier || (a.teamNumber - b.teamNumber)
}

function DeleteReportControl({ label, onDelete }: { label: string; onDelete: () => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    if (deleting) return
    setDeleting(true)
    try {
      await onDelete()
      toast.success("Scouting report deleted")
    } catch {
      toast.error("Could not delete report. Check your admin access and try again.")
      setDeleting(false)
    }
  }

  return confirming ? (
    <div role="alert" className="mb-3 grid gap-2 rounded-lg border border-destructive/30 p-3">
      <p>Delete this {label}? This cannot be undone. Other reports and official match results are kept.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-10" disabled={deleting} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button type="button" variant="destructive" className="min-h-10" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting…" : "Confirm delete"}</Button>
      </div>
    </div>
  ) : (
    <div className="mb-2 flex justify-end">
      <Button type="button" variant="destructive" size="sm" className="min-h-10" aria-label={`Delete ${label}`} onClick={() => setConfirming(true)}>
        <Trash2 /> Delete report
      </Button>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function fmt(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "n/a"
}

function percent(value: number | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a"
}

function EmptyEvent() {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h1 className="text-xl font-semibold">No event yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask an admin to import an event from Event Setup.
      </p>
    </section>
  )
}
