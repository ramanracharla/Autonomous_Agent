import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, createApp } from "../src/app";
import type { EventBroker } from "../src/events/broker";
import type { TripEvent } from "../src/events/types";

const testBroker: EventBroker = {
  async subscribe(): Promise<() => Promise<void>> {
    return async () => undefined;
  },
  async publish(_tripId: string, _event: TripEvent): Promise<void> {}
};

describe("GET /api/v1/health", () => {
  it("returns gateway health without requiring a database connection", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      service: "icepot-api-gateway",
      status: "UP"
    });
  });

  it("reports dependency readiness separately from liveness", async () => {
    const notReadyApp = createApp(testBroker, undefined, undefined, undefined, () => false);
    const notReady = await request(notReadyApp).get("/api/v1/ready");
    expect(notReady.status).toBe(503);
    expect(notReady.body.status).toBe("NOT_READY");

    const readyApp = createApp(testBroker, undefined, undefined, undefined, () => true);
    const ready = await request(readyApp).get("/api/v1/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("READY");
  });
});
