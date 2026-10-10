import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function MatchVideoFolder({ eventId, settings, canEdit, loading, count, error, onRefresh }: {
  eventId: Id<"events">; settings: { folderUrl?: string; prefix: string } | null | undefined; canEdit: boolean; loading: boolean; count: number; error: string | null; onRefresh: () => void
}) {
  const saveFolder = useMutation(api.events.saveVideoFolder)
  const [editing, setEditing] = useState(false)
  const [folderUrl, setFolderUrl] = useState("")
  const [prefix, setPrefix] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const id = useId()
  if (!settings?.folderUrl && !canEdit) return null

  async function save(url: string) {
    setSaving(true)
    setSaveError(null)
    try {
      await saveFolder({ eventId, folderUrl: url, prefix })
      setEditing(false)
      toast.success(url.trim() ? "Match video folder connected" : "Match video folder disconnected")
    } catch (cause) { setSaveError(cause instanceof ConvexError ? String(cause.data) : "Could not save the folder. Check the link and try again.") }
    finally { setSaving(false) }
  }

  return <section aria-label="Match videos" className="grid gap-3 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="size-4 text-muted-foreground" aria-hidden="true" />Match videos</h2>
        <p className="text-xs text-muted-foreground" role="status">{settings?.folderUrl ? loading ? "Checking Google Drive for videos…" : `${count} ${count === 1 ? "video" : "videos"} matched · Refreshes every minute` : "Connect a Google Drive folder to find videos by match number."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {settings?.folderUrl && <>
          <a href={settings.folderUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-8" })}>Open Drive folder<ExternalLink aria-hidden="true" /></a>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" disabled={loading} onClick={onRefresh}><RefreshCw aria-hidden="true" />Refresh videos</Button>
        </>}
        {canEdit && <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" aria-expanded={editing} aria-controls={`${id}-editor`} disabled={saving} onClick={() => {
          if (!editing) { setFolderUrl(settings?.folderUrl ?? ""); setPrefix(settings?.prefix ?? ""); setSaveError(null) }
          setEditing(!editing)
        }}>{settings?.folderUrl ? "Change folder" : "Connect folder"}</Button>}
      </div>
    </div>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {settings?.folderUrl && !loading && !error && count === 0 && <p className="text-sm text-muted-foreground">No matching videos yet. Name files “{settings.prefix} qm1”, “{settings.prefix} qm2”, and so on. Videos can be inside subfolders.</p>}
    {editing && canEdit && <form id={`${id}-editor`} className="grid gap-3 border-t pt-3" onSubmit={event => { event.preventDefault(); void save(folderUrl) }}>
      <div className="grid gap-2"><Label htmlFor={`${id}-folder`}>Google Drive folder link</Label><Input autoFocus id={`${id}-folder`} type="url" inputMode="url" value={folderUrl} onChange={event => setFolderUrl(event.target.value)} required disabled={saving} maxLength={2048} placeholder="https://drive.google.com/drive/folders/…" className="min-h-11 sm:min-h-9" aria-describedby={`${id}-help`} /></div>
      <div className="grid gap-2 sm:max-w-sm"><Label htmlFor={`${id}-prefix`}>Event name in filenames</Label><Input id={`${id}-prefix`} value={prefix} onChange={event => setPrefix(event.target.value)} required disabled={saving} maxLength={100} placeholder="stem gals" className="min-h-11 sm:min-h-9" /><p className="text-xs text-muted-foreground">Example: {prefix.trim() || "stem gals"} qm1.mp4 → QM1</p></div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">Keep the folder and videos viewable by anyone with the link. Videos play on Google Drive; only the folder link and filename prefix are saved here.</p>
      {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11 sm:min-h-9" disabled={saving}>{saving ? "Saving…" : "Save folder"}</Button><Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>{settings?.folderUrl && <Button type="button" variant="ghost" className="min-h-11 text-destructive sm:min-h-9" disabled={saving} onClick={() => void save("")}>Disconnect folder</Button>}</div>
    </form>}
  </section>
}
