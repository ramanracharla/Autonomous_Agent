import type { EventBroker } from "../events/broker";
import type { TripEvent } from "../events/types";

export type FlightStatus = "SCHEDULED" | "DELAYED" | "CANCELLED";

export interface MonitoredFlight {
  bookingId: string;
  tripId: string;
  flightNumber: string;
  departureTime: Date;
}

export interface FlightRepository {
  listConfirmedFlights(): Promise<MonitoredFlight[]>;
  findConfirmedFlight(bookingId: string): Promise<MonitoredFlight | null>;
  createSandboxFlight?(): Promise<MonitoredFlight>;
}

export interface FlightStatusProvider {
  getStatus(flight: MonitoredFlight): Promise<{
    status: FlightStatus;
    delayMinutes?: number;
  }>;
}

export interface SimulatedFlightStatusProvider extends FlightStatusProvider {
  setStatus(bookingId: string, status: FlightStatus): void;
}

export class SimulatedFlightStatusSource implements SimulatedFlightStatusProvider {
  private readonly statuses = new Map<string, FlightStatus>();

  setStatus(bookingId: string, status: FlightStatus): void {
    this.statuses.set(bookingId, status);
  }

  async getStatus(flight: MonitoredFlight): Promise<{
    status: FlightStatus;
    delayMinutes?: number;
  }> {
    const status = this.statuses.get(flight.bookingId) ?? "SCHEDULED";
    return status === "DELAYED"
      ? { status, delayMinutes: 120 }
      : { status };
  }
}

export class DisruptionMonitor {
  private readonly lastStatuses = new Map<string, FlightStatus>();
  private interval?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly repository: FlightRepository,
    private readonly provider: FlightStatusProvider,
    private readonly broker: EventBroker
  ) {}

  start(intervalMs: number): void {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
      throw new Error("Disruption poll interval must be at least 1000ms");
    }
    if (this.interval) return;
    this.interval = setInterval(() => {
      void this.pollOnce().catch((error: unknown) => {
        console.error("Flight disruption polling failed", error);
      });
    }, intervalMs);
    this.interval.unref();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const flights = await this.repository.listConfirmedFlights();
      const results = await Promise.allSettled(
        flights.map((flight) => this.pollFlight(flight))
      );
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Failed to poll a confirmed flight", result.reason);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  async simulateStatus(
    bookingId: string,
    status: FlightStatus
  ): Promise<boolean> {
    if (!isSimulatedProvider(this.provider)) {
      throw new Error("Flight disruption simulation is not enabled");
    }
    const flight = await this.repository.findConfirmedFlight(bookingId);
    if (!flight) return false;
    this.provider.setStatus(bookingId, status);
    await this.pollFlight(flight);
    return true;
  }

  async createSandboxFlight(): Promise<MonitoredFlight> {
    if (!this.repository.createSandboxFlight) {
      throw new Error("Sandbox flight booking creation is not configured");
    }
    return this.repository.createSandboxFlight();
  }

  private async pollFlight(flight: MonitoredFlight): Promise<void> {
    const current = await this.provider.getStatus(flight);
    const previous = this.lastStatuses.get(flight.bookingId) ?? "SCHEDULED";
    this.lastStatuses.set(flight.bookingId, current.status);
    if (
      current.status === "SCHEDULED" ||
      current.status === previous
    ) {
      return;
    }

    const event: TripEvent = {
      type: "disruption_alert",
      timestamp: new Date().toISOString(),
      bookingId: flight.bookingId,
      status: current.status,
      ...(current.status === "DELAYED" && current.delayMinutes
        ? { delayMinutes: current.delayMinutes }
        : {}),
      message:
        current.status === "CANCELLED"
          ? `Flight ${flight.flightNumber} is reported as cancelled. Review rebooking options with your airline.`
          : `Flight ${flight.flightNumber} is delayed by ${current.delayMinutes ?? "an unknown number of"} minutes. Review your connecting plans.`
    };
    await this.broker.publish(flight.tripId, event);
  }
}

function isSimulatedProvider(
  provider: FlightStatusProvider
): provider is SimulatedFlightStatusProvider {
  return "setStatus" in provider && typeof provider.setStatus === "function";
}
