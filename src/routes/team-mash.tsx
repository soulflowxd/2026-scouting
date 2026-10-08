import { useAction, useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"
import { Shuffle, Trophy, Undo2 } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { TeamDetailDialog } from "@/routes/teams"
import { TeamAvatar } from "@/components/team-avatar"

import { ratings, topPercent } from "@/lib/mash-ratings"
import { hasMashEvidence, nextPair, seededRandom } from "@/lib/mash-pairing"
type Team = { teamNumber: number; nickname: string; eventTeamAlias?: string; avatar?: string; epa?: number; xp?: number; averageRp?: number }

export function TeamMashRoute() {
  const { activeEvent } = useActiveEvent()
  const me = useQuery(api.members.me)
  if (!activeEvent || !me) return <p className="p-5 text-muted-foreground">Select an event to start Team Mash.</p>
  return <MashGame key={`${activeEvent._id}:${me.tokenIdentifier}`} eventId={activeEvent._id} eventName={eventLabel(activeEvent)} year={Number(activeEvent.eventKey.slice(0, 4))} minimumTeams={10} />
}

function MashGame({ eventId, eventName, year, minimumTeams }: { eventId: Id<"events">; eventName: string; year: number; minimumTeams: number }) {
  const [scope, setScope] = useState<"season" | "all">("season")
  const teams = useQuery(api.teams.list, { eventId, xpScope: scope })
  const sharedVotes = useQuery(api.mash.list, { eventId })
  const votes = sharedVotes ?? []
  const submitVote = useMutation(api.mash.vote)
  const undoVote = useMutation(api.mash.undo)
  const [saving, setSaving] = useState(false)
  const [filterMetric, setFilterMetric] = useState<"epa" | "elo">("epa")
  const [percent, setPercent] = useState(100)
  const [pair, setPair] = useState<[number, number] | null>(null)
  const [openingSeed] = useState(() => Math.floor(Math.random() * 4294967296))
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [saveError, setSaveError] = useState(false)
  const scoreMap = ratings(votes)
  const informedTeams = (teams ?? []).filter(hasMashEvidence)
  const skippedCount = (teams?.length ?? 0) - informedTeams.length
  const eligible = topPercent(informedTeams, percent, team => filterMetric === "epa" ? team.epa : scoreMap.get(team.teamNumber)?.score, minimumTeams)
  const current = pair && pair.every(number => eligible.some(team => team.teamNumber === number)) ? pair : nextPair(eligible, votes, undefined, seededRandom(openingSeed))

  async function choose(winner: number | null) {
    if (!current || !teams || !sharedVotes || saving || votes.length >= 5000) return
    setSaving(true)
    try {
      await submitVote({ eventId, left: current[0], right: current[1], winner })
      const next = [...votes, { left: current[0], right: current[1], winner }]
      const nextScores = ratings(next)
      setPair(nextPair(topPercent(informedTeams, percent, team => filterMetric === "epa" ? team.epa : nextScores.get(team.teamNumber)?.score, minimumTeams), next, current))
      setSaveError(false)
    } catch { setSaveError(true) } finally { setSaving(false) }
  }
  const lastMine = [...votes].reverse().find(vote => vote.mine)

  return <section className="mx-auto grid w-full max-w-6xl gap-6 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Head-to-head scouting</p><h1 className="mt-1 text-3xl font-semibold">Rank Teams</h1><p className="mt-2 text-sm text-muted-foreground">Which robot would you pick? Compare the evidence, then choose.</p><p className="mt-1 text-xs text-muted-foreground">{eventName}</p></div>
      <div className="rounded-xl border bg-card px-4 py-3"><p className="text-2xl font-semibold tabular-nums">{votes.length}</p><p className="text-xs text-muted-foreground">comparisons made</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm">xP scope<select className="rounded-md border bg-background px-3 py-2" value={scope} onChange={event => setScope(event.target.value as "season" | "all")}><option value="season">In-season</option><option value="all">All / offseason</option></select></label>
      <p className="text-xs text-muted-foreground">Shared votes from all scouts · synced across devices · does not reorder pick lists</p>
    </div>
    {saveError && <p role="alert" className="text-sm text-destructive">Could not save the change. Please try again.</p>}
    {skippedCount > 0 && <p className="text-xs text-muted-foreground">Skipping {skippedCount} teams with no stats or scouting reports. They’ll be included when information becomes available.</p>}
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <label className="grid gap-1 text-xs">Filter matchups by<select value={filterMetric} className="rounded-md border bg-background p-2 text-sm" onChange={event => { setFilterMetric(event.target.value as "epa" | "elo"); setPair(null) }}><option value="epa">EPA</option><option value="elo">Shared Mash Elo</option></select></label>
      <label className="grid w-full gap-2 text-xs sm:w-60">
        <span className="flex items-center justify-between gap-3"><span>Include</span><span className="font-medium tabular-nums">{percent === 100 ? "All teams · 100%" : `Top ${percent}%`}</span></span>
        <input type="range" min={1} max={100} step={1} value={percent} aria-label="Percentage of top teams to include" aria-valuetext={percent === 100 ? "All teams, 100 percent" : `Top ${percent} percent`} className="h-6 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onChange={event => { setPercent(Number(event.target.value)); setPair(null) }} />
        <span className="flex justify-between text-muted-foreground"><span>Top 1%</span><span>All teams</span></span>
      </label>
      <p className="text-xs text-muted-foreground">{eligible.length} eligible teams. Keeps at least {minimumTeams} teams with known scores, or all available if fewer. Cutoff ties are included. Elo filters exclude unranked teams.</p>
    </div>
    {teams === undefined || sharedVotes === undefined ? <p>Loading teams and shared rankings…</p> : !current ? <p className="rounded-xl border p-6">Fewer than two teams match this filter. Choose a larger percentage or All teams to build more Elo ratings.</p> : <>
      <div className="grid gap-4 md:grid-cols-2">
        {current.map((number, index) => {
          const team = teams.find(team => team.teamNumber === number)
          return team && <RobotCard key={number} team={team} eventId={eventId} year={year} side={index === 0 ? "A" : "B"} onChoose={() => void choose(number)} onDetails={() => setSelectedTeam(number)} disabled={saving || votes.length >= 5000} />
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => void choose(null)} disabled={saving || votes.length >= 5000}>Equally good · tie</Button>
        <Button variant="ghost" onClick={() => setPair(nextPair(eligible, votes, current))}><Shuffle className="size-4" />Skip matchup</Button>
        <Button variant="ghost" disabled={!lastMine || saving} onClick={async () => { if (!lastMine) return; setSaving(true); try { await undoVote({ voteId: lastMine._id }); setPair([lastMine.left, lastMine.right]); setSaveError(false) } catch { setSaveError(true) } finally { setSaving(false) } }}><Undo2 className="size-4" />Undo my last vote</Button>
      </div>
    </>}
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5" />Shared Elo ranking</h2>
      <p className="mt-1 text-xs text-muted-foreground">Everyone sees the same ranking for this event. Elo starts at 1500 and changes with all scouts’ votes. Uncompared teams are unranked; early rankings are provisional. Previous device-only votes are not included.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="p-2">Rank</th><th className="p-2">Team</th><th className="p-2">Elo</th><th className="p-2">Votes</th><th className="p-2">Wins</th></tr></thead><tbody>
        {[...(teams ?? [])].filter(team => scoreMap.has(team.teamNumber)).sort((a, b) => scoreMap.get(b.teamNumber)!.score - scoreMap.get(a.teamNumber)!.score || a.teamNumber - b.teamNumber).map((team, index) => {
          const rating = scoreMap.get(team.teamNumber)!
          return <tr key={team.teamNumber} className="border-b last:border-0"><td className="p-2 text-muted-foreground">{index + 1}</td><td className="p-2"><button className="text-left hover:underline" onClick={() => setSelectedTeam(team.teamNumber)}>{team.eventTeamAlias ?? team.teamNumber} <span className="text-muted-foreground">{team.nickname}</span></button></td><td className="p-2 font-semibold tabular-nums">{Math.round(rating.score)}</td><td className="p-2">{rating.games}</td><td className="p-2">{rating.wins}</td></tr>
        })}
      </tbody></table></div>
      {!votes.length && <p className="py-6 text-center text-sm text-muted-foreground">Choose your first robot to start your ranking.</p>}
      {votes.length >= 5000 && <p className="mt-3 text-sm">This ranking has reached its 5,000-comparison limit.</p>}
    </section>
    <TeamDetailDialog eventId={eventId} teamNumber={selectedTeam} xpScope={scope} onOpenChange={open => { if (!open) setSelectedTeam(null) }} />
  </section>
}

function RobotCard({ team, eventId, year, side, onChoose, onDetails, disabled }: { team: Team; eventId: Id<"events">; year: number; side: string; onChoose: () => void; onDetails: () => void; disabled: boolean }) {
  const detail = useQuery(api.teams.detail, { eventId, teamNumber: team.teamNumber })
  const reports = detail?.matchReports
  const scoutedMatches = reports ? new Set(reports.map(report => report.matchNumber)).size : undefined
  const breakdowns = reports ? new Set(reports.filter(report => report.tags.includes("Broke down")).map(report => report.matchNumber)).size : undefined
  const stats = detail?.stats
  const played = stats?.wins !== undefined && stats.losses !== undefined && stats.ties !== undefined ? stats.wins + stats.losses + stats.ties : undefined
  function quality(key: "electricalQuality" | "buildQuality") {
    const values = detail?.pitReports.flatMap(report => report[key] === undefined ? [] : [report[key]!]) ?? []
    return values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)} / 10 (${values.length} report${values.length === 1 ? "" : "s"})` : "Unknown"
  }
  const format = (value?: number) => value === undefined ? "Unknown" : value.toFixed(1)
  return <article className="grid content-start gap-3 rounded-xl border bg-card p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">ROBOT {side}</p><div className="mt-2 flex items-center gap-3"><TeamAvatar teamNumber={team.teamNumber} year={year} avatar={team.avatar} /><h2 className="text-4xl font-semibold tabular-nums">{team.eventTeamAlias ?? team.teamNumber}</h2></div><p className="mt-2 text-muted-foreground">{team.nickname}</p></div><Button size="sm" variant="outline" onClick={onDetails}>Team info</Button></div>
    <Button className="w-full" onClick={onChoose} disabled={disabled || detail === undefined}>Pick {team.eventTeamAlias ?? team.teamNumber}</Button>
    <dl className="grid grid-cols-3 gap-2">{[["EPA", format(team.epa)], ["xP", format(team.xp)], ["RP", format(team.averageRp)]].map(([label, value]) => <div key={label} className="rounded-md bg-muted/60 px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>)}</dl>
    <RobotPhotos eventId={eventId} teamNumber={team.teamNumber} year={year} photoIds={[...new Set([...(detail?.pitReports ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).flatMap(report => report.photoIds ?? []))].slice(0, 6)} />
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">{[["Matches played (event)", played ?? "Unknown"], ["Matches scouted", scoutedMatches ?? "Loading…"], ["Breakdowns", breakdowns === undefined ? "Loading…" : `${breakdowns} / ${scoutedMatches} scouted`], ["Electrical quality", quality("electricalQuality")], ["Build quality", quality("buildQuality")]].map(([label, value]) => <div key={label} className="border-t pt-2" title={label === "Breakdowns" ? "Unique scouted matches, not duplicate reports. Unscouted matches may have unreported failures." : undefined}><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium tabular-nums">{value}</dd></div>)}</dl>
  </article>
}

function RobotPhotos({ eventId, teamNumber, photoIds, year }: { eventId: Id<"events">; teamNumber: number; photoIds: Id<"_storage">[]; year: number }) {
  const fetchPhotos = useAction(api.imports.robotPhotos)
  const photos = useQuery(api.pit.photoUrls, photoIds.length ? { photoIds } : "skip")
  const [selected, setSelected] = useState<string | null>(null)
  const [external, setExternal] = useState<{ id: string; url: string }[]>([])
  const [source, setSource] = useState<"all" | "ours" | "tba">("all")
  const [mediaStatus, setMediaStatus] = useState("Loading TBA photos…")
  useEffect(() => {
    const controller = new AbortController()
    const load = import.meta.env.DEV ? fetch(`/__local/team-photos/${teamNumber}/${year}`, { signal: controller.signal }).then(async result => {
      if (!result.ok) throw new Error("Unavailable")
      return await result.json() as { photos: { id: string; url: string }[] }
    }) : fetchPhotos({ eventId, teamNumber })
    void load.then(data => {
      if (controller.signal.aborted) return
      setExternal(data.photos)
      setMediaStatus(data.photos.length ? "" : `No TBA robot photos for ${year}.`)
    }).catch(() => { if (!controller.signal.aborted) setMediaStatus("TBA photos unavailable. Pit uploads still work.") })
    return () => controller.abort()
  }, [eventId, fetchPhotos, teamNumber, year])
  const [failed, setFailed] = useState<string[]>([])
  const available = [...(source === "tba" ? [] : (photos ?? []).map(photo => ({ ...photo, source: "Our pit scouting" }))), ...(source === "ours" ? [] : external.map(photo => ({ ...photo, source: "The Blue Alliance" })))].filter(photo => photo.url && !failed.includes(photo.id))
  const active = available.find(photo => photo.id === selected) ?? available[0]
  return <div className="grid gap-2">
    <div className="flex flex-wrap gap-2">{([['all', 'All photos'], ['ours', 'Our photos'], ['tba', 'TBA photos']] as const).map(([value, label]) => <Button key={value} size="sm" variant={source === value ? "secondary" : "ghost"} onClick={() => { setSource(value); setSelected(null) }} aria-pressed={source === value}>{label}</Button>)}</div>
    {!active?.url ? <p className="rounded-xl border p-4 text-xs text-muted-foreground">{source === "ours" ? "No pit photos available." : mediaStatus || "No photos available."}</p> : <>
    <a href={active.url} target="_blank" rel="noreferrer" aria-label={`Open robot photo for team ${teamNumber}`} className="block overflow-hidden rounded-xl border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <img src={active.url} alt={`Team ${teamNumber} robot from ${active.source}`} className="h-40 w-full object-contain lg:h-44" onError={() => setFailed(current => [...current, active.id])} />
    </a>
    {available.length > 1 && <div className="flex gap-2 overflow-x-auto pb-2" aria-label={`Robot photos for team ${teamNumber}`}>
      {available.map((photo, index) => <button key={photo.id} type="button" onClick={() => setSelected(photo.id)} aria-label={`Show robot photo ${index + 1} for team ${teamNumber}`} aria-pressed={active.id === photo.id} className={`shrink-0 overflow-hidden rounded-md border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active.id === photo.id ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}>
        <img src={photo.url!} alt="" className="size-8 object-contain" loading="lazy" onError={() => setFailed(current => [...current, photo.id])} />
      </button>)}
    </div>}
    <p className="text-[11px] text-muted-foreground">{active.source} · {year} · click to enlarge</p>
    </>}
  </div>
}
