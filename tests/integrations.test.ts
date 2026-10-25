import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { AmadeusHotelAdapter } from "../src/integrations/amadeus";
import { DuffelFlightAdapter } from "../src/integrations/duffel";
import { StripePaymentAdapter } from "../src/integrations/stripe";

describe("sandbox integration routes", () => {
  it("returns sandbox flight offers", async () => {
    const response = await request(app)
      .post("/api/v1/sandbox/flights/search")
      .send({
        origin: "SFO",
        destination: "NRT",
        departureDate: "2026-11-10",
        returnDate: "2026-11-15",
        adults: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("sandbox");
    expect(response.body.offers[0].id).toBe("sandbox-flight-001");
  });

  it("rejects invalid flight search input", async () => {
    const response = await request(app)
      .post("/api/v1/sandbox/flights/search")
      .send({
        origin: "SFO",
        destination: "SFO",
        departureDate: "not-a-date",
        adults: 0
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("returns sandbox hotel offers", async () => {
    const response = await request(app)
      .post("/api/v1/sandbox/hotels/search")
      .send({
        cityCode: "TYO",
        checkInDate: "2026-11-10",
        checkOutDate: "2026-11-12",
        adults: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBe("Amadeus");
    expect(response.body.offers[0].id).toBe("sandbox-hotel-001");
  });

  it("creates a sandbox payment intent without calling Stripe", async () => {
    const response = await request(app)
      .post("/api/v1/sandbox/payments/intents")
      .send({ amount: 1200, currency: "USD", tripId: "trip-123" });

    expect(response.status).toBe(201);
    expect(response.body.mode).toBe("sandbox");
    expect(response.body.paymentIntent.id).toBe("pi_sandbox_trip-123");
  });

  it("does not expose sandbox operations in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = await request(app)
        .post("/api/v1/sandbox/payments/intents")
        .send({ amount: 1200, currency: "USD", tripId: "trip-123" });

      expect(response.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("travel provider adapters", () => {
  it("sends flight search to Duffel and maps returned offers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            offers: [
              {
                id: "off_123",
                total_amount: "850.00",
                total_currency: "USD",
                owner: { name: "Example Air" }
              }
            ]
          }
        }),
        { status: 200 }
      )
    );
    const adapter = new DuffelFlightAdapter("test_token", fetcher);

    const offers = await adapter.search({
      origin: "SFO",
      destination: "NRT",
      departureDate: "2026-11-10",
      adults: 1
    });

    expect(offers).toEqual([
      { id: "off_123", totalAmount: "850.00", currency: "USD", owner: "Example Air" }
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    const requestInit = fetcher.mock.calls[0][1];
    expect(requestInit?.method).toBe("POST");
    expect(String(requestInit?.body)).toContain('"destination":"NRT"');
  });

  it("authenticates and searches hotel offers through Amadeus", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "test-token", expires_in: 1800 }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ hotelId: "hotel-1" }] }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                hotel: { name: "Example Hotel" },
                offers: [
                  {
                    id: "hotel-offer-1",
                    price: { total: "420.00", currency: "USD" }
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      );
    const adapter = new AmadeusHotelAdapter("client-id", "client-secret", fetcher);

    const offers = await adapter.search({
      cityCode: "TYO",
      checkInDate: "2026-11-10",
      checkOutDate: "2026-11-12",
      adults: 1
    });

    expect(offers).toEqual([
      {
        id: "hotel-offer-1",
        hotelName: "Example Hotel",
        totalAmount: "420.00",
        currency: "USD"
      }
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain("client_secret=client-secret");
    expect(String(fetcher.mock.calls[2][0])).toContain("hotelIds=hotel-1");
  });

  it("validates Stripe amounts before calling its payment client", async () => {
    const createIntent = vi.fn(async (amount: number, currency: string, tripId: string) => ({
      id: `pi_${tripId}`,
      clientSecret: null,
      status: `${amount}_${currency}`
    }));
    const adapter = new StripePaymentAdapter("", createIntent);

    expect(() =>
      adapter.createPaymentIntent({ amount: 1, currency: "usd", tripId: "trip-1" })
    ).toThrow("at least 50");
    expect(createIntent).not.toHaveBeenCalled();

    await expect(
      adapter.createPaymentIntent({ amount: 500, currency: "usd", tripId: "trip-1" })
    ).resolves.toEqual({
      id: "pi_trip-1",
      clientSecret: null,
      status: "500_usd"
    });
  });
});
