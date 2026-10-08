import { expect, test } from "vitest"
import { signupProfile } from "./lib/signupProfile"

test("signup requires both first and last name, not just a legacy display name", () => {
  const base = { flow: "signUp", email: "scout@example.com", teamNumber: 9128 }
  for (const names of [{}, { name: "Scout Name" }, { firstName: "Scout" }, { lastName: "Name" }, { firstName: " ", lastName: "Name" }, { firstName: "Scout", lastName: "\t" }]) {
    expect(() => signupProfile({ ...base, ...names })).toThrow("First name and last name are required")
  }
  expect(signupProfile({ ...base, firstName: " Scout ", lastName: " Name " }).name).toBe("Scout Name")
  expect(() => signupProfile({ ...base, firstName: "a".repeat(50), lastName: "Name" })).toThrow("too long")
})

test("existing accounts can sign in without entering names", () => {
  expect(signupProfile({ flow: "signIn", email: "scout@example.com" })).toEqual({ email: "scout@example.com", name: "" })
})
