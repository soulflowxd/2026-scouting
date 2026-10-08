export function tbaAvatars(media: unknown): Map<string, string> {
  const avatars = new Map<string, string>()
  if (!Array.isArray(media)) return avatars
  for (const item of media) {
    if (!item || item.type !== "avatar" || !Array.isArray(item.team_keys)) continue
    const image = item.details?.base64Image
    if (typeof image !== "string" || image.length > 65536 || !image.startsWith("iVBORw0KGgo") || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) continue
    for (const key of item.team_keys) if (typeof key === "string" && /^frc\d+$/.test(key)) avatars.set(key, `data:image/png;base64,${image}`)
  }
  return avatars
}
