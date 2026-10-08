export function signupProfile(params: Record<string, unknown>): { email: string; name: string; teamNumber?: 9128 | 10340 } {
  const email = String(params.email ?? "").trim().toLowerCase()
  if (!email) throw new Error("Email is required")
  if (params.flow !== "signUp") return { email, name: String(params.name ?? "").trim() }
  const firstName = typeof params.firstName === "string" ? params.firstName.trim() : ""
  const lastName = typeof params.lastName === "string" ? params.lastName.trim() : ""
  if (!firstName || !lastName) throw new Error("First name and last name are required")
  if (firstName.length > 49 || lastName.length > 50) throw new Error("Name is too long")
  const name = `${firstName} ${lastName}`
  const teamNumber = Number(params.teamNumber)
  if (teamNumber !== 9128 && teamNumber !== 10340) {
    throw new Error("Choose team 9128 or 10340")
  }
  return { email, name, teamNumber }
}
