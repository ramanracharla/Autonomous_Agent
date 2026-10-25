import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { EventBroker } from "../src/events/broker";
import type { TripEvent } from "../src/events/types";

class TestEventBroker implements EventBroker {
  private readonly subscriptions = new Map<string, Set<(event: TripEvent) => void>>();

  async subscribe(
    tripId: string,
    handler: (event: TripEvent) => void
  ): Promise<() => Promise<void>> {
    const handlers = this.subscriptions.get(tripId) ?? new Set();
    handlers.add(handler);
    this.subscriptions.set(tripId, handlers);
    return async () => {
      handlers.delete(handler);
    };
  }

  async publish(tripId: string, event: TripEvent): Promise<void> {
    for (const handler of this.subscriptions.get(tripId) ?? []) handler(event);
  }
}

const tripId = "65f1a2b3c4d5e6f7a8b9c0b2";
const testToken = "phase6-test-token-that-is-long-enough";

describe("trip event routes", () => {
  it("rejects malformed trip IDs before opening an SSE connection", async () => {
    const app = createApp(new TestEventBroker(), testToken);
    const response = await fetchWithServer(app, async (baseUrl) =>
      fetch(`${baseUrl}/api/v1/trips/not-an-object-id/stream`, {
        headers: { Authorization: `Bearer ${testToken}` }
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Invalid tripId" });
  });

  it("publishes sandbox events and delivers them on the SSE stream", async () => {
    const broker = new TestEventBroker();
    const app = createApp(broker, testToken);
    const server = createServer(app);
    await listen(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const controller = new AbortController();

    try {
      const streamResponsePromise = fetch(`${baseUrl}/api/v1/trips/${tripId}/stream`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${testToken}` }
      });
      const streamResponse = await streamResponsePromise;
      expect(streamResponse.status).toBe(200);
      expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
      const reader = streamResponse.body!.getReader();
      const connected = await reader.read();
      expect(new TextDecoder().decode(connected.value)).toContain(": connected");

      const publishResponse = await fetch(
        `${baseUrl}/api/v1/sandbox/trips/${tripId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "agent_thought",
            timestamp: "2026-10-24T10:05:02Z",
            step: "ANALYZING_FLIGHTS",
            message: "Comparing available routes."
          })
        }
      );
      expect(publishResponse.status).toBe(202);
      const event = await reader.read();
      const eventText = new TextDecoder().decode(event.value);
      expect(eventText).toContain("event: agent_thought");
      expect(eventText).toContain('"step":"ANALYZING_FLIGHTS"');
      controller.abort();
      await reader.cancel().catch(() => undefined);
    } finally {
      controller.abort();
      await closeServer(server);
    }
  });

  it("rejects sandbox events whose itinerary trip ID does not match the route", async () => {
    const app = createApp(new TestEventBroker());
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/sandbox/trips/${tripId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "itinerary_draft",
          tripId: "65f1a2b3c4d5e6f7a8b9c0a1",
          totalCost: 3240,
          status: "DRAFT_READY"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("requires bearer authentication for trip event streams", async () => {
    const app = createApp(new TestEventBroker(), testToken);
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/trips/${tripId}/stream`)
    );

    expect(response.status).toBe(401);
  });

  it("does not enable trip event streams without an auth token", async () => {
    const app = createApp(new TestEventBroker(), "");
    const response = await fetchWithServer(app, (baseUrl) =>
      fetch(`${baseUrl}/api/v1/trips/${tripId}/stream`)
    );

    expect(response.status).toBe(503);
  });
});

async function fetchWithServer(
  app: ReturnType<typeof createApp>,
  send: (baseUrl: string) => Promise<Response>
): Promise<Response> {
  const server = createServer(app);
  await listen(server);
  const address = server.address() as AddressInfo;
  try {
    return await send(`http://127.0.0.1:${address.port}`);
  } finally {
    await closeServer(server);
  }
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
