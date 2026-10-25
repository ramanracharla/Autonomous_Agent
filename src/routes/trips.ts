import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import { itineraryExportSchema } from "../export/schema";
import { LocalPdfExporter } from "../export/pdf";
import type { PdfExporter } from "../export/pdf";
import type { EventBroker } from "../events/broker";
import {
  agentErrorSchema,
  agentThoughtSchema,
  disruptionAlertSchema,
  itineraryDraftSchema,
  tripIdSchema
} from "../events/types";
import type { DisruptionMonitor } from "../disruptions/worker";

const sandboxEventSchema = z.discriminatedUnion("type", [
  agentThoughtSchema,
  itineraryDraftSchema,
  agentErrorSchema,
  disruptionAlertSchema
]);

export function createTripsRouter(
  broker: EventBroker,
  streamToken = process.env.STREAM_AUTH_TOKEN,
  disruptionMonitor?: DisruptionMonitor,
  pdfExporter: PdfExporter = new LocalPdfExporter()
): Router {
  const router = Router();

  router.get("/trips/:tripId/stream", async (request, response) => {
    if (!authorize(request, response, streamToken)) {
      return;
    }

    const tripId = tripIdSchema.safeParse(request.params.tripId);
    if (!tripId.success) {
      response.status(400).json({ success: false, error: "Invalid tripId" });
      return;
    }

    let unsubscribe: (() => Promise<void>) | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let streamReady = false;
    const pendingEvents: string[] = [];
    try {
      unsubscribe = await broker.subscribe(tripId.data, (event) => {
        const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        if (streamReady) {
          response.write(message);
        } else {
          pendingEvents.push(message);
        }
      });
      response.status(200);
      response.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      response.flushHeaders();
      response.write(": connected\n\n");
      streamReady = true;
      for (const event of pendingEvents) response.write(event);
      heartbeat = setInterval(() => {
        response.write(": keep-alive\n\n");
      }, 20_000);
    } catch (error) {
      console.error("Failed to subscribe to trip event stream", error);
      response.status(503).json({
        success: false,
        error: "Trip event stream is unavailable"
      });
      return;
    }

    response.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) {
        void unsubscribe().catch((error: unknown) => {
          console.error("Failed to close trip event subscription", error);
        });
      }
    });
  });

  router.post("/sandbox/trips/:tripId/events", async (request, response) => {
    if (process.env.NODE_ENV === "production") {
      response.sendStatus(404);
      return;
    }
    const tripId = tripIdSchema.safeParse(request.params.tripId);
    const event = sandboxEventSchema.safeParse(request.body);
    if (!tripId.success || !event.success) {
      response.status(400).json({
        success: false,
        error: !tripId.success
          ? "Invalid tripId"
          : event.success
            ? "Invalid event"
            : event.error.issues[0].message
      });
      return;
    }
    if (event.data.type === "itinerary_draft" && event.data.tripId !== tripId.data) {
      response.status(400).json({
        success: false,
        error: "Event tripId must match the route tripId"
      });
      return;
    }
    try {
      await broker.publish(tripId.data, event.data);
      response.status(202).json({ success: true, mode: "sandbox", published: true });
    } catch (error) {
      console.error("Failed to publish sandbox trip event", error);
      response.status(503).json({
        success: false,
        error: "Trip event broker is unavailable"
      });
    }
  });

  router.post("/trips/:tripId/export/pdf", async (request, response) => {
    if (!authorize(request, response, streamToken)) return;
    const tripId = tripIdSchema.safeParse(request.params.tripId);
    const itinerary = itineraryExportSchema.safeParse(request.body);
    if (!tripId.success || !itinerary.success) {
      response.status(400).json({
        success: false,
        error: !tripId.success
          ? "Invalid tripId"
          : itinerary.success
            ? "Invalid itinerary"
            : itinerary.error.issues[0].message
      });
      return;
    }
    try {
      const savedPath = await pdfExporter.export(tripId.data, itinerary.data);
      const filename = `trip-${tripId.data}.pdf`;
      const pdf = await readFile(savedPath);
      response
        .status(200)
        .type("application/pdf")
        .set("Content-Disposition", `attachment; filename="${filename}"`)
        .send(pdf);
    } catch (error) {
      console.error("Failed to export itinerary PDF", error);
      response.status(500).json({
        success: false,
        error: "Unable to export itinerary PDF"
      });
    }
  });

  router.post("/sandbox/disruptions/:bookingId/simulate", async (request, response) => {
    if (process.env.NODE_ENV === "production") {
      response.sendStatus(404);
      return;
    }
    if (!disruptionMonitor) {
      response.status(503).json({
        success: false,
        error: "Disruption simulation is not configured"
      });
      return;
    }
    const bookingId = z
      .string()
      .regex(/^[a-fA-F0-9]{24}$/)
      .safeParse(request.params.bookingId);
    const body = z
      .object({ status: z.enum(["DELAYED", "CANCELLED"]) })
      .strict()
      .safeParse(request.body);
    if (!bookingId.success || !body.success) {
      response.status(400).json({
        success: false,
        error: !bookingId.success
          ? "Invalid bookingId"
          : body.success
            ? "Invalid disruption status"
            : body.error.issues[0].message
      });
      return;
    }
    try {
      const found = await disruptionMonitor.simulateStatus(
        bookingId.data,
        body.data.status
      );
      if (!found) {
        response.status(404).json({
          success: false,
          error: "Confirmed flight booking not found"
        });
        return;
      }
      response.status(202).json({
        success: true,
        mode: "sandbox",
        status: body.data.status,
        alertPublished: true
      });
    } catch (error) {
      console.error("Failed to simulate flight disruption", error);
      response.status(503).json({
        success: false,
        error: "Unable to simulate flight disruption"
      });
    }
  });

  router.post("/sandbox/disruptions/bookings", async (_request, response) => {
    if (process.env.NODE_ENV === "production") {
      response.sendStatus(404);
      return;
    }
    if (!disruptionMonitor) {
      response.status(503).json({
        success: false,
        error: "Disruption simulation is not configured"
      });
      return;
    }
    try {
      const booking = await disruptionMonitor.createSandboxFlight();
      response.status(201).json({
        success: true,
        mode: "sandbox",
        bookingId: booking.bookingId,
        tripId: booking.tripId,
        flightNumber: booking.flightNumber
      });
    } catch (error) {
      console.error("Failed to create sandbox flight booking", error);
      response.status(503).json({
        success: false,
        error: "Unable to create sandbox flight booking"
      });
    }
  });

  return router;
}

function authorize(
  request: import("express").Request,
  response: import("express").Response,
  token?: string
): boolean {
  if (!token || Buffer.byteLength(token) < 32) {
    response.status(503).json({
      success: false,
      error: "Trip access authentication is not configured with a strong token"
    });
    return false;
  }
  const authorization = request.header("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expected = Buffer.from(token);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    response.status(401).json({ success: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
