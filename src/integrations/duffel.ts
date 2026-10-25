import { getArray, getObject, getString, readProviderJson } from "./http";
import type { FlightOffer, FlightSearchInput } from "./types";

export class DuffelFlightAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://api.duffel.com"
  ) {
    if (!accessToken) {
      throw new Error("DUFFEL_ACCESS_TOKEN is required");
    }
  }

  async search(input: FlightSearchInput): Promise<FlightOffer[]> {
    const slices = [
      {
        origin: input.origin,
        destination: input.destination,
        departure_date: input.departureDate
      }
    ];
    if (input.returnDate) {
      slices.push({
        origin: input.destination,
        destination: input.origin,
        departure_date: input.returnDate
      });
    }

    const response = await this.fetcher(`${this.baseUrl}/air/offer_requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2"
      },
      body: JSON.stringify({
        data: {
          slices,
          passengers: Array.from({ length: input.adults }, () => ({ type: "adult" })),
          cabin_class: "economy"
        }
      })
    });
    const body = await readProviderJson(response, "Duffel");
    const data = getObject(body.data, "data");
    return getArray(data.offers, "offers").map((rawOffer) => {
      const offer = getObject(rawOffer, "offer");
      const owner = getObject(offer.owner, "offer.owner");
      return {
        id: getString(offer.id, "offer.id"),
        totalAmount: getString(offer.total_amount, "offer.total_amount"),
        currency: getString(offer.total_currency, "offer.total_currency"),
        owner: getString(owner.name, "offer.owner.name")
      };
    });
  }
}
