import { model, Schema, Types } from "mongoose";

export type UserRole = "PRIMARY_TRAVELER" | "COLLABORATOR" | "ADMIN";
export type SeatPreference = "WINDOW" | "AISLE" | "MIDDLE";

export interface User {
  email: string;
  passwordHash: string;
  fullName: string;
  roles: UserRole[];
  preferences: {
    seatPreference?: SeatPreference;
    dietaryRestrictions: string[];
    preferredAirlines: string[];
  };
  createdAt: Date;
}

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    roles: {
      type: [String],
      enum: ["PRIMARY_TRAVELER", "COLLABORATOR", "ADMIN"],
      required: true,
      default: ["PRIMARY_TRAVELER"]
    },
    preferences: {
      seatPreference: { type: String, enum: ["WINDOW", "AISLE", "MIDDLE"] },
      dietaryRestrictions: { type: [String], default: [] },
      preferredAirlines: { type: [String], default: [] }
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const UserModel = model<User>("User", userSchema);
export type UserId = Types.ObjectId;
