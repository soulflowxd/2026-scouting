import { useMutation, useQuery } from "convex/react"
import { Check, KeyRound, Pencil, Search, ShieldCheck, UserCog, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordForm } from "@/components/password-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

export function AdminRoute() {
  const me = useQuery(api.members.me)
  const isAdmin = me?.role === "admin"
  const members = useQuery(api.members.listForAdmin, isAdmin ? {} : "skip")
  const setApproval = useMutation(api.members.setApproval)
  const setAdminRole = useMutation(api.members.setAdminRole)
  const setName = useMutation(api.members.setName)
  const setTeamNumber = useMutation(api.members.setTeamNumber)
  const mergeDuplicates = useMutation(api.members.mergeDuplicates)
  const [nameTarget, setNameTarget] = useState<{ id: Id<"members">; email: string } | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [search, setSearch] = useState("")
  const [passwordTarget, setPasswordTarget] = useState<{ id: Id<"members">; email: string } | null>(null)
  const [workingId, setWorkingId] = useState<Id<"members"> | null>(null)

  const visibleMembers = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return members
    return members?.filter((member) =>
      `${member.name ?? ""} ${member.email ?? ""}`.toLowerCase().includes(needle),
    )
  }, [members, search])

  if (me !== undefined && !isAdmin) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">Account administration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need admin access to manage scouting accounts.
        </p>
      </section>
    )
  }

  async function updateApproval(
    memberId: Id<"members">,
    status: "approved" | "rejected",
  ) {
    setWorkingId(memberId)
    try {
      await setApproval({ memberId, status })
      toast.success(status === "approved" ? "Account approved" : "Account access denied")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update account")
    } finally {
      setWorkingId(null)
    }
  }

  async function updateAdmin(memberId: Id<"members">, isAdminRole: boolean) {
    setWorkingId(memberId)
    try {
      await setAdminRole({ memberId, isAdmin: isAdminRole })
      toast.success(isAdminRole ? "Admin added" : "Admin removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update admin")
    } finally {
      setWorkingId(null)
    }
  }

  const pendingCount =
    members?.filter((member) => member.approvalStatus === "pending").length ?? 0

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Account administration</h1>
          <p className="text-sm text-muted-foreground">
            Approve new scouts{me?.isSuperAdmin ? " and manage admins" : ""}.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="font-semibold">{pendingCount}</span>{" "}
          <span className="text-muted-foreground">pending</span>
        </div>
      </div>

      <label className="relative block max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
          className="pl-9"
        />
        <span className="sr-only">Search accounts</span>
      </label>

      <div className="grid gap-3">
        {members === undefined && (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Loading accounts…
          </p>
        )}
        {visibleMembers?.length === 0 && (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No matching accounts.
          </p>
        )}
        {visibleMembers?.map((member) => {
          const working = workingId === member._id
          const isProtected = member.role === "superAdmin"
          return (
            <article
              key={member._id}
              className={
                member.approvalStatus === "pending"
                  ? "grid gap-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  : "grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              }
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{member.name || "Unnamed scout"}</p>
                  <RoleBadge role={member.role} />
                  <StatusBadge status={member.approvalStatus} />
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {member.email || "No email available"}
                </p>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  Team number
                  <select aria-label={`Team number for ${member.name || member.email || "scout"}`} value={member.teamNumber ?? ""} disabled={working} className="rounded-md border bg-background px-2 py-1" onChange={async event => {
                    const teamNumber = Number(event.target.value) as 9128 | 10340
                    setWorkingId(member._id)
                    try { await setTeamNumber({ memberId: member._id, teamNumber }); toast.success("Team number updated") }
                    catch { toast.error("Could not update team number") }
                    finally { setWorkingId(null) }
                  }}>
                    <option value="" disabled>Not assigned</option>
                    <option value="9128">9128</option><option value="10340">10340</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {(member.role === "scout" || me?.isSuperAdmin || me?.member?._id === member._id) && <Button type="button" size="sm" variant="outline" onClick={() => {
                  setNameTarget({ id: member._id, email: member.email ?? "" })
                  const [first = "", ...rest] = (member.name ?? "").trim().split(/\s+/)
                  setFirstName(first)
                  setLastName(rest.join(" "))
                }}><Pencil />Edit name</Button>}
                {(member.role === "scout" || me?.isSuperAdmin) && member.email && members?.some(other => other._id !== member._id && other.email === member.email) && <Button type="button" size="sm" variant="outline" disabled={working} onClick={async () => {
                  setWorkingId(member._id)
                  try { const count = await mergeDuplicates({ memberId: member._id }); toast.success(count ? "Duplicate entries merged" : "These entries belong to different accounts") }
                  catch (error) { toast.error(error instanceof Error ? error.message : "Could not merge entries") }
                  finally { setWorkingId(null) }
                }}>Merge duplicate entries</Button>}
                {!isProtected && (member.role === "scout" || me?.isSuperAdmin) && member.email && <Button type="button" size="sm" variant="outline" onClick={() => setPasswordTarget({ id: member._id, email: member.email! })}><KeyRound />Reset password</Button>}
                {member.approvalStatus !== "approved" && !isProtected && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void updateApproval(member._id, "approved")}
                    disabled={working}
                  >
                    <Check aria-hidden="true" />
                    Approve
                  </Button>
                )}
                {member.approvalStatus !== "rejected" && !isProtected && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void updateApproval(member._id, "rejected")}
                    disabled={working}
                  >
                    <X aria-hidden="true" />
                    {member.approvalStatus === "pending" ? "Deny" : "Disable"}
                  </Button>
                )}
                {me?.isSuperAdmin &&
                  member.approvalStatus === "approved" &&
                  !isProtected && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void updateAdmin(member._id, member.role !== "admin")
                      }
                      disabled={working}
                    >
                      <UserCog aria-hidden="true" />
                      {member.role === "admin" ? "Remove admin" : "Make admin"}
                    </Button>
                  )}
              </div>
            </article>
          )
        })}
      </div>
      <Dialog open={passwordTarget !== null} onOpenChange={(open) => { if (!open) setPasswordTarget(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>{passwordTarget?.email}</DialogDescription></DialogHeader>
          {passwordTarget && <PasswordForm key={passwordTarget.id} memberId={passwordTarget.id} onSaved={() => setPasswordTarget(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={nameTarget !== null} onOpenChange={open => { if (!open && !savingName) setNameTarget(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Edit name</DialogTitle><DialogDescription>{nameTarget?.email}</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={async event => {
            event.preventDefault()
            if (!nameTarget || savingName) return
            setSavingName(true)
            try { await setName({ memberId: nameTarget.id, name: `${firstName.trim()} ${lastName.trim()}` }); setNameTarget(null); toast.success("Name updated") }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not update name") }
            finally { setSavingName(false) }
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">First name<Input autoFocus required autoComplete="given-name" maxLength={49} value={firstName} onChange={event => setFirstName(event.target.value)} /></label>
              <label className="grid gap-2 text-sm">Last name<Input required autoComplete="family-name" maxLength={50} value={lastName} onChange={event => setLastName(event.target.value)} /></label>
            </div>
            <Button type="submit" disabled={savingName || !firstName.trim() || !lastName.trim()}>{savingName ? "Saving..." : "Save name"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function RoleBadge({ role }: { role: "superAdmin" | "admin" | "scout" }) {
  const label = role === "superAdmin" ? "Super admin" : role === "admin" ? "Admin" : "Scout"
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {role !== "scout" && <ShieldCheck className="size-3" aria-hidden="true" />}
      {label}
    </span>
  )
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected"
}) {
  const styles = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rejected: "bg-destructive/10 text-destructive",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}
