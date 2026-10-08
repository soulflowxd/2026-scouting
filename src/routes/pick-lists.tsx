import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type CollisionDetection,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, ClipboardList, GitMerge, GripVertical, Plus, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { tierLabels } from "@/lib/labels"
import { TeamDetailDialog } from "@/routes/teams"
import { TeamAvatar } from "@/components/team-avatar"
import { useMashRatings } from "@/lib/use-mash-ratings"
import { useTeamColors, type TeamColors } from "@/lib/team-colors"

const columns = ["tier1", "tier2", "tier3", "doNotPick", "uncategorized"] as const
type Tier = (typeof columns)[number]

// A card and its containing column can both collide. Prefer the card under
// the pointer so a move doesn't alternate between insertion and appending.
const boardCollision: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
  const cards = hits.filter(hit => String(hit.id).startsWith("team:"))
  return cards.length ? cards : hits
}

type BoardItem = {
  teamNumber: number
  tier: string
  rank: number
}

export function PickListsRoute() {
  const { activeEvent } = useActiveEvent()
  const teams = useQuery(
    api.teams.list,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const lists = useQuery(
    api.pickLists.listForEvent,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const me = useQuery(api.members.me)
  const createPersonal = useMutation(api.pickLists.createPersonal)
  const ensurePrimary = useMutation(api.pickLists.ensurePrimary)
  const runConsensus = useMutation(api.pickLists.runConsensus)
  const applyConsensus = useMutation(api.pickLists.applyConsensusToPrimary)
  const latestConsensus = useQuery(
    api.pickLists.latestConsensus,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [newName, setNewName] = useState("My pick list")

  const primaryList = useMemo(
    () => lists?.find((list) => list.kind === "primary") ?? null,
    [lists],
  )
  const personalLists = useMemo(
    () => (lists ?? []).filter((list) => list.kind === "personal"),
    [lists],
  )
  const selectedList = useMemo(() => {
    if (!lists?.length || !selectedListId) return null
    return lists.find((list) => list._id === selectedListId) ?? null
  }, [lists, selectedListId])

  if (!activeEvent) return <EmptyEvent />

  async function onCreatePersonal() {
    if (!activeEvent) return
    try {
      const id = await createPersonal({ eventId: activeEvent._id, name: newName })
      setSelectedListId(id)
      toast.success("Pick list created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed")
    }
  }

  async function onEnsurePrimary() {
    if (!activeEvent) return
    try {
      const id = await ensurePrimary({ eventId: activeEvent._id })
      setSelectedListId(id)
      toast.success("Primary list ready")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Admin only")
    }
  }

  async function onRunConsensus() {
    if (!activeEvent) return
    try {
      await runConsensus({ eventId: activeEvent._id })
      toast.success("Consensus generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consensus failed")
    }
  }

  async function onApplyConsensus() {
    if (!latestConsensus) return
    try {
      await applyConsensus({ consensusRunId: latestConsensus.run._id })
      toast.success("Consensus applied to primary")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Apply failed")
    }
  }

  if (selectedList) {
    return (
      <section className="flex h-[calc(100svh-5.5rem)] min-h-0 flex-col gap-4 overflow-hidden sm:h-[calc(100svh-6.5rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedListId(null)}>
              <ArrowLeft aria-hidden="true" />
              Pick list home
            </Button>
            <h1 className="mt-2 truncate text-2xl font-semibold">{selectedList.name}</h1>
          </div>
          <span className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground">
            {selectedList.kind === "primary" ? "Main · admin editing only" : "Personal"}
          </span>
        </div>
        {selectedList.kind === "primary" && me?.role !== "admin" && (
          <p className="text-sm text-muted-foreground">The main pick list is read-only for scouts. Create or open your personal pick list to rank teams.</p>
        )}
        <PickBoard
          key={selectedList._id}
          eventId={activeEvent._id}
          listId={selectedList._id}
          items={selectedList.items}
          teams={teams ?? []}
          readOnly={
            selectedList.kind === "primary" && me?.role !== "admin"
          }
        />
      </section>
    )
  }

  return (
    <section className="flex h-[calc(100svh-5.5rem)] min-h-0 flex-col gap-4 overflow-hidden sm:h-[calc(100svh-6.5rem)]">
      <div className="shrink-0 rounded-xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="size-4" aria-hidden="true" />
          Pick Lists
        </p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
          Build personal boards and merge the best one.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{eventLabel(activeEvent)}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,2fr)]">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Drive team list"
          />
          <Button
            type="button"
            className="bg-neutral-950 text-white hover:bg-neutral-800"
            onClick={() => void onCreatePersonal()}
          >
            <Plus aria-hidden="true" />
            New personal
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            if (primaryList) setSelectedListId(primaryList._id)
            else void onEnsurePrimary()
          }}
          className="grid min-h-48 content-end rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40"
        >
          <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
          <div className="mt-10">
            <h2 className="text-lg font-semibold">Primary pick list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              View the shared main board. Only admins can edit it.
            </p>
          </div>
        </button>

        <div className="grid min-h-48 rounded-xl border bg-card p-4 shadow-sm">
          {personalLists.length ? (
            <div className="grid content-start gap-2 overflow-y-auto pr-1">
              {personalLists.map((list) => (
                <button
                  key={list._id}
                  type="button"
                  onClick={() => setSelectedListId(list._id)}
                  className="rounded-lg border bg-background px-3 py-2 text-left text-sm font-medium shadow-sm transition-colors hover:bg-muted"
                >
                  {list.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid place-items-center text-center text-sm font-medium text-muted-foreground">
              Create a personal pick list above to open a full-screen board.
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <GitMerge className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Consensus merge</h2>
            <p className="text-sm text-muted-foreground">
              Select personal boards to preview or apply to primary.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <select className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            {personalLists.length ? (
              personalLists.map((list) => (
                <option key={list._id} value={list._id}>
                  {list.name}
                </option>
              ))
            ) : (
              <option>No personal pick lists</option>
            )}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void onRunConsensus()}
              disabled={
                me?.role !== "admin" || !personalLists.length
              }
            >
              Preview
            </Button>
            <Button
              type="button"
              className="bg-neutral-500 text-white hover:bg-neutral-600"
              onClick={() => void onApplyConsensus()}
              disabled={
                me?.role !== "admin" || !latestConsensus
              }
            >
              Apply to primary
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
function PickBoard({
  eventId,
  listId,
  items,
  teams,
  readOnly,
}: {
  eventId: Id<"events">
  listId: Id<"pickLists">
  items: BoardItem[]
  teams: {
    avatar?: string
    eventTeamAlias?: string
    teamNumber: number
    nickname: string
    epa?: number
    averageRp?: number
    xp?: number
    eventRank?: number
    picked: boolean
    pitScouted: boolean
    averageDriverRating: number
    averageTeleopFuel: number
    commonEndgameClimb: string
  }[]
  readOnly: boolean
}) {
  const moveTeams = useMutation(api.pickLists.moveTeams)
  const teamColors = useTeamColors(teams.map(team => team.teamNumber))
  const me = useQuery(api.members.me)
  const ownTeamNumber = me?.teamNumber
  const mashRatings = useMashRatings(eventId)
  const ownEventRank = teams.find(team => team.teamNumber === ownTeamNumber)?.eventRank
  const [pendingPlacements, setPendingPlacements] = useState<BoardItem[] | null>(null)
  const savingMove = useRef(false)
  const [draggedTeam, setDraggedTeam] = useState<number | null>(null)
  const setPicked = useMutation(api.teams.setPicked)
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [savingTeam, setSavingTeam] = useState<number | null>(null)
  const [teamSearch, setTeamSearch] = useState("")
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const boardItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.teamNumber, item]))
    for (const placement of pendingPlacements ?? []) itemMap.set(placement.teamNumber, placement)
    return teams.map((team, index) => ({
      ...team,
      colors: teamColors[team.teamNumber],
      mashElo: mashRatings.get(team.teamNumber)?.score,
      higherRankedThanOwnTeam: team.teamNumber !== ownTeamNumber && team.eventRank !== undefined && ownEventRank !== undefined && team.eventRank < ownEventRank,
      ownTeamNumber,
      ...(itemMap.get(team.teamNumber) ?? {
        teamNumber: team.teamNumber,
        tier: "uncategorized",
        rank: index,
      }),
    }))
  }, [items, teams, pendingPlacements, ownTeamNumber, ownEventRank, teamColors, mashRatings])
  const normalizedSearch = teamSearch.trim().toLowerCase()
  async function togglePicked(teamNumber: number, picked: boolean) {
    setSavingTeam(teamNumber)
    try {
      await setPicked({ eventId, teamNumber, picked })
    } catch {
      toast.error("Could not update picked status. Please try again.")
    } finally { setSavingTeam(null) }
  }
  const firstSearchMatch = useMemo(() => {
    if (!normalizedSearch) return null
    for (const tier of columns) {
      const match = boardItems
        .filter((item) => item.tier === tier)
        .sort((a, b) => a.rank - b.rank)
        .find((item) => teamMatchesSearch(item, normalizedSearch))
      if (match) return match.teamNumber
    }
    return null
  }, [boardItems, normalizedSearch])

  async function onDragEnd(event: DragEndEvent) {
    setDraggedTeam(null)
    if (readOnly || savingMove.current) return
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    if (!activeId.startsWith("team:")) return
    const activeTeam = Number(activeId.replace("team:", ""))
    const overId = String(over.id)
    const current = boardItems.find((item) => item.teamNumber === activeTeam)
    if (!current) return
    const overTeamNumber = overId.startsWith("team:")
      ? Number(overId.replace("team:", ""))
      : null
    const overTeam = overTeamNumber
      ? boardItems.find((item) => item.teamNumber === overTeamNumber)
      : null
    const columnTier = overId.startsWith("column:")
      ? overId.replace("column:", "")
      : null
    const targetTier = (columns.includes(columnTier as Tier)
      ? columnTier
      : overTeam?.tier ?? current.tier) as Tier
    const targetItems = boardItems
      .filter((item) => item.tier === targetTier && item.teamNumber !== activeTeam)
      .sort((a, b) => a.rank - b.rank)
    if (active.id === over.id) return
    let insertAt = overTeam
      ? Math.max(0, targetItems.findIndex((item) => item.teamNumber === overTeam.teamNumber))
      : targetItems.length
    if (overTeam) {
      const translated = active.rect.current.translated
      const insertAfter = translated
        ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
        : current.tier === targetTier && current.rank < overTeam.rank
      if (insertAfter) insertAt += 1
    }
    targetItems.splice(insertAt, 0, { ...current, tier: targetTier })

    const placements = targetItems.map((item, rank) => ({ teamNumber: item.teamNumber, tier: targetTier, rank }))
    if (current.tier !== targetTier) {
      placements.push(...boardItems
        .filter(item => item.tier === current.tier && item.teamNumber !== activeTeam)
        .sort((a, b) => a.rank - b.rank)
        .map((item, rank) => ({ teamNumber: item.teamNumber, tier: item.tier as Tier, rank })))
    }
    // Move immediately, retaining the new layout until Convex acknowledges it.
    savingMove.current = true
    setPendingPlacements(placements)

    try {
      const result = await moveTeams({
        pickListId: listId,
        placements,
      })
      if (!result.ok) {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Move failed")
    } finally {
      savingMove.current = false
      setPendingPlacements(null)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={({ active }) => setDraggedTeam(Number(String(active.id).replace("team:", "")))}
      onDragCancel={() => setDraggedTeam(null)}
      onDragEnd={(event) => void onDragEnd(event)}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Click a team for pit reports and breakdowns. Admins can mark picked teams to cross them out across all lists.</p>
          <p className="text-xs text-muted-foreground">
            {ownTeamNumber === undefined ? "Ask an admin to assign your team number for standings comparisons." : ownEventRank === undefined ? `Event rank for team ${ownTeamNumber} is unavailable. Refresh event stats to load standings.` : `Your team ${ownTeamNumber} is ranked #${ownEventRank}. Higher-ranked teams are flagged, but can go anywhere in your list.`}
          </p>
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={teamSearch}
              onChange={(event) => setTeamSearch(event.target.value)}
              placeholder="Search teams"
              className="pl-8"
              aria-label="Search teams"
            />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(5,minmax(12rem,1fr))] gap-3 overflow-x-auto pb-1">
          {columns.map((tier) => (
            <PickColumn
              key={tier}
              tier={tier}
              readOnly={readOnly || pendingPlacements !== null}
              searchQuery={normalizedSearch}
              firstSearchMatch={firstSearchMatch}
              onSelect={setSelectedTeam}
              onPicked={(teamNumber, picked) => void togglePicked(teamNumber, picked)}
              savingTeam={savingTeam}
              items={boardItems
                .filter((item) => item.tier === tier)
                .sort((a, b) => a.rank - b.rank)}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedTeam !== null && (
          <div className="flex items-center gap-3 rounded-lg border border-primary bg-card p-3 text-sm shadow-xl ring-2 ring-primary/30">
            <TeamAvatar teamNumber={draggedTeam} />
            <div>
            <p className="font-semibold">{draggedTeam}</p>
            <p className="text-muted-foreground">{boardItems.find(item => item.teamNumber === draggedTeam)?.nickname}</p>
            </div>
          </div>
        )}
      </DragOverlay>
      <TeamDetailDialog eventId={eventId} teamNumber={selectedTeam} onOpenChange={(open) => { if (!open) setSelectedTeam(null) }} />
    </DndContext>
  )
}

function PickColumn({
  onSelect,
  onPicked,
  savingTeam,
  tier,
  items,
  readOnly,
  searchQuery,
  firstSearchMatch,
}: {
  onSelect: (teamNumber: number) => void
  onPicked: (teamNumber: number, picked: boolean) => void
  savingTeam: number | null
  tier: Tier
  readOnly: boolean
  searchQuery: string
  firstSearchMatch: number | null
  items: (BoardItem & {
    mashElo?: number
    avatar?: string
    eventTeamAlias?: string
    colors?: TeamColors
    nickname: string
    eventRank?: number
    higherRankedThanOwnTeam?: boolean
    ownTeamNumber?: number
    epa?: number
    averageRp?: number
    xp?: number
    picked: boolean
    pitScouted: boolean
    averageDriverRating: number
    averageTeleopFuel: number
    commonEndgameClimb: string
  })[]
}) {
  const { setNodeRef } = useDroppable({ id: `column:${tier}` })
  return (
    <section
      ref={setNodeRef}
      className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2 rounded-xl border bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{tierLabels[tier]}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <SortableContext
        items={items.map((item) => `team:${item.teamNumber}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid min-h-0 content-start gap-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <PickCard
              key={item.teamNumber}
              item={item}
              readOnly={readOnly}
              isSearchActive={searchQuery.length > 0}
              isSearchMatch={teamMatchesSearch(item, searchQuery)}
              shouldScrollIntoView={item.teamNumber === firstSearchMatch}
              searchQuery={searchQuery}
              onSelect={() => onSelect(item.teamNumber)}
              onPicked={() => onPicked(item.teamNumber, !item.picked)}
              savingPicked={savingTeam !== null}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function PickCard({
  onSelect,
  onPicked,
  savingPicked,
  item,
  readOnly,
  isSearchActive,
  isSearchMatch,
  shouldScrollIntoView,
  searchQuery,
}: {
  onSelect: () => void
  onPicked: () => void
  savingPicked: boolean
  item: BoardItem & {
    mashElo?: number
    avatar?: string
    eventTeamAlias?: string
    colors?: TeamColors
    nickname: string
    eventRank?: number
    higherRankedThanOwnTeam?: boolean
    ownTeamNumber?: number
    epa?: number
    averageRp?: number
    xp?: number
    picked: boolean
    pitScouted: boolean
    averageDriverRating: number
    averageTeleopFuel: number
    commonEndgameClimb: string
  }
  readOnly: boolean
  isSearchActive: boolean
  isSearchMatch: boolean
  shouldScrollIntoView: boolean
  searchQuery: string
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const me = useQuery(api.members.me)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `team:${item.teamNumber}`,
    disabled: readOnly,
  })
  useEffect(() => {
    if (!shouldScrollIntoView || !searchQuery) return
    const frame = window.requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchQuery, shouldScrollIntoView])

  return (
    <div
      ref={(node) => {
        cardRef.current = node
        setNodeRef(node)
      }}
      style={{ transform: isDragging ? undefined : CSS.Transform.toString(transform), transition }}
      className={`relative grid gap-2 rounded-lg border bg-background p-3 pt-5 text-sm shadow-sm transition-colors ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
      } ${
        isSearchActive && isSearchMatch
          ? "border-[#001f54] ring-2 ring-[#001f54]/70"
          : ""
      } ${
        isSearchActive && !isSearchMatch ? "opacity-45" : ""
      }`}
    >
      {item.colors && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-1.5 overflow-hidden rounded-t-lg">
        <span className="w-2/3" style={{ backgroundColor: item.colors.primary }} />
        <span className="w-1/3" style={{ backgroundColor: item.colors.secondary }} />
      </span>}
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onSelect} className={`min-w-0 flex-1 rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.picked ? "line-through text-muted-foreground" : ""}`} aria-label={`View team ${item.teamNumber} details`}>
          <div className="flex items-center gap-2">
          <TeamAvatar teamNumber={item.teamNumber} />
          <div className="min-w-0 break-words">
          <p className="font-semibold">{item.eventTeamAlias ?? item.teamNumber}</p>
          <p className="text-muted-foreground">{item.nickname}</p>
          </div>
          </div>
        </button>
        <button
          type="button"
          className="touch-none rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          disabled={readOnly}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
          <span className="sr-only">Drag team {item.teamNumber}</span>
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-1 rounded-md bg-muted/50 p-2">
        {[
          { label: "EPA", value: item.epa },
          { label: "RP", value: item.averageRp },
          { label: "xP", value: item.xp },
        ].map(({ label, value }) => (
          <div key={label} className="min-w-0 text-center">
            <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {value === undefined ? "—" : value.toFixed(label === "RP" ? 2 : 1)}
            </dd>
          </div>
        ))}
      </dl>
      {item.eventRank !== undefined && <p className="text-xs text-muted-foreground">Event rank #{item.eventRank}</p>}
      <p className="text-xs text-muted-foreground">Shared Mash Elo: <span className="font-semibold tabular-nums text-foreground">{item.mashElo === undefined ? "Unranked" : Math.round(item.mashElo)}</span></p>
      {item.higherRankedThanOwnTeam && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">Ranked above your team ({item.ownTeamNumber}) · still available to rank</p>}
      {me?.role === "admin" ? <Button type="button" variant={item.picked ? "secondary" : "outline"} size="sm" onClick={onPicked} disabled={savingPicked} aria-pressed={item.picked} aria-label={`${item.picked ? "Undo picked for" : "Mark picked"} team ${item.teamNumber}`}>
        {item.picked ? "Picked · Undo" : "Mark picked"}
      </Button> : item.picked ? <p className="text-xs text-muted-foreground">Picked · unavailable</p> : null}
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <span>{item.pitScouted ? "Pit done" : "No pit"}</span>
        <span>Driver {item.averageDriverRating}</span>
        <span>Fuel {item.averageTeleopFuel}</span>
        <span>{item.commonEndgameClimb}</span>
      </div>
    </div>
  )
}

function teamMatchesSearch(
  item: { teamNumber: number; nickname: string; eventTeamAlias?: string },
  searchQuery: string,
) {
  if (!searchQuery) return false
  return (
    String(item.teamNumber).includes(searchQuery) ||
    !!item.eventTeamAlias?.toLowerCase().includes(searchQuery) ||
    item.nickname.toLowerCase().includes(searchQuery)
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
