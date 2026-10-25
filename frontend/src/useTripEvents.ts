import { useEffect, useState } from "react";

export interface AgentThoughtEvent {
  type: "agent_thought";
  timestamp: string;
  step: string;
  message: string;
}

export interface ItineraryDraftEvent {
  type: "itinerary_draft";
  tripId: string;
  totalCost: number;
  status: "DRAFT_READY";
}

export interface AgentErrorEvent {
  type: "agent_error";
  timestamp: string;
  code: string;
  message: string;
}

export interface DisruptionAlertEvent {
  type: "disruption_alert";
  timestamp: string;
  bookingId: string;
  status: "DELAYED" | "CANCELLED";
  delayMinutes?: number;
  message: string;
}

export type TripEvent =
  | AgentThoughtEvent
  | ItineraryDraftEvent
  | AgentErrorEvent
  | DisruptionAlertEvent;

export type StreamStatus = "idle" | "connecting" | "connected" | "error";

interface UseTripEventsResult {
  events: TripEvent[];
  status: StreamStatus;
  error: string | null;
}

export function useTripEvents(
  tripId: string,
  token: string,
  enabled: boolean
): UseTripEventsResult {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setError(null);
    if (!enabled) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("connecting");

    async function connect(): Promise<void> {
      try {
        const response = await fetch(`/api/v1/trips/${encodeURIComponent(tripId)}/stream`, {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const detail =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : `Stream request failed (${response.status})`;
          throw new Error(detail);
        }
        if (!response.body) throw new Error("The stream response has no readable body");
        if (!response.headers.get("content-type")?.includes("text/event-stream")) {
          throw new Error("The server did not return an event stream");
        }
        setStatus("connected");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separatorIndex = buffer.search(/\r?\n\r?\n/);
          while (separatorIndex >= 0) {
            const separator = buffer.match(/\r?\n\r?\n/);
            if (!separator) break;
            const message = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + separator[0].length);
            const event = parseSseMessage(message);
            if (event) setEvents((current) => [...current.slice(-49), event]);
            separatorIndex = buffer.search(/\r?\n\r?\n/);
          }
        }
        if (!controller.signal.aborted) {
          setStatus("error");
          setError("The event stream ended. Reconnect to continue receiving updates.");
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Unable to connect to trip stream");
      }
    }

    void connect();
    return () => controller.abort();
  }, [enabled, token, tripId]);

  return { events, status, error };
}

function parseSseMessage(message: string): TripEvent | null {
  const fields = message.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];
  for (const field of fields) {
    if (field.startsWith(":")) continue;
    const separator = field.indexOf(":");
    if (separator < 0) continue;
    const name = field.slice(0, separator);
    const value = field.slice(separator + 1).replace(/^ /, "");
    if (name === "event") eventName = value;
    if (name === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;

  try {
    const parsed: unknown = JSON.parse(dataLines.join("\n"));
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }
    const eventData = parsed as Record<string, unknown>;
    if (eventData.type !== eventName) return null;
    if (
      eventData.type === "agent_thought" &&
      typeof eventData.timestamp === "string" &&
      typeof eventData.step === "string" &&
      typeof eventData.message === "string"
    ) {
      return {
        type: "agent_thought",
        timestamp: eventData.timestamp,
        step: eventData.step,
        message: eventData.message
      };
    }
    if (
      eventData.type === "itinerary_draft" &&
      typeof eventData.tripId === "string" &&
      typeof eventData.totalCost === "number" &&
      eventData.status === "DRAFT_READY"
    ) {
      return {
        type: "itinerary_draft",
        tripId: eventData.tripId,
        totalCost: eventData.totalCost,
        status: "DRAFT_READY"
      };
    }
    if (
      eventData.type === "agent_error" &&
      typeof eventData.timestamp === "string" &&
      typeof eventData.code === "string" &&
      typeof eventData.message === "string"
    ) {
      return {
        type: "agent_error",
        timestamp: eventData.timestamp,
        code: eventData.code,
        message: eventData.message
      };
    }
    if (
      eventData.type === "disruption_alert" &&
      typeof eventData.timestamp === "string" &&
      typeof eventData.bookingId === "string" &&
      (eventData.status === "DELAYED" || eventData.status === "CANCELLED") &&
      typeof eventData.message === "string" &&
      (eventData.delayMinutes === undefined ||
        (typeof eventData.delayMinutes === "number" &&
          Number.isInteger(eventData.delayMinutes)))
    ) {
      return {
        type: "disruption_alert",
        timestamp: eventData.timestamp,
        bookingId: eventData.bookingId,
        status: eventData.status,
        ...(typeof eventData.delayMinutes === "number"
          ? { delayMinutes: eventData.delayMinutes }
          : {}),
        message: eventData.message
      };
    }
  } catch {
    return null;
  }
  return null;
}
