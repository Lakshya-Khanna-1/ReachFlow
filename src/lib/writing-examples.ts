import { z } from "zod";

export const writingExamplesSchema = z
  .array(
    z.object({
      category: z.string().max(120),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(2500),
    }),
  )
  .max(15);

export function selectWritingExamples(
  saved: string | undefined,
  row: Record<string, string>,
) {
  if (!saved) return [];
  const examples = writingExamplesSchema.parse(JSON.parse(saved));
  const words = new Set(
    (row.vertical_category ?? "").toLowerCase().match(/[a-z]{3,}/g) ?? [],
  );
  // Two relevant examples leave room for the lead and output on small local models.
  return examples
    .map((example, index) => ({
      example,
      index,
      score: (example.category.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
        (word) => words.has(word),
      ).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .map(({ example }) => example);
}
