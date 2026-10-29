import { test, expect, vi } from "vitest";
import { z } from "zod";
import { FetchProvider, MockProvider, structured } from "./llm";
import { settingsSchema } from "./settings";
test("JSON repair and schema retry recover small-model output", async () => {
  const r = await structured(
    z.object({ name: z.string() }),
    "Return {name}",
    "test",
    new MockProvider(['{"wrong":1}', "```json\n{name: 'Ada',}\n```"]),
  );
  expect(r.value).toEqual({ name: "Ada" });
  expect(r.tokens).toBe(20);
});
test("429 and 5xx back off before recovering with token accounting", async () => {
  const f = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("", { status: 429 }))
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 12 },
      }),
    );
  const waits: number[] = [];
  const p = new FetchProvider(settingsSchema.parse({}), "", f, async (ms) => {
    waits.push(ms);
  });
  expect((await p.complete("json", "test")).tokens).toBe(12);
  expect(waits).toEqual([1000, 2000]);
});
test("Gemini and OpenRouter return the same provider contract", async () => {
  const g = new FetchProvider(
    settingsSchema.parse({ provider: "gemini" }),
    "secret",
    async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        usageMetadata: { totalTokenCount: 8 },
      }),
  );
  expect((await g.complete("json", "test")).text).toBe('{"ok":true}');
  const p = new FetchProvider(
    settingsSchema.parse({ provider: "openrouter" }),
    "secret",
    async () =>
      Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }),
  );
  expect((await p.complete("json", "test")).text).toBe('{"ok":true}');
});
