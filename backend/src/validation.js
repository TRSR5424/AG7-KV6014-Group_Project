const { z } = require("zod");

const symptoms = [
  "pain",
  "temperature",
  "cough",
  "breathing",
  "fatigue",
  "nausea",
  "headache",
  "other"
];

const entrySchema = z.object({
  ratings: z.record(z.coerce.number().int().min(0).max(10)).refine(
    (ratings) => Object.keys(ratings).length > 0 && Object.keys(ratings).every((key) => symptoms.includes(key)),
    "Ratings must contain at least one supported symptom"
  ),
  medications: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(2000).default(""),
  correctionOf: z.string().uuid().optional()
});

const activateSchema = z.object({
  token: z.string().min(32).max(256),
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  consentGiven: z.literal(true)
});

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128)
});

const reviewSchema = z.object({
  priority: z.coerce.number().int().min(0).max(10).nullable().optional(),
  flagged: z.boolean().optional(),
  privateNotes: z.string().trim().max(4000).optional()
});

const inviteSchema = z.object({
  email: z.string().email().max(320),
  scheduledAt: z.string().datetime()
});

module.exports = { symptoms, entrySchema, activateSchema, loginSchema, reviewSchema, inviteSchema };
