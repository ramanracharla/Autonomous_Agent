export interface FlightSearchInput {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
}

export interface FlightOffer {
  id: string;
  totalAmount: string;
  currency: string;
  owner: string;
}

export interface HotelSearchInput {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
}

export interface HotelOffer {
  id: string;
  hotelName: string;
  totalAmount: string;
  currency: string;
}

export interface PaymentIntentInput {
  amount: number;
  currency: string;
  tripId: string;
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string | null;
  status: string;
}
