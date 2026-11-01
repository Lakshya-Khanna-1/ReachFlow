import { z } from "zod";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    brief: z.string().max(5000).default(""),
    sample: z.string().max(10000).default(""),
    tone: z.string().max(80).default("professional"),
    minWords: z.number().int().min(10).max(500).default(50),
    maxWords: z.number().int().min(10).max(1000).default(150),
    bannedPhrases: z.array(z.string().max(100)).max(50).default([]),
  })
  .refine(
    (v) => v.minWords <= v.maxWords,
    "Minimum words must not exceed maximum",
  );
export const analysisSchema = z.object({
  core_message: z.string(),
  cta: z.string(),
  fixed_phrases: z.array(z.string()),
  variable_slots: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      source_hints: z.array(z.string()),
      fallback: z.string(),
    }),
  ),
});
export const generatedSchema = z.object({
  subject: z.string().min(1).max(70),
  body: z.string().min(1).max(12000),
  used_fields: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  notes: z.string().default(""),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Generated = z.infer<typeof generatedSchema>;
