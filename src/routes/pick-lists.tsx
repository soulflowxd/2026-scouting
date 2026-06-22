import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  rectIntersection,
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

const columns = ["tier1", "tier2", "tier3", "doNotPick", "uncategorized"] as const
type Tier = (typeof columns)[number]

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
            {selectedList.kind === "primary" ? "Primary" : "Personal"}
          </span>
        </div>
        <PickBoard
          listId={selectedList._id}
          items={selectedList.items}
          teams={teams ?? []}
          readOnly={selectedList.kind === "primary" && me?.role !== "admin"}
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
              View and edit the shared primary board.
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
              disabled={me?.role !== "admin" || !personalLists.length}
            >
              Preview
            </Button>
            <Button
              type="button"
              className="bg-neutral-500 text-white hover:bg-neutral-600"
              onClick={() => void onApplyConsensus()}
              disabled={me?.role !== "admin" || !latestConsensus}
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
  listId,
  items,
  teams,
  readOnly,
}: {
  listId: Id<"pickLists">
  items: BoardItem[]
  teams: {
    teamNumber: number
    nickname: string
    pitScouted: boolean
    averageDriverRating: number
    averageTeleopFuel: number
    commonEndgameClimb: string
  }[]
  readOnly: boolean
}) {
  const moveTeams = useMutation(api.pickLists.moveTeams)
  const [teamSearch, setTeamSearch] = useState("")
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const boardItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.teamNumber, item]))
    return teams.map((team, index) => ({
      ...team,
      ...(itemMap.get(team.teamNumber) ?? {
        teamNumber: team.teamNumber,
        tier: "uncategorized",
        rank: index,
      }),
    }))
  }, [items, teams])
  const normalizedSearch = teamSearch.trim().toLowerCase()
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
    if (readOnly) return
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
    const insertAt = overTeam
      ? Math.max(0, targetItems.findIndex((item) => item.teamNumber === overTeam.teamNumber))
      : targetItems.length
    targetItems.splice(insertAt, 0, { ...current, tier: targetTier })

    try {
      await moveTeams({
        pickListId: listId,
        placements: targetItems.map((item, rank) => ({
          teamNumber: item.teamNumber,
          tier: targetTier,
          rank,
        })),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Move failed")
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={(event) => void onDragEnd(event)}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 justify-end">
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
              readOnly={readOnly}
              searchQuery={normalizedSearch}
              firstSearchMatch={firstSearchMatch}
              items={boardItems
                .filter((item) => item.tier === tier)
                .sort((a, b) => a.rank - b.rank)}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function PickColumn({
  tier,
  items,
  readOnly,
  searchQuery,
  firstSearchMatch,
}: {
  tier: Tier
  readOnly: boolean
  searchQuery: string
  firstSearchMatch: number | null
  items: (BoardItem & {
    nickname: string
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
            />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function PickCard({
  item,
  readOnly,
  isSearchActive,
  isSearchMatch,
  shouldScrollIntoView,
  searchQuery,
}: {
  item: BoardItem & {
    nickname: string
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid gap-2 rounded-lg border bg-background p-3 text-sm shadow-sm transition-colors ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
      } ${
        isSearchActive && isSearchMatch
          ? "border-[#001f54] ring-2 ring-[#001f54]/70"
          : ""
      } ${
        isSearchActive && !isSearchMatch ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.teamNumber}</p>
          <p className="text-muted-foreground">{item.nickname}</p>
        </div>
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
  item: { teamNumber: number; nickname: string },
  searchQuery: string,
) {
  if (!searchQuery) return false
  return (
    String(item.teamNumber).includes(searchQuery) ||
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
