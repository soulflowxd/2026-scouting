import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { ExternalLink, Link2, Pencil, Video } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function MatchVideoLink({ videoUrl, matchNumber, label = "Watch video" }: { videoUrl: string; matchNumber: number; label?: string }) {
  return <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 sm:min-h-8" })} aria-label={`Watch QM${matchNumber} video on Google Drive (opens in a new tab)`}>
    <Video aria-hidden="true" />{label}<ExternalLink className="size-3" aria-hidden="true" />
  </a>
}

export function MatchVideo({ matchId, matchNumber, videoUrl, canEdit }: { matchId: Id<"matches">; matchNumber: number; videoUrl?: string; canEdit: boolean }) {
  const saveVideoLink = useMutation(api.matchScouting.saveVideoLink)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const editButton = useRef<HTMLButtonElement>(null)

  function closeEditor() {
    setEditing(false)
    setError(null)
    editButton.current?.focus()
  }

  async function save(url: string) {
    setSaving(true)
    setError(null)
    try {
      await saveVideoLink({ matchId, videoUrl: url })
      closeEditor()
      toast.success(url.trim() ? `QM${matchNumber} video link saved` : `QM${matchNumber} video link removed`)
    } catch (cause) {
      setError(cause instanceof ConvexError ? String(cause.data) : "Could not save the video link. Try again.")
    } finally { setSaving(false) }
  }

  if (!videoUrl && !canEdit) return null

  return <div className="grid min-w-0 gap-3 lg:col-span-3">
    <div className="flex flex-wrap items-center gap-2">
      {videoUrl && <MatchVideoLink videoUrl={videoUrl} matchNumber={matchNumber} />}
      {canEdit && <Button ref={editButton} type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-8" aria-label={`${videoUrl ? "Edit" : "Add"} video link for QM${matchNumber}`} aria-expanded={editing} aria-controls={`${inputId}-editor`} disabled={saving} onClick={() => {
        if (editing) closeEditor()
        else { setDraft(videoUrl ?? ""); setError(null); setEditing(true) }
      }}>
        {videoUrl ? <Pencil aria-hidden="true" /> : <Link2 aria-hidden="true" />}{videoUrl ? "Edit video link" : "Add video"}
      </Button>}
    </div>
    {editing && canEdit && <form id={`${inputId}-editor`} className="grid gap-2 border-t pt-3" onSubmit={event => { event.preventDefault(); if (draft.trim()) void save(draft) }}>
      <Label htmlFor={inputId}>QM{matchNumber} · Google Drive video link</Label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input autoFocus id={inputId} type="url" inputMode="url" autoComplete="off" placeholder="https://drive.google.com/file/d/…/view" value={draft} onChange={event => { setDraft(event.target.value); setError(null) }} disabled={saving} maxLength={2048} required aria-invalid={!!error} aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ""}`} className="min-h-11 min-w-0 flex-1 sm:min-h-9" />
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={saving || !draft.trim() || draft.trim() === videoUrl}>{saving ? "Saving…" : "Save link"}</Button>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={saving} onClick={closeEditor}>Cancel</Button>
      </div>
      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">Upload the video to Google Drive, then paste its file link here. Give your scouts permission to view it in Drive.</p>
      {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      {videoUrl && <Button type="button" variant="ghost" size="sm" className="min-h-11 w-fit text-destructive sm:min-h-8" disabled={saving} onClick={() => void save("")}>Remove video link</Button>}
    </form>}
  </div>
}
