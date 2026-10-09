import type { FunctionArgs } from "convex/server"
import { api } from "../../convex/_generated/api"

type Payload =
  | { kind: "pit"; args: FunctionArgs<typeof api.pit.save>; photos: File[] }
  | { kind: "match"; args: FunctionArgs<typeof api.matchScouting.saveReport>; photos: File[] }
export type UploadJob = Payload & { id: string; owner: string; deployment: string; error?: string }
const deployment = import.meta.env.VITE_CONVEX_URL
let database: Promise<IDBDatabase> | undefined
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("scouting-outbox", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("reports", { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
  })
}
async function access<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("reports", mode)
    const request = operation(transaction.objectStore("reports"))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error ?? new Error("Device storage failed"))
    transaction.onerror = () => reject(transaction.error)
  })
}
export async function putUpload(job: UploadJob) {
  await access("readwrite", store => store.put(job))
  window.dispatchEvent(new Event("scouting-outbox"))
}
export async function queueReport(owner: string, payload: Payload) {
  await putUpload({ ...payload, owner, deployment, id: crypto.randomUUID() })
  if (typeof navigator !== "undefined") void navigator.storage?.persist?.().catch(() => { /* Durable storage is best-effort; never block a saved submission. */ })
}
export async function listUploads(owner: string) {
  const jobs = await access<UploadJob[]>("readonly", store => store.getAll())
  return jobs.filter(job => job.owner === owner && job.deployment === deployment)
}
export async function removeUpload(id: string) {
  await access("readwrite", store => store.delete(id))
  window.dispatchEvent(new Event("scouting-outbox"))
}
function draftId(owner: string, key: string) {
  return `draft:${deployment}:${owner}:${key}`
}
export async function readDraft<T>(owner: string, key: string): Promise<T | undefined> {
  const record = await access<{ value: T } | undefined>("readonly", store => store.get(draftId(owner, key)))
  return record?.value
}
export async function writeDraft<T>(owner: string, key: string, value: T) {
  await access("readwrite", store => store.put({ id: draftId(owner, key), value }))
}
export async function deleteDraft(owner: string, key: string) {
  await access("readwrite", store => store.delete(draftId(owner, key)))
}
