import { model, Schema, Types } from "mongoose";

export type TripStatus =
  | "PENDING"
  | "PROCESSING"
  | "DRAFT"
  | "CONFIRMED"
  | "CANCELLED";
export type CollaboratorRole = "COLLABORATOR" | "VIEWER";

export interface Trip {
  primaryUserId: Types.ObjectId;
  title: string;
  status: TripStatus;
  budget?: {
    amount: number;
    currency: string;
  };
  startDate: Date;
  endDate: Date;
  collaborators: Array<{
    userId: Types.ObjectId;
    role: CollaboratorRole;
  }>;
  createdAt: Date;
}

const tripSchema = new Schema<Trip>(
  {
    primaryUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "DRAFT", "CONFIRMED", "CANCELLED"],
      required: true,
      default: "PENDING"
    },
    budget: {
      amount: { type: Number, min: 0 },
      currency: { type: String, uppercase: true, trim: true }
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    collaborators: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["COLLABORATOR", "VIEWER"], required: true }
      }
    ]
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

tripSchema.index({ primaryUserId: 1, createdAt: -1 });

export const TripModel = model<Trip>("Trip", tripSchema);
export type TripId = Types.ObjectId;
