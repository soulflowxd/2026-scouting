import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"

export function ScoutHandoffs() {
  const me = useQuery(api.members.me)
  const handoffs = useQuery(api.matchScouting.myHandoffs, me?.approvalStatus === "approved" ? {} : "skip")
  const confirm = useMutation(api.matchScouting.confirmSubstitute)
  const [busy, setBusy] = useState(false)
  if (!handoffs?.length) return null
  return <section aria-label="Scout substitutions" className="mb-4 grid gap-2">
    {handoffs.map(claim => <div key={claim._id} className="grid gap-3 rounded-xl border border-primary/30 bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Substitution · QM{claim.matchNumber} · Team {claim.teamNumber}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{claim.incoming
          ? `${claim.scoutName || "A scout"} needs a break. ${claim.substituteAcceptedAt ? "You accepted. Waiting for their final confirmation." : "Confirm that you are ready to take over."}`
          : `${claim.substituteName} ${claim.substituteAcceptedAt ? "accepted. Confirm the handoff before taking your break." : "has not accepted yet. Keep scouting until the handoff is complete."}`}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(!claim.incoming || !claim.substituteAcceptedAt) && <Button disabled={busy || (!claim.incoming && !claim.substituteAcceptedAt)} onClick={async () => {
          setBusy(true)
          try {
            await confirm({ claimId: claim._id, requestedAt: claim.breakRequestedAt!, action: claim.incoming ? "accept" : "confirm" })
            toast.success(claim.incoming ? "Accepted. Waiting for the original scout to confirm." : "Handoff confirmed. Your substitute is assigned; you can take your break.")
          } catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not confirm handoff") }
          finally { setBusy(false) }
        }}>{claim.incoming ? "I’m ready to sub" : "Confirm handoff & take break"}</Button>}
        <Button variant="outline" disabled={busy} onClick={async () => {
          setBusy(true)
          try { await confirm({ claimId: claim._id, requestedAt: claim.breakRequestedAt!, action: "cancel" }); toast.info("Handoff cancelled. The original scout remains assigned.") }
          catch { toast.error("Could not cancel handoff") }
          finally { setBusy(false) }
        }}>{claim.incoming ? "Decline" : "Cancel request"}</Button>
      </div>
    </div>)}
  </section>
}
