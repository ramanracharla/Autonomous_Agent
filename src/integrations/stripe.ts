import Stripe from "stripe";
import type { PaymentIntentInput, PaymentIntentResult } from "./types";

type PaymentIntentCreator = (
  amount: number,
  currency: string,
  tripId: string
) => Promise<PaymentIntentResult>;

export class StripePaymentAdapter {
  private readonly createIntent: PaymentIntentCreator;

  constructor(secretKey: string, createIntent?: PaymentIntentCreator) {
    if (createIntent) {
      this.createIntent = createIntent;
      return;
    }
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required");
    }
    const stripe = new Stripe(secretKey);
    this.createIntent = async (amount, currency, tripId) => {
      const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: { tripId }
      });
      return {
        id: intent.id,
        clientSecret: intent.client_secret,
        status: intent.status
      };
    };
  }

  createPaymentIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    if (!Number.isSafeInteger(input.amount) || input.amount < 50) {
      throw new Error("amount must be an integer of at least 50 minor currency units");
    }
    if (!/^[a-z]{3}$/.test(input.currency)) {
      throw new Error("currency must be a lowercase ISO 4217 code");
    }
    if (!input.tripId.trim()) {
      throw new Error("tripId is required");
    }
    return this.createIntent(input.amount, input.currency, input.tripId);
  }
}
