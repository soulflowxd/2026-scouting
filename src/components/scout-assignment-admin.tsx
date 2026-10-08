import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ScoutAssignmentAdmin({ eventId }: { eventId: Id<"events"> }) {
  const data = useQuery(api.scoutAssignments.adminList, { eventId })
  const generate = useMutation(api.scoutAssignments.generate)
  const assign = useMutation(api.scoutAssignments.assignTeam)
  const enable = useMutation(api.scoutAssignments.setEnabled)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  if (!data) return <p className="text-sm text-muted-foreground">Loading scouting assignments…</p>
  const unassigned = data.teams.length - data.assignments.length
  return <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Match scouting assignments">
    <div className="grid gap-1"><h2 className="font-semibold">Match scouting assignments</h2>
      <p className="text-sm text-muted-foreground">Team groups are balanced across the included scouts—no fixed team limit. When their teams overlap, that match is randomized so each scout watches one robot. Free scouts cover the remaining robots.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={busy || !data.participants.length} onClick={async () => {
        if (data.assignments.length && !window.confirm("Replace the regular team groups with new randomized assignments? Active claims and handoffs will stay unchanged.")) return
        setBusy(true)
        try {
          const result = await generate({ eventId })
          toast.success(`${result.assigned} teams assigned · ${result.unassigned} unassigned`)
          if (!result.hasSchedule) toast.info("No match schedule yet. Match assignments will appear automatically when the schedule is imported.")
        } catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not generate assignments") }
        finally { setBusy(false) }
      }}>Randomize assignments</Button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={async event => {
        setBusy(true)
        try { await enable({ eventId, enabled: event.target.checked }) }
        catch { toast.error("Could not change assignment mode") }
        finally { setBusy(false) }
      }} />Use match assignments</label>
    </div>
    <p className="text-xs text-muted-foreground">{data.participants.length} scouts included · {data.participants.length ? `${Math.floor(data.teams.length / data.participants.length)}–${Math.ceil(data.teams.length / data.participants.length)} regular teams each when randomized` : "Choose participating scouts below"} · {unassigned} teams without a regular scout. Active claims and confirmed substitutes remain valid.</p>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Edit team assignments</summary>
      <Input className="my-3" placeholder="Search teams" aria-label="Search assignment teams" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="grid max-h-96 gap-2 overflow-y-auto">
        {data.teams.filter(team => `${team.teamNumber} ${team.eventTeamAlias || ""} ${team.nickname}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.teamNumber - b.teamNumber).map(team => <label key={team._id} className="grid gap-1 border-b py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)] sm:items-center">
          <span className="truncate">{team.eventTeamAlias || team.teamNumber} · {team.nickname}</span>
          <select className="min-h-10 min-w-0 rounded-md border bg-background px-2" aria-label={`Scout for ${team.eventTeamAlias || team.teamNumber}`} disabled={busy} value={data.assignments.find(row => row.teamNumber === team.teamNumber)?.memberId || ""} onChange={async event => {
            const memberId = event.target.value as Id<"members">
            setBusy(true)
            try { await assign({ eventId, teamNumber: team.teamNumber, memberId: memberId || null }) }
            catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not change assignment") }
            finally { setBusy(false) }
          }}>
            <option value="">Unassigned</option>
            {data.members.filter(member => data.participants.includes(member._id)).map(member => <option key={member._id} value={member._id}>{member.name} ({data.assignments.filter(row => row.memberId === member._id).length} teams)</option>)}
          </select>
        </label>)}
      </div>
    </details>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">View match assignments</summary>
      <p className="my-2 text-xs text-muted-foreground">Regular scouts are preferred. Conflicts and spare-scout coverage are randomized per match, and stay consistent on every device.</p>
      <div className="grid max-h-96 gap-3 overflow-y-auto">
        {data.matchAssignments.sort((a, b) => a.matchNumber - b.matchNumber).map(match => <div key={match.matchNumber} className="grid gap-1 border-b pb-2 text-sm">
          <p className="font-medium">QM{match.matchNumber}{match.uncovered > 0 && <span className="ml-2 text-amber-600 dark:text-amber-300">{match.uncovered} uncovered</span>}</p>
          {match.slots.map(slot => <p key={slot.teamNumber} className="text-muted-foreground">{data.teams.find(team => team.teamNumber === slot.teamNumber)?.eventTeamAlias || slot.teamNumber} · {data.members.find(member => member._id === slot.scout)?.name || "Scout"}</p>)}
        </div>)}
        {!data.matchAssignments.length && <p className="text-sm text-muted-foreground">Waiting for the event’s match schedule.</p>}
      </div>
    </details>
  </section>
}
