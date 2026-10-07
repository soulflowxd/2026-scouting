import { useMutation, useQuery } from "convex/react"
import { Check, Search, ShieldCheck, UserCog, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AdminRoute() {
  const me = useQuery(api.members.me)
  const isAdmin = me?.role === "admin"
  const members = useQuery(api.members.listForAdmin, isAdmin ? {} : "skip")
  const setApproval = useMutation(api.members.setApproval)
  const setAdminRole = useMutation(api.members.setAdminRole)
  const [search, setSearch] = useState("")
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
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
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
