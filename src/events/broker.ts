import { createClient, type RedisClientType } from "redis";
import { tripEventSchema, type TripEvent } from "./types";

export interface EventBroker {
  subscribe(
    tripId: string,
    handler: (event: TripEvent) => void
  ): Promise<() => Promise<void>>;
  publish(tripId: string, event: TripEvent): Promise<void>;
}

export class RedisEventBroker implements EventBroker {
  private readonly publisher: RedisClientType;
  private connected = false;

  constructor(redisUrl = "redis://localhost:6379") {
    this.publisher = createClient({ url: redisUrl });
    this.publisher.on("error", (error) => {
      console.error("Redis publisher error", error);
    });
  }

  get isReady(): boolean {
    return this.publisher.isReady;
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.publisher.connect();
      this.connected = true;
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.publisher.quit();
      this.connected = false;
    }
  }

  async publish(tripId: string, event: TripEvent): Promise<void> {
    if (!this.connected) {
      throw new Error("Redis event broker is not connected");
    }
    await this.publisher.publish(channelFor(tripId), JSON.stringify(event));
  }

  async subscribe(
    tripId: string,
    handler: (event: TripEvent) => void
  ): Promise<() => Promise<void>> {
    const subscriber = this.publisher.duplicate();
    subscriber.on("error", (error) => {
      console.error("Redis subscriber error", error);
    });
    await subscriber.connect();
    await subscriber.subscribe(channelFor(tripId), (message) => {
      try {
        const parsed: unknown = JSON.parse(message);
        const result = tripEventSchema.safeParse(parsed);
        if (!result.success) {
          console.error("Ignoring invalid Redis trip event", result.error.issues);
          return;
        }
        handler(result.data);
      } catch (error) {
        console.error("Ignoring malformed Redis trip event", error);
      }
    });

    return async () => {
      await subscriber.unsubscribe(channelFor(tripId));
      await subscriber.quit();
    };
  }
}

function channelFor(tripId: string): string {
  return `trip:${tripId}:events`;
}
