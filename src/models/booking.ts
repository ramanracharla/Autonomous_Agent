import { model, Schema, Types } from "mongoose";

export type BookingType = "FLIGHT" | "HOTEL";
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "FAILED";

export interface Booking {
  tripId: Types.ObjectId;
  type: BookingType;
  provider: string;
  providerReference?: string;
  status: BookingStatus;
  flightDetails?: {
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: Date;
    arrivalTime: Date;
  };
  price: {
    amount: number;
    currency: string;
  };
  createdAt: Date;
}

const bookingSchema = new Schema<Booking>(
  {
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", required: true },
    type: { type: String, enum: ["FLIGHT", "HOTEL"], required: true },
    provider: { type: String, required: true, trim: true },
    providerReference: { type: String, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "FAILED"],
      required: true,
      default: "PENDING"
    },
    flightDetails: {
      airline: String,
      flightNumber: String,
      origin: String,
      destination: String,
      departureTime: Date,
      arrivalTime: Date
    },
    price: {
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, required: true, uppercase: true, trim: true }
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookingSchema.index({ tripId: 1 });

export const BookingModel = model<Booking>("Booking", bookingSchema);
export type BookingId = Types.ObjectId;
