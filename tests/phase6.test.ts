import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { EventBroker } from "../src/events/broker";
import type { TripEvent } from "../src/events/types";
import {
  DisruptionMonitor,
  SimulatedFlightStatusSource,
  type FlightRepository,
  type MonitoredFlight
} from "../src/disruptions/worker";
import { LocalPdfExporter } from "../src/export/pdf";

const tripId = "65f1a2b3c4d5e6f7a8b9c0b2";
const bookingId = "65f1a2b3c4d5e6f7a8b9c0c3";
const testToken = "phase6-test-token-that-is-long-enough";

class MemoryBroker implements EventBroker {
  readonly events: Array<{ tripId: string; event: TripEvent }> = [];

  async subscribe(): Promise<() => Promise<void>> {
    return async () => undefined;
  }

  async publish(eventTripId: string, event: TripEvent): Promise<void> {
    this.events.push({ tripId: eventTripId, event });
  }
}

class MemoryFlightRepository implements FlightRepository {
  readonly flight: MonitoredFlight = {
    bookingId,
    tripId,
    flightNumber: "NH007",
    departureTime: new Date("2026-11-10T11:00:00Z")
  };

  async listConfirmedFlights(): Promise<MonitoredFlight[]> {
    return [this.flight];
  }

  async findConfirmedFlight(id: string): Promise<MonitoredFlight | null> {
    return id === bookingId ? this.flight : null;
  }

  async createSandboxFlight(): Promise<MonitoredFlight> {
    return this.flight;
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("Phase 6 disruption monitoring", () => {
  it("publishes one delay alert when status changes and avoids duplicate alerts", async () => {
    const broker = new MemoryBroker();
    const source = new SimulatedFlightStatusSource();
    const monitor = new DisruptionMonitor(new MemoryFlightRepository(), source, broker);

    await monitor.pollOnce();
    source.setStatus(bookingId, "DELAYED");
    await monitor.pollOnce();
    await monitor.pollOnce();

    expect(broker.events).toHaveLength(1);
    expect(broker.events[0].tripId).toBe(tripId);
    expect(broker.events[0].event).toMatchObject({
      type: "disruption_alert",
      bookingId,
      status: "DELAYED",
      delayMinutes: 120
    });
  });

  it("simulates a cancellation through the development endpoint", async () => {
    const broker = new MemoryBroker();
    const monitor = new DisruptionMonitor(
      new MemoryFlightRepository(),
      new SimulatedFlightStatusSource(),
      broker
    );
    const app = createApp(broker, testToken, monitor);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/sandbox/disruptions/${bookingId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" })
      })
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      success: true,
      mode: "sandbox",
      status: "CANCELLED",
      alertPublished: true
    });
    expect(broker.events[0].event).toMatchObject({
      type: "disruption_alert",
      status: "CANCELLED"
    });
  });

  it("creates a sandbox confirmed flight fixture", async () => {
    const repository = new MemoryFlightRepository();
    const broker = new MemoryBroker();
    const monitor = new DisruptionMonitor(
      repository,
      new SimulatedFlightStatusSource(),
      broker
    );
    const app = createApp(broker, testToken, monitor);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/sandbox/disruptions/bookings`, { method: "POST" })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      mode: "sandbox",
      bookingId,
      tripId,
      flightNumber: "NH007"
    });
  });

  it("disables disruption simulation in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const broker = new MemoryBroker();
    const monitor = new DisruptionMonitor(
      new MemoryFlightRepository(),
      new SimulatedFlightStatusSource(),
      broker
    );
    const app = createApp(broker, testToken, monitor);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/sandbox/disruptions/${bookingId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" })
      })
    );

    expect(response.status).toBe(404);
    expect(broker.events).toHaveLength(0);
  });
});

describe("Phase 6 local itinerary PDF export", () => {
  it("requires bearer authentication", async () => {
    const app = createApp(new MemoryBroker(), testToken);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/trips/${tripId}/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validItinerary)
      })
    );

    expect(response.status).toBe(401);
  });

  it("writes and returns a PDF for a validated itinerary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "icepot-pdf-test-"));
    try {
      const app = createApp(
        new MemoryBroker(),
        testToken,
        undefined,
        new LocalPdfExporter(directory)
      );
      const response = await fetchWithServer(app, (baseUrl) =>
        fetch(`${baseUrl}/api/v1/trips/${tripId}/export/pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testToken}`
          },
          body: JSON.stringify(validItinerary)
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(`trip-${tripId}.pdf`);
      const download = Buffer.from(await response.arrayBuffer());
      expect(download.subarray(0, 4).toString()).toBe("%PDF");

      const saved = await readFile(join(directory, `trip-${tripId}.pdf`));
      expect(saved.subarray(0, 4).toString()).toBe("%PDF");
      expect(saved.equals(download)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns an explicit error when local PDF storage fails", async () => {
    const exporter = {
      export: vi.fn().mockRejectedValue(new Error("disk unavailable"))
    };
    const app = createApp(new MemoryBroker(), testToken, undefined, exporter);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/trips/${tripId}/export/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`
        },
        body: JSON.stringify(validItinerary)
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unable to export itinerary PDF"
    });
  });

  it("rejects invalid itinerary data before writing a file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "icepot-pdf-test-"));
    try {
      const app = createApp(
        new MemoryBroker(),
        testToken,
        undefined,
        new LocalPdfExporter(directory)
      );
      const response = await fetchWithServer(app, (baseUrl) =>
        fetch(`${baseUrl}/api/v1/trips/${tripId}/export/pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testToken}`
          },
          body: JSON.stringify({ ...validItinerary, days: [] })
        })
      );

      expect(response.status).toBe(400);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

const validItinerary = {
  title: "Tokyo at an easy pace",
  summary: "A thoughtful five-day city itinerary.",
  currency: "USD",
  estimatedTotalCost: 1200,
  days: [
    {
      date: "2026-11-10",
      title: "Arrival and first wander",
      activities: ["Check in", "Explore the neighborhood"]
    },
    {
      date: "2026-11-11",
      title: "Markets and museums",
      activities: ["Visit a local market"]
    }
  ]
};

async function fetchWithServer(
  app: ReturnType<typeof createApp>,
  send: (baseUrl: string) => Promise<Response>
): Promise<Response> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    return await send(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
