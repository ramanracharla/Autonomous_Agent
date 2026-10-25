import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });

export const agentThoughtSchema = z
  .object({
    type: z.literal("agent_thought"),
    timestamp,
    step: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(2000)
  })
  .strict();

export const itineraryDraftSchema = z
  .object({
    type: z.literal("itinerary_draft"),
    tripId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    totalCost: z.number().finite().nonnegative(),
    status: z.literal("DRAFT_READY")
  })
  .strict();

export const agentErrorSchema = z
  .object({
    type: z.literal("agent_error"),
    timestamp,
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(2000)
  })
  .strict();

export const disruptionAlertSchema = z
  .object({
    type: z.literal("disruption_alert"),
    timestamp,
    bookingId: z.string().regex(/^[a-fA-F0-9]{24}$/),
    status: z.enum(["DELAYED", "CANCELLED"]),
    delayMinutes: z.number().int().positive().optional(),
    message: z.string().trim().min(1).max(2000)
  })
  .strict();

export const tripEventSchema = z.discriminatedUnion("type", [
  agentThoughtSchema,
  itineraryDraftSchema,
  agentErrorSchema,
  disruptionAlertSchema
]);

export type TripEvent = z.infer<typeof tripEventSchema>;

export const tripIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
