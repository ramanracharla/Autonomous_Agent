import { Router } from "express";
import { z } from "zod";
import {
  createSandboxPaymentIntent,
  searchSandboxFlights,
  searchSandboxHotels
} from "../integrations/sandbox";

export const integrationsRouter = Router();

const isoDate = z.string().date();
const flightSearchSchema = z
  .object({
    origin: z.string().trim().regex(/^[A-Za-z]{3}$/),
    destination: z.string().trim().regex(/^[A-Za-z]{3}$/),
    departureDate: isoDate,
    returnDate: isoDate.optional(),
    adults: z.number().int().min(1).max(9)
  })
  .strict()
  .refine(
    (input) => !input.returnDate || input.returnDate >= input.departureDate,
    "returnDate must be on or after departureDate"
  );

const hotelSearchSchema = z
  .object({
    cityCode: z.string().trim().regex(/^[A-Za-z]{3}$/),
    checkInDate: isoDate,
    checkOutDate: isoDate,
    adults: z.number().int().min(1).max(9)
  })
  .strict()
  .refine((input) => input.checkOutDate > input.checkInDate, {
    message: "checkOutDate must be after checkInDate"
  });

const paymentIntentSchema = z
  .object({
    amount: z.number().int().min(50),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).default("USD"),
    tripId: z.string().trim().min(1).max(100)
  })
  .strict();

integrationsRouter.use("/sandbox", (request, response, next) => {
  if (process.env.NODE_ENV === "production") {
    response.sendStatus(404);
    return;
  }
  next();
});

integrationsRouter.post("/sandbox/flights/search", (request, response) => {
  const parsed = flightSearchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  response.status(200).json({
    success: true,
    mode: "sandbox",
    provider: "Duffel",
    offers: searchSandboxFlights(parsed.data)
  });
});

integrationsRouter.post("/sandbox/hotels/search", (request, response) => {
  const parsed = hotelSearchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  response.status(200).json({
    success: true,
    mode: "sandbox",
    provider: "Amadeus",
    offers: searchSandboxHotels(parsed.data)
  });
});

integrationsRouter.post("/sandbox/payments/intents", (request, response) => {
  const parsed = paymentIntentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  const result = createSandboxPaymentIntent({
    ...parsed.data,
    currency: parsed.data.currency.toLowerCase()
  });
  response.status(201).json({
    success: true,
    mode: "sandbox",
    provider: "Stripe",
    paymentIntent: result
  });
});
