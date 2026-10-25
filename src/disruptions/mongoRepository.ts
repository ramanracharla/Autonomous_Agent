import { Types } from "mongoose";
import { BookingModel } from "../models/booking";
import type { FlightRepository, MonitoredFlight } from "./worker";

export class MongoFlightRepository implements FlightRepository {
  async createSandboxFlight(): Promise<MonitoredFlight> {
    const bookingId = new Types.ObjectId();
    const tripId = new Types.ObjectId();
    await BookingModel.create({
      _id: bookingId,
      tripId,
      type: "FLIGHT",
      provider: "ICEPOT_SANDBOX",
      providerReference: `sandbox-${bookingId.toString()}`,
      status: "CONFIRMED",
      flightDetails: {
        airline: "ICEPOT Sandbox Airways",
        flightNumber: "IP100",
        origin: "SFO",
        destination: "NRT",
        departureTime: new Date("2026-11-10T11:00:00Z"),
        arrivalTime: new Date("2026-11-11T15:00:00Z")
      },
      price: { amount: 850, currency: "USD" }
    });
    return {
      bookingId: bookingId.toString(),
      tripId: tripId.toString(),
      flightNumber: "IP100",
      departureTime: new Date("2026-11-10T11:00:00Z")
    };
  }

  async listConfirmedFlights(): Promise<MonitoredFlight[]> {
    const bookings = await BookingModel.find({
      type: "FLIGHT",
      status: "CONFIRMED"
    })
      .select({ tripId: 1, flightDetails: 1 })
      .lean()
      .exec();
    return bookings.flatMap((booking) => {
      const details = booking.flightDetails;
      if (!details?.flightNumber || !details.departureTime) return [];
      return [
        {
          bookingId: booking._id.toString(),
          tripId: booking.tripId.toString(),
          flightNumber: details.flightNumber,
          departureTime: new Date(details.departureTime)
        }
      ];
    });
  }

  async findConfirmedFlight(bookingId: string): Promise<MonitoredFlight | null> {
    const booking = await BookingModel.findOne({
      _id: bookingId,
      type: "FLIGHT",
      status: "CONFIRMED"
    })
      .select({ tripId: 1, flightDetails: 1 })
      .lean()
      .exec();
    if (!booking?.flightDetails?.flightNumber || !booking.flightDetails.departureTime) {
      return null;
    }
    return {
      bookingId: booking._id.toString(),
      tripId: booking.tripId.toString(),
      flightNumber: booking.flightDetails.flightNumber,
      departureTime: new Date(booking.flightDetails.departureTime)
    };
  }
}
