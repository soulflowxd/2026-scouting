import { useQuery } from "convex/react"
import { Search } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { climbLabels, tierLabels } from "@/lib/labels"

type TeamSort = "teamNumber" | "epa" | "averageRp"
type SortDirection = "asc" | "desc"

export function TeamsRoute() {
  const { activeEvent } = useActiveEvent()
  const teams = useQuery(
    api.teams.list,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [search, setSearch] = useState("")
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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teams"
            className="pl-9"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Sort</span>
        {teamSortOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={sortBy === option.value ? "default" : "outline"}
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
            className="grid gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-semibold">{team.teamNumber}</p>
                <p className="text-sm text-muted-foreground">{team.nickname}</p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs">
                {tierLabels[team.pickTier]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Metric label="EPA" value={fmt(team.epa)} />
              <Metric label="Avg RP" value={fmt(team.averageRp)} />
              <Metric label="Pit" value={team.pitScouted ? "Scouted" : "Not scouted"} />
              <Metric label="Reports" value={String(team.matchReportCount)} />
              <Metric label="Driver" value={String(team.averageDriverRating)} />
              <Metric label="Teleop Fuel" value={String(team.averageTeleopFuel)} />
            </div>
          </button>
        ))}
      </div>
      <TeamDetailDialog
        eventId={activeEvent._id}
        teamNumber={selectedTeam}
        onOpenChange={(open) => {
          if (!open) setSelectedTeam(null)
        }}
      />
    </section>
  )
}

function TeamDetailDialog({
  eventId,
  teamNumber,
  onOpenChange,
}: {
  eventId: Id<"events">
  teamNumber: number | null
  onOpenChange: (open: boolean) => void
}) {
  const detail = useQuery(
    api.teams.detail,
    teamNumber === null ? "skip" : { eventId, teamNumber },
  )

  return (
    <Dialog open={teamNumber !== null} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {detail?.team.teamNumber ?? teamNumber} {detail?.team.nickname ?? ""}
          </DialogTitle>
          <DialogDescription>
            {[detail?.team.city, detail?.team.stateProv, detail?.team.country]
              .filter(Boolean)
              .join(", ") || "Team detail"}
          </DialogDescription>
        </DialogHeader>
        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Avg Auto Fuel" value={String(detail.averages.autoFuel)} />
              <Metric label="Avg Teleop Fuel" value={String(detail.averages.teleopFuel)} />
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
                    <p className="font-medium">QM{report.matchNumber}</p>
                    <p>
                      Auto {report.autoFuel}, Teleop {report.teleopFuel}, Endgame{" "}
                      {climbLabels[report.endgameClimb]}
                    </p>
                    <p>Driver {report.driverRating}/10 · Defense {report.defenseRating}/10</p>
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
  { label: "RP", value: "averageRp" },
]

const sortDirectionOptions: { label: string; value: SortDirection }[] = [
  { label: "Low to high", value: "asc" },
  { label: "High to low", value: "desc" },
]

function sortTeams(
  a: { teamNumber: number; epa?: number; averageRp?: number },
  b: { teamNumber: number; epa?: number; averageRp?: number },
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
