import { expect, test } from "vitest";
import { selectWritingExamples } from "./writing-examples";

test("retrieves relevant examples within a small model's context budget", () => {
  const examples = [
    {
      category: "Dental & Implants",
      subject: "Dental",
      body: "Dental example",
    },
    {
      category: "Study Abroad Consultant",
      subject: "Study",
      body: "Study example",
    },
    {
      category: "Visa & Study Abroad",
      subject: "Intake",
      body: "Intake example",
    },
  ];
  expect(
    selectWritingExamples(JSON.stringify(examples), {
      vertical_category: "Study Abroad & Visa Consultant",
    }).map((e) => e.subject),
  ).toEqual(["Study", "Intake"]);
  expect(examples).toHaveLength(3);
  expect(selectWritingExamples(undefined, {})).toEqual([]);
  expect(() =>
    selectWritingExamples(JSON.stringify(Array(16).fill(examples[0])), {}),
  ).toThrow();
  expect(() => selectWritingExamples('{"body":"invalid"}', {})).toThrow();
});
