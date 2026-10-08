import { expect, test } from "vitest"
import { parseTeamColors } from "./team-colors"

test("FRC Colors responses accept valid team hex colors and skip missing or unsafe colors", () => {
  expect(parseTeamColors({ teams: {
    "118": { colors: { primaryHex: "#003DA5", secondaryHex: "#FFFFFF" } },
    "127": { colors: null },
    "324": { colors: { primaryHex: "url(unsafe)", secondaryHex: "#ffffff" } },
  } })).toEqual({ 118: { primary: "#003DA5", secondary: "#FFFFFF" } })
  expect(parseTeamColors(null)).toEqual({})
})
