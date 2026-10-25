import { getArray, getObject, getString, readProviderJson } from "./http";
import type { HotelOffer, HotelSearchInput } from "./types";

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class AmadeusHotelAdapter {
  private token?: CachedToken;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://test.api.amadeus.com"
  ) {
    if (!clientId || !clientSecret) {
      throw new Error("AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are required");
    }
  }

  async search(input: HotelSearchInput): Promise<HotelOffer[]> {
    const token = await this.getToken();
    const hotelUrl = new URL("/v1/reference-data/locations/hotels/by-city", this.baseUrl);
    hotelUrl.searchParams.set("cityCode", input.cityCode);
    const hotelResponse = await this.fetcher(hotelUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const hotelBody = await readProviderJson(hotelResponse, "Amadeus");
    const hotels = getArray(hotelBody.data, "hotel data").slice(0, 10);
    if (hotels.length === 0) return [];

    const hotelIds = hotels.map((rawHotel) => {
      const hotel = getObject(rawHotel, "hotel");
      return getString(hotel.hotelId, "hotel.hotelId");
    });
    const offersUrl = new URL("/v3/shopping/hotel-offers", this.baseUrl);
    offersUrl.searchParams.set("hotelIds", hotelIds.join(","));
    offersUrl.searchParams.set("adults", String(input.adults));
    offersUrl.searchParams.set("checkInDate", input.checkInDate);
    offersUrl.searchParams.set("checkOutDate", input.checkOutDate);
    const offersResponse = await this.fetcher(offersUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const offersBody = await readProviderJson(offersResponse, "Amadeus");
    return getArray(offersBody.data, "hotel offers").map((rawOffer) => {
      const result = getObject(rawOffer, "hotel offer");
      const hotel = getObject(result.hotel, "hotel");
      const offerList = getArray(result.offers, "hotel offers");
      if (offerList.length === 0) {
        throw new Error("Amadeus hotel result does not contain an offer");
      }
      const offer = getObject(offerList[0], "hotel offer");
      const price = getObject(offer.price, "hotel offer price");
      return {
        id: getString(offer.id, "hotel offer id"),
        hotelName: getString(hotel.name, "hotel name"),
        totalAmount: getString(price.total, "hotel offer price total"),
        currency: getString(price.currency, "hotel offer price currency")
      };
    });
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const response = await this.fetcher(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });
    const body = await readProviderJson(response, "Amadeus");
    const accessToken = getString(body.access_token, "access_token");
    const expiresIn = Number(body.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Amadeus API returned an invalid token expiry");
    }
    this.token = {
      value: accessToken,
      expiresAt: Date.now() + expiresIn * 1000
    };
    return accessToken;
  }
}
