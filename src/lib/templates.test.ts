import { test, expect } from "vitest";
import { analyzeTemplate } from "./templates";
import { MockProvider } from "./llm";
test("explicit placeholders survive analysis and non-verbatim fixed phrases are removed", async () => {
  const a = await analyzeTemplate(
    "Offer",
    "Hi {{name}}, Keep this.",
    new MockProvider([
      JSON.stringify({
        core_message: "Offer",
        cta: "Meet",
        fixed_phrases: ["Keep this.", "Invented"],
        variable_slots: [],
      }),
    ]),
  );
  expect(a.variable_slots[0].name).toBe("name");
  expect(a.fixed_phrases).toEqual(["Keep this."]);
});
test("templates without placeholders accept inferred slots", async () => {
  const a = await analyzeTemplate(
    "Offer",
    "Hi there, can we talk?",
    new MockProvider([
      JSON.stringify({
        core_message: "Offer",
        cta: "Talk",
        fixed_phrases: [],
        variable_slots: [
          {
            name: "greeting",
            description: "Person",
            source_hints: ["name"],
            fallback: "there",
          },
        ],
      }),
    ]),
  );
  expect(a.variable_slots[0].fallback).toBe("there");
});
