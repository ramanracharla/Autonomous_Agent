import type {
  FlightOffer,
  FlightSearchInput,
  HotelOffer,
  HotelSearchInput,
  PaymentIntentInput,
  PaymentIntentResult
} from "./types";

export function searchSandboxFlights(_input: FlightSearchInput): FlightOffer[] {
  return [
    {
      id: "sandbox-flight-001",
      totalAmount: "850.00",
      currency: "USD",
      owner: "ICEPOT Sandbox Airways"
    }
  ];
}

export function searchSandboxHotels(_input: HotelSearchInput): HotelOffer[] {
  return [
    {
      id: "sandbox-hotel-001",
      hotelName: "ICEPOT Sandbox Hotel",
      totalAmount: "420.00",
      currency: "USD"
    }
  ];
}

export function createSandboxPaymentIntent(
  input: PaymentIntentInput
): PaymentIntentResult {
  return {
    id: `pi_sandbox_${input.tripId}`,
    clientSecret: "sandbox_client_secret_not_for_payment",
    status: "requires_payment_method"
  };
}
