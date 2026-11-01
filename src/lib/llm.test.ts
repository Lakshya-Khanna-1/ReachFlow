import { test, expect, vi } from "vitest";
import { z } from "zod";
import {
  FetchProvider,
  MockProvider,
  structured,
  type LLMProvider,
} from "./llm";
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

test("local structured output sends required fields as a JSON schema", async () => {
  const f = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ choices: [{ message: { content: '{"name":"Ada"}' } }] }),
    );
  const p = new FetchProvider(settingsSchema.parse({}), "", f);
  await structured(z.object({ name: z.string() }), "Return a name", "test", p);
  const request = JSON.parse(String(f.mock.calls[0][1]?.body));
  expect(request.response_format.type).toBe("json_schema");
  expect(request.response_format.json_schema.schema.required).toContain("name");
  expect(request.messages[0].content).toContain("Required output JSON schema:");
});

test.each([400, 200])(
  "an incompatible or empty local schema response (%s) falls back to JSON object mode",
  async (status) => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        status === 400
          ? new Response("", { status: 400 })
          : Response.json({ choices: [{ message: { content: "" } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: '{"name":"Ada"}' } }],
        }),
      );
    const p = new FetchProvider(settingsSchema.parse({}), "", f);
    const result = await structured(
      z.object({ name: z.string() }),
      "Return a name",
      "test",
      p,
    );
    expect(result.value.name).toBe("Ada");
    expect(
      f.mock.calls.map(
        (call) => JSON.parse(String(call[1]?.body)).response_format.type,
      ),
    ).toEqual(["json_schema", "json_object"]);
  },
);

test("schema retries identify missing fields without inventing confidence", async () => {
  const complete = vi
    .fn<LLMProvider["complete"]>()
    .mockResolvedValueOnce({ text: '{"subject":"Hello"}', tokens: 2 })
    .mockResolvedValueOnce({
      text: '{"subject":"Hello","confidence":0.8}',
      tokens: 3,
    });
  const result = await structured(
    z.object({ subject: z.string(), confidence: z.number() }),
    "Write a subject",
    "test",
    { complete },
  );
  expect(result.value.confidence).toBe(0.8);
  expect(result.tokens).toBe(5);
  expect(complete.mock.calls[1][1]).toContain(
    "Correct these fields: confidence",
  );
});
