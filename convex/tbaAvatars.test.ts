import { expect, test } from "vitest"
import { tbaAvatars } from "./lib/tbaAvatars"

test("TBA avatars map PNG data to each listed team and ignore unsupported media", () => {
  const image = "iVBORw0KGgoAAA=="
  const avatars = tbaAvatars([
    { type: "avatar", team_keys: ["frc118", "frc127"], details: { base64Image: image } },
    { type: "youtube", team_keys: ["frc324"], details: { base64Image: image } },
    { type: "avatar", team_keys: ["frc456"], details: { base64Image: "invalid" } },
    { type: "avatar", team_keys: ["frc624"] },
  ])
  expect(avatars.get("frc118")).toBe(`data:image/png;base64,${image}`)
  expect(avatars.get("frc127")).toBe(avatars.get("frc118"))
  expect(avatars.size).toBe(2)
  expect(tbaAvatars(null).size).toBe(0)
})
