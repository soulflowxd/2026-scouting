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
  const setMode = useMutation(api.scoutAssignments.setMode)
  const assignStation = useMutation(api.scoutAssignments.assignStation)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  if (!data) return <p className="text-sm text-muted-foreground">Loading scouting assignments…</p>
  const unassigned = data.teams.length - data.assignments.length
  return <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Match scouting assignments">
    <div className="grid gap-1"><h2 className="font-semibold">Match scouting assignments</h2>
      <p className="text-sm text-muted-foreground">Use automatic team assignments or assign scouts to driver stations manually. Each scout watches one robot per match; handoffs preserve earlier responsibility.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {data.mode === "automatic" && <Button disabled={busy || !data.participants.length} onClick={async () => {
        if (data.assignments.length && !window.confirm("Replace the regular team groups with new randomized assignments? Earlier match responsibility will stay unchanged.")) return
        setBusy(true)
        try {
          const result = await generate({ eventId })
          toast.success(`${result.assigned} teams assigned · ${result.unassigned} unassigned`)
          if (!result.hasSchedule) toast.info("No match schedule yet. Match assignments will appear automatically when the schedule is imported.")
        } catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not generate assignments") }
        finally { setBusy(false) }
      }}>Randomize assignments</Button>}
      <label className="grid gap-1 text-sm">Assignment mode
        <select aria-label="Assignment mode" className="min-h-11 rounded-md border bg-background px-3" value={data.mode} disabled={busy} onChange={async event => {
          setBusy(true)
          try { await setMode({ eventId, mode: event.target.value as "automatic" | "manual" }) }
          catch { toast.error("Could not change assignment mode") }
          finally { setBusy(false) }
        }}><option value="automatic">Automatic · Randomized teams</option><option value="manual">Manual · Driver stations</option></select>
      </label>
    </div>
    <p className="text-xs text-muted-foreground">{data.participants.length} scouts included · {data.mode === "manual" ? `${data.stations.length}/6 driver stations assigned` : data.participants.length ? `${Math.floor(data.teams.length / data.participants.length)}–${Math.ceil(data.teams.length / data.participants.length)} regular teams each when randomized` : "Choose participating scouts below"} · {unassigned} teams without a regular / pit scout. Past match responsibility and handoff history are preserved.</p>
    {data.mode === "manual" && <div className="grid gap-3 sm:grid-cols-2" aria-label="Driver station assignments">
      {(["Red", "Blue"] as const).map(alliance => <fieldset key={alliance} className="grid min-w-0 gap-3">
        <legend className={`mb-2 text-sm font-semibold ${alliance === "Red" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"}`}>{alliance} alliance</legend>
        {([1, 2, 3] as const).map(position => {
          const station = `${alliance}${position}` as "Red1" | "Red2" | "Red3" | "Blue1" | "Blue2" | "Blue3"
          return <label key={station} className="grid gap-1 text-sm">
        <span>{alliance} {position}</span>
        <select aria-label={`Scout for ${station}`} className="min-h-11 min-w-0 rounded-md border bg-background px-3" disabled={busy} value={data.stations.find(slot => slot.station === station)?.memberId || ""} onChange={async event => {
          setBusy(true)
          try { await assignStation({ eventId, station, memberId: event.target.value as Id<"members"> || null }) }
          catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not assign driver station") }
          finally { setBusy(false) }
        }}><option value="">Unassigned</option>{data.members.filter(member => data.participants.includes(member._id)).map(member => <option key={member._id} value={member._id}>{member.name}</option>)}</select>
      </label>})}
      </fieldset>)}
      <p className="text-xs text-muted-foreground sm:col-span-2">Driver stations apply to future matches. Past match responsibility stays unchanged. Unassigned stations remain visible as coverage gaps.</p>
    </div>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Edit regular / pit team assignments</summary>
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
      <p className="my-2 text-xs text-muted-foreground">Automatic mode uses consistent randomized coverage. Manual mode follows the six driver stations. Earlier matches retain their recorded scouts.</p>
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
