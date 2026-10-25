import { z } from "zod";

export const itineraryExportSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(4000),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
    estimatedTotalCost: z.number().finite().nonnegative().optional(),
    days: z
      .array(
        z
          .object({
            date: z.string().date(),
            title: z.string().trim().min(1).max(200),
            activities: z.array(z.string().trim().min(1).max(500)).min(1).max(30)
          })
          .strict()
      )
      .min(1)
      .max(60)
  })
  .strict();
