import { appendFile, mkdir, writeFile } from "node:fs/promises"

const token = process.env.VERCEL_TOKEN?.trim()
const orgId = process.env.VERCEL_ORG_ID?.trim()
const projectId = process.env.VERCEL_PROJECT_ID?.trim()
if (!token || !orgId || !projectId) throw new Error("Missing Vercel repository secrets")
if ([token, orgId, projectId].some(value => /\s/.test(value))) throw new Error("Vercel secrets contain unexpected internal whitespace")

const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`)
url.searchParams.set("teamId", orgId)
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
if (!response.ok) {
  // Do not dump API responses or credentials into CI logs.
  throw new Error(`Vercel project API returned HTTP ${response.status}. Verify that the organization ID is the project's team ID, the project ID is a prj_ ID, and the token can access that team.`)
}
const project = await response.json()
if (project.name !== "2026-scouting" || project.id !== projectId || project.accountId !== orgId) {
  throw new Error("Vercel secrets do not identify the expected 2026-scouting project and owner")
}
await mkdir(".vercel", { recursive: true })
await writeFile(".vercel/project.json", JSON.stringify({ orgId, projectId, projectName: project.name }))
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `VERCEL_TOKEN=${token}\nVERCEL_ORG_ID=${orgId}\nVERCEL_PROJECT_ID=${projectId}\n`)
}
console.log("Verified and linked the existing 2026-scouting production project")
