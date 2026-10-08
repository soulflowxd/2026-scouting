import { convexAuth, getAuthSessionId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"
import { ConvexError, v } from "convex/values"
import { action } from "./_generated/server"
import { internal } from "./_generated/api"
import type { DataModel, Id } from "./_generated/dataModel"
import { signupProfile } from "./lib/signupProfile"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        return signupProfile(params)
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters")
        }
      },
    }),
  ],
})

export const changePassword = action({
  args: { currentPassword: v.string(), newPassword: v.string(), memberId: v.optional(v.id("members")) },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8 || args.newPassword.length > 128) throw new ConvexError("New password must be 8 to 128 characters")
    const access: { actorId: Id<"users">; actorEmail: string; targetId: Id<"users">; targetEmail: string } = await ctx.runQuery(internal.members.passwordContext, { memberId: args.memberId })
    try {
      const verified = await retrieveAccount(ctx, { provider: "password", account: { id: access.actorEmail, secret: args.currentPassword } })
      if (verified.user._id !== access.actorId) throw new Error("Invalid account")
    } catch { throw new ConvexError("Current password is incorrect or too many attempts were made. Try again later.") }
    // Recheck authorization after credential verification before changing the target.
    await ctx.runQuery(internal.members.passwordContext, { memberId: args.memberId })
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: access.targetEmail, secret: args.newPassword } })
    const sessionId = await getAuthSessionId(ctx)
    await invalidateSessions(ctx, { userId: access.targetId, except: access.targetId === access.actorId && sessionId ? [sessionId] : [] })
    return null
  },
})
