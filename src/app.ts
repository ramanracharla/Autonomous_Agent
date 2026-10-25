import express from "express";
import type { DisruptionMonitor } from "./disruptions/worker";
import type { PdfExporter } from "./export/pdf";
import { RedisEventBroker, type EventBroker } from "./events/broker";
import { createHealthRouter } from "./routes/health";
import { integrationsRouter } from "./routes/integrations";
import { createTripsRouter } from "./routes/trips";

export function createApp(
  broker: EventBroker,
  streamToken?: string,
  disruptionMonitor?: DisruptionMonitor,
  pdfExporter?: PdfExporter,
  readinessCheck?: () => boolean
): express.Express {
  const app = express();

  app.use(express.json());
  app.use("/api/v1", createHealthRouter(readinessCheck));
  app.use("/api/v1", integrationsRouter);
  app.use(
    "/api/v1",
    createTripsRouter(broker, streamToken, disruptionMonitor, pdfExporter)
  );
  return app;
}

export const eventBroker = new RedisEventBroker(
  process.env.REDIS_URL ?? "redis://localhost:6379"
);
export const app = createApp(eventBroker);
