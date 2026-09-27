import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, default: "" },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["ADMIN", "COMMITTEE", "VENDOR"], required: true },
    avatarUrl: { type: String, default: "" },
    avatarPublicId: { type: String, default: "" },
    committeeStatus: { type: String, enum: ["pending", "approved", "rejected", ""], default: "" },
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival" },
    festId: { type: String, default: "" },
    notificationPrefs: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    appearance: { type: String, enum: ["dark", "light"], default: "dark" },
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    const clone = ret as Record<string, unknown>;
    delete clone.password;
    return clone;
  },
});

export const User = mongoose.model("User", userSchema);
