import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { ratings } from "./mash-ratings"

export function useMashRatings(eventId: Id<"events">) {
  const votes = useQuery(api.mash.list, { eventId })
  return ratings(votes ?? [])
}
