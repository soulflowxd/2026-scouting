import { useQuery } from "convex/react"
import { X } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

export function PitPhotos({ photoIds, onRemove }: { photoIds: Id<"_storage">[]; onRemove?: (id: Id<"_storage">) => void }) {
  const photos = useQuery(api.pit.photoUrls, photoIds.length ? { photoIds } : "skip")
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {photos?.map(photo => <div key={photo.id} className="relative min-w-0">
      {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt="Robot pit photo" className="aspect-square w-full rounded-md border object-contain" /></a> : <p className="text-sm text-destructive">Photo unavailable</p>}
      {onRemove && <Button type="button" size="icon" variant="secondary" className="absolute right-1 top-1" aria-label="Remove photo" title="Remove photo" onClick={() => onRemove(photo.id)}><X /></Button>}
    </div>)}
  </div>
}
