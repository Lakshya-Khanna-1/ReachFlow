import { test, expect } from "vitest";
import {
  heuristicMapping,
  proposeMapping,
  mapRow,
  validateMapping,
} from "./mapping";
import { MockProvider } from "./llm";
test("heterogeneous sheets map independently without an LLM", () => {
  expect(heuristicMapping(["e_mail", "full_name", "company"])).toEqual({
    e_mail: "email",
    full_name: "name",
    company: "company",
  });
  expect(heuristicMapping(["contact_email", "person", "business"])).toEqual({
    contact_email: "email",
    person: "name",
    business: "company",
  });
  expect(
    mapRow(
      { person: "Ada", unused: "x" },
      { person: "name", unused: "ignore" },
    ),
  ).toEqual({ name: "Ada" });
  expect(() =>
    validateMapping(["a", "b"], { a: "email", b: "email" }),
  ).toThrow();
});
test("AI mappings are validated and model failure falls back", async () => {
  expect(
    await proposeMapping(
      ["who"],
      [{ who: "Ada" }],
      new MockProvider(['{"mapping":{"who":"name"}}']),
    ),
  ).toEqual({ who: "name" });
  expect(await proposeMapping(["email"], [], new MockProvider([]))).toEqual({
    email: "email",
  });
});
