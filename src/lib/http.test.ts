import { test, expect } from "vitest";
import { jsonInput, failure } from "./http";
test("invalid JSON never echoes secret fragments and oversized streams are rejected", async () => {
  const request = new Request("http://localhost:3000/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"llmKey":"sensitive-value"',
  });
  try {
    await jsonInput(request);
    throw new Error("Expected parse failure");
  } catch (e) {
    expect(await failure(e).text()).not.toContain("sensitive-value");
  }
  await expect(
    jsonInput(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ large: "x".repeat(1000001) }),
      }),
    ),
  ).rejects.toThrow("Request too large");
});
