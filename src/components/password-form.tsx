import { useState, type FormEvent } from "react"
import { useAction } from "convex/react"
import { ConvexError } from "convex/values"
import { KeyRound } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PasswordForm({ memberId, onSaved }: { memberId?: Id<"members">; onSaved?: () => void }) {
  const changePassword = useAction(api.auth.changePassword)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (next !== confirm) { setError("New passwords do not match"); return }
    setBusy(true); setError("")
    try {
      await changePassword({ currentPassword: current, newPassword: next, memberId })
      setCurrent(""); setNext(""); setConfirm("")
      toast.success(memberId ? "Password reset. User sessions signed out." : "Password changed. Other sessions signed out.")
      onSaved?.()
    } catch (failure) { setError(failure instanceof ConvexError ? String(failure.data) : "Could not change password. Please try again.") }
    finally { setBusy(false) }
  }
  return <form onSubmit={(event) => void submit(event)} className="grid max-w-md gap-4">
    <div className="grid gap-2"><Label htmlFor="currentPassword">{memberId ? "Your admin password" : "Current password"}</Label><Input id="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} /></div>
    <div className="grid gap-2"><Label htmlFor="newPassword">New password</Label><Input id="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} /></div>
    <div className="grid gap-2"><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}><KeyRound />{busy ? "Saving..." : memberId ? "Reset password" : "Change password"}</Button>
  </form>
}
