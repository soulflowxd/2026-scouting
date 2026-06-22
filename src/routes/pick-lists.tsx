import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useMutation, useQuery } from "convex/react"
import { GripVertical, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { tierLabels } from "@/lib/labels"

const columns = ["tier1", "tier2", "tier3", "doNotPick", "uncategorized"] as const
type Tier = (typeof columns)[number]

type BoardItem = {
  teamNumber: number
  tier: string
  rank: number
}

export function PickListsRoute() {
  const activeEvent = useQuery(api.events.active)
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

  const selectedList = useMemo(() => {
    if (!lists?.length) return null
    return lists.find((list) => list._id === selectedListId) ?? lists[0]
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

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Pick Lists</h1>
          <p className="text-sm text-muted-foreground">
            Personal boards plus admin primary list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="w-44"
          />
          <Button type="button" onClick={() => void onCreatePersonal()}>
            <Plus aria-hidden="true" />
            New personal
          </Button>
          {me?.role === "admin" && (
            <>
              <Button type="button" variant="outline" onClick={() => void onEnsurePrimary()}>
                Primary
              </Button>
              <Button type="button" variant="outline" onClick={() => void onRunConsensus()}>
                Run consensus
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onApplyConsensus()}
                disabled={!latestConsensus}
              >
                Apply consensus
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(lists ?? []).map((list) => (
          <Button
            key={list._id}
            type="button"
            variant={selectedList?._id === list._id ? "default" : "outline"}
            onClick={() => setSelectedListId(list._id)}
          >
            {list.name}
          </Button>
        ))}
      </div>
      {selectedList ? (
        <PickBoard
          listId={selectedList._id}
          items={selectedList.items}
          teams={teams ?? []}
          readOnly={selectedList.kind === "primary" && me?.role !== "admin"}
        />
      ) : (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Create a personal pick list to start.
        </div>
      )}
      {latestConsensus && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-medium">Latest consensus</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {latestConsensus.items.slice(0, 12).map((item) => (
              <div key={item._id} className="rounded-lg bg-muted p-2 text-sm">
                <p className="font-medium">{item.teamNumber}</p>
                <p className="text-muted-foreground">
                  {tierLabels[item.suggestedTier]} · {item.score}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const moveTeam = useMutation(api.pickLists.moveTeam)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
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

  async function moveTeamToTier(teamNumber: number, tier: Tier, rank?: number) {
    const targetItems = boardItems
      .filter((item) => item.tier === tier && item.teamNumber !== teamNumber)
      .sort((a, b) => a.rank - b.rank)
    const targetRank = rank ?? targetItems.length
    await moveTeam({
      pickListId: listId,
      teamNumber,
      tier,
      rank: targetRank,
    })
  }

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
      await Promise.all(
        targetItems.map((item, rank) =>
          moveTeam({
            pickListId: listId,
            teamNumber: item.teamNumber,
            tier: targetTier,
            rank,
          }),
        ),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Move failed")
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
      <div className="grid gap-3 lg:grid-cols-5">
        {columns.map((tier) => (
          <PickColumn
            key={tier}
            tier={tier}
            readOnly={readOnly}
            items={boardItems
              .filter((item) => item.tier === tier)
              .sort((a, b) => a.rank - b.rank)}
            onMove={(teamNumber, targetTier) => {
              void moveTeamToTier(teamNumber, targetTier)
            }}
          />
        ))}
      </div>
    </DndContext>
  )
}

function PickColumn({
  tier,
  items,
  readOnly,
  onMove,
}: {
  tier: Tier
  readOnly: boolean
  onMove: (teamNumber: number, tier: Tier) => void
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
      className="grid min-h-40 content-start gap-2 rounded-xl border bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{tierLabels[tier]}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <SortableContext
        items={items.map((item) => `team:${item.teamNumber}`)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <PickCard
            key={item.teamNumber}
            item={item}
            readOnly={readOnly}
            onMove={onMove}
          />
        ))}
      </SortableContext>
    </section>
  )
}

function PickCard({
  item,
  readOnly,
  onMove,
}: {
  item: BoardItem & {
    nickname: string
    pitScouted: boolean
    averageDriverRating: number
    averageTeleopFuel: number
    commonEndgameClimb: string
  }
  readOnly: boolean
  onMove: (teamNumber: number, tier: Tier) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `team:${item.teamNumber}`,
    disabled: readOnly,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid gap-2 rounded-lg border bg-background p-3 text-sm shadow-sm ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
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
      {!readOnly && (
        <div className="grid grid-cols-5 gap-1">
          {columns.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => onMove(item.teamNumber, tier)}
              className="rounded-md border px-1 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {tier === "doNotPick" ? "DNP" : tier === "uncategorized" ? "U" : tier.replace("tier", "T")}
            </button>
          ))}
        </div>
      )}
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
