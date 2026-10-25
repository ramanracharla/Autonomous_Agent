import mongoose from "mongoose";
import { createServer } from "node:http";
import { createApp, eventBroker } from "./app";
import { SimulatedFlightStatusSource, DisruptionMonitor } from "./disruptions/worker";
import { MongoFlightRepository } from "./disruptions/mongoRepository";

const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/icepot";
const statusSource = new SimulatedFlightStatusSource();
const disruptionMonitor = new DisruptionMonitor(
  new MongoFlightRepository(),
  statusSource,
  eventBroker
);
const app = createApp(
  eventBroker,
  process.env.STREAM_AUTH_TOKEN,
  disruptionMonitor,
  undefined,
  () => mongoose.connection.readyState === 1 && eventBroker.isReady
);
const httpServer = createServer(app);

async function start(): Promise<void> {
  await mongoose.connect(mongoUri);
  await eventBroker.connect();
  const pollIntervalMs = Number(process.env.DISRUPTION_POLL_INTERVAL_MS ?? 60_000);
  disruptionMonitor.start(pollIntervalMs);
  httpServer.listen(port, () => {
    console.log(`ICEPOT gateway listening on port ${port}`);
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start ICEPOT gateway", error);
  void mongoose.disconnect();
  void eventBroker.close().catch((closeError: unknown) => {
    console.error("Failed to close Redis event broker after startup failure", closeError);
  });
  process.exitCode = 1;
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down ICEPOT gateway`);
  disruptionMonitor.stop();
  await new Promise<void>((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  await Promise.all([eventBroker.close(), mongoose.disconnect()]);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").catch((error: unknown) => {
    console.error("Gateway shutdown failed", error);
    process.exitCode = 1;
  });
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").catch((error: unknown) => {
    console.error("Gateway shutdown failed", error);
    process.exitCode = 1;
  });
});
