import { useQuery } from "convex/react"
import { useEffect, useMemo, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"

const selectedEventKey = "scouting:selectedEventId"
const selectedEventChanged = "scouting:selected-event-changed"

export function eventLabel(event: Pick<Doc<"events">, "eventKey" | "name">) {
  return event.name ? `${event.name} (${event.eventKey})` : event.eventKey
}

export function useActiveEvent() {
  const events = useQuery(api.events.list)
  const [selectedId, setSelectedId] = useState<Id<"events"> | null>(() => {
    if (typeof window === "undefined") return null
    return (window.localStorage.getItem(selectedEventKey) as Id<"events"> | null) ?? null
  })

  useEffect(() => {
    function updateSelected() {
      setSelectedId((window.localStorage.getItem(selectedEventKey) as Id<"events"> | null) ?? null)
    }

    window.addEventListener("storage", updateSelected)
    window.addEventListener(selectedEventChanged, updateSelected)
    return () => {
      window.removeEventListener("storage", updateSelected)
      window.removeEventListener(selectedEventChanged, updateSelected)
    }
  }, [])

  const activeEvent = useMemo(() => {
    if (!events?.length) return null

    const selected = selectedId ? events.find((event) => event._id === selectedId) : null
    if (selected) return selected

    const active = [...events]
      .filter((event) => event.activeAt)
      .sort((left, right) => (right.activeAt ?? 0) - (left.activeAt ?? 0))[0]
    return active ?? events[0]
  }, [events, selectedId])

  function selectActiveEvent(eventId: Id<"events">) {
    window.localStorage.setItem(selectedEventKey, eventId)
    setSelectedId(eventId)
    window.dispatchEvent(new CustomEvent(selectedEventChanged))
  }

  return { activeEvent, events, selectActiveEvent }
}
