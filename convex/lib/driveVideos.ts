import { ConvexError } from "convex/values"

export type DriveVideo = { matchNumber: number; name: string; videoUrl: string }
type DriveEntry = { name: string; url: string; folder: boolean; video: boolean }

export function driveFolderUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new ConvexError("Paste a valid Google Drive folder link") }
  const folder = /^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname)
  if (value.length > 2048 || url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password || url.port || !folder) {
    throw new ConvexError("Paste a Google Drive folder link, such as drive.google.com/drive/folders/…")
  }
  const result = new URL(`https://drive.google.com/drive/folders/${folder[1]}`)
  const resourceKey = url.searchParams.get("resourcekey")
  if (resourceKey) result.searchParams.set("resourcekey", resourceKey)
  return result.toString()
}

function decodeHtml(text: string) {
  return text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" }
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
    const code = Number.parseInt(entity.slice(entity[2]?.toLowerCase() === "x" ? 3 : 2, -1), entity[2]?.toLowerCase() === "x" ? 16 : 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
  })
}

export function parseDriveListing(html: string): DriveEntry[] {
  if (!html.includes('class="flip-entries"')) throw new ConvexError("Google Drive folder is unavailable. Check that anyone with the link can view the folder and its videos.")
  const entries: DriveEntry[] = []
  for (const entry of html.split(/<div class="flip-entry"(?=\s)/).slice(1)) {
    const href = /<a\s+href="([^"]+)"/.exec(entry)?.[1]
    const title = /<div class="flip-entry-title">([\s\S]*?)<\/div>/.exec(entry)?.[1]
    if (!href || !title) continue
    let url: URL
    try { url = new URL(decodeHtml(href)) } catch { continue }
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password || url.port) continue
    const folder = /^\/drive\/(?:u\/\d+\/)?folders\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
    const file = /^\/file\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(url.pathname)
    if (!folder && !file) continue
    const name = decodeHtml(title.replace(/<[^>]*>/g, ""))
    entries.push({ name, url: url.toString(), folder, video: file && (/alt="Video"|\/type\/video\//.test(entry) || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(name)) })
  }
  return entries
}

export function normalizeVideoPrefix(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ")
}

export function videoMatchNumber(name: string, prefix: string) {
  const normalized = normalizeVideoPrefix(name.replace(/\.(mp4|mov|m4v|webm|avi|mkv)$/i, ""))
  const match = /^(.*?)\s+qm\s*(\d+)$/.exec(normalized)
  const number = match ? Number(match[2]) : NaN
  return match && match[1] === normalizeVideoPrefix(prefix) && Number.isSafeInteger(number) && number > 0 ? number : null
}

// Fetch folder listing HTML only. Video bytes and file metadata are never persisted.
export async function readDriveVideos(folderUrl: string, prefix: string, matchNumbers: Set<number>): Promise<DriveVideo[]> {
  const queue = [{ url: driveFolderUrl(folderUrl), depth: 0 }]
  const visited = new Set<string>()
  const videos: DriveVideo[] = []
  const fileUrls = new Set<string>()
  while (queue.length) {
    const folder = queue.shift()!
    const canonical = driveFolderUrl(folder.url)
    const folderId = new URL(canonical).pathname.split("/").pop()!
    if (visited.has(folderId)) continue
    if (visited.size >= 20) throw new ConvexError("This folder has too many subfolders. Choose the folder containing this event's match videos.")
    visited.add(folderId)
    const listingUrl = new URL("https://drive.google.com/embeddedfolderview")
    listingUrl.searchParams.set("id", folderId)
    const resourceKey = new URL(canonical).searchParams.get("resourcekey")
    if (resourceKey) listingUrl.searchParams.set("resourcekey", resourceKey)
    const response = await fetch(listingUrl, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new ConvexError("Could not read the Google Drive folder. Try refreshing the videos.")
    const html = await response.text()
    if (html.length > 2_000_000) throw new ConvexError("This folder is too large. Choose the folder containing this event's match videos.")
    for (const entry of parseDriveListing(html)) {
      if (entry.folder) {
        // Skip another event's video folder in a shared collection; allow ordinary nested folders.
        const childPrefix = normalizeVideoPrefix(entry.name).replace(/ match videos$/, "")
        if (/ match videos$/i.test(normalizeVideoPrefix(entry.name)) && childPrefix !== normalizeVideoPrefix(prefix)) continue
        if (folder.depth >= 3) throw new ConvexError("Choose a folder closer to the match videos; the current folder has too many nested levels.")
        queue.push({ url: entry.url, depth: folder.depth + 1 })
      } else if (entry.video && !fileUrls.has(entry.url)) {
        const matchNumber = videoMatchNumber(entry.name, prefix)
        if (matchNumber !== null && matchNumbers.has(matchNumber)) {
          fileUrls.add(entry.url)
          videos.push({ matchNumber, name: entry.name, videoUrl: entry.url })
        }
      }
      if (videos.length > 500) throw new ConvexError("Too many matching videos. Choose this event's video folder.")
    }
  }
  return videos.sort((a, b) => a.matchNumber - b.matchNumber || a.name.localeCompare(b.name))
}
