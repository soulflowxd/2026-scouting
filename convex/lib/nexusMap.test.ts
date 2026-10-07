import { expect, test } from "vitest"
import { normalizeNexusMap } from "./nexusMap"

test("preserves real venue geometry, empty pits and landmarks", () => {
  const result = normalizeNexusMap({
    size: { x: 940, y: 1076 },
    pits: {
      E7: { position: { x: 670, y: 170 }, size: { x: 100, y: 100 }, team: "118" },
      C7: { position: { x: 370, y: 170 }, size: { x: 100, y: 100 } },
    },
    walls: { w1: { position: { x: 10, y: 520 }, size: { x: 20, y: 1040 } } },
    areas: { a0: { label: "Pit admin", position: { x: 420, y: 970 }, size: { x: 200, y: 100 } } },
  })
  expect(result?.pits[0]).toMatchObject({ id: "E7", x: 670, y: 170, teamNumber: 118 })
  expect(result?.pits[1].teamNumber).toBeNull()
  expect(result?.areas[0].label).toBe("Pit admin")
  expect(result?.walls[0].width).toBe(20)
  expect(normalizeNexusMap({ size: { x: 0, y: 10 } })).toBeNull()
})
