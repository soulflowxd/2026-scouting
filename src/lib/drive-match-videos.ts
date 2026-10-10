import { useAction, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useEffect, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

type DriveVideo = { matchNumber: number; name: string; videoUrl: string }
type VideoState = { key: string; videos: DriveVideo[]; loading: boolean; error: string | null }

export function useDriveMatchVideos(eventId: Id<"events"> | null) {
  const settings = useQuery(api.events.videoSettings, eventId ? { eventId } : "skip")
  const load = useAction(api.matchVideos.listFromDrive)
  const [state, setState] = useState<VideoState | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const key = `${eventId}:${settings?.folderUrl}:${settings?.prefix}`
  useEffect(() => {
    if (!eventId || !settings?.folderUrl) return
    let cancelled = false
    let pending = false
    async function refresh() {
      if (pending) return
      pending = true
      setState(previous => ({ key, videos: previous?.key === key ? previous.videos : [], loading: true, error: null }))
      try {
        const videos = await load({ eventId: eventId! })
        if (!cancelled) setState({ key, videos, loading: false, error: null })
      } catch (cause) {
        if (!cancelled) setState(previous => ({ key, videos: previous?.key === key ? previous.videos : [], loading: false, error: cause instanceof ConvexError ? String(cause.data) : "Could not read the Drive folder. Check its sharing permissions, then refresh." }))
      } finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh() }, 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [eventId, settings?.folderUrl, settings?.prefix, key, load, refreshCount])
  return { settings, videos: state?.key === key ? state.videos : [], loading: !!settings?.folderUrl && (state?.key !== key || state.loading), error: state?.key === key ? state.error : null, refresh: () => setRefreshCount(count => count + 1) }
}
