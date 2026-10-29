import { test, expect } from "vitest";
import {
  deterministicGrounding,
  similarity,
  spamFlags,
  generateDraft,
} from "./generation";
import { MockProvider } from "./llm";
const draft = {
  subject: "Hello",
  body: "Your revenue grew 500% after your recent award.",
  used_fields: ["revenue"],
  confidence: 0.9,
  notes: "",
};
test("fabricated numbers, unsupported observations and missing fields are flagged", () => {
  expect(
    deterministicGrounding(
      draft,
      { name: "Ada", email: "ada@example.com" },
      "Hello",
    ),
  ).toEqual(
    expect.arrayContaining([
      "unsupported_number:500%",
      "unsupported_observation",
      "missing_source:revenue",
    ]),
  );
  expect(
    spamFlags(
      { ...draft, body: "FREE MONEY!!! https://bit.ly/a https://x.com" },
      50,
      100,
      [],
      "",
    ),
  ).toContain("shortened_link");
  expect(similarity("Hello there Ada", "Hello there Ada")).toBe(1);
});
test("independent verifier flags unsupported recipient claims", async () => {
  const result = await generateDraft(
    {
      id: "c",
      name: "c",
      brief: "Offer",
      sample: "Hello",
      tone: "friendly",
      minWords: 1,
      maxWords: 100,
      bannedPhrases: [],
      status: "draft",
      createdAt: 0,
    },
    {
      core_message: "Offer",
      cta: "Talk",
      fixed_phrases: [],
      variable_slots: [],
    },
    { name: "Ada", company: "Analytical", email: "ada@example.com" },
    "Reply unsubscribe",
    new MockProvider([
      JSON.stringify({
        ...draft,
        body: "Your business won an award.",
        used_fields: ["company"],
      }),
      JSON.stringify({
        claims: [
          {
            claim: "award",
            field: "company",
            evidence: "won an award",
            supported: false,
          },
        ],
        unsupported_claims: ["award"],
      }),
    ]),
  );
  expect(result.flags).toContain("grounding");
  expect(result.body).toContain("Reply unsubscribe");
});
