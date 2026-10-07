import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase()
        if (!email) throw new Error("Email is required")
        const name = String(params.name ?? "").trim()

        if (params.flow === "signUp") {
          if (!name) throw new Error("Name is required")
        }

        return { email, name }
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters")
        }
      },
    }),
  ],
})
