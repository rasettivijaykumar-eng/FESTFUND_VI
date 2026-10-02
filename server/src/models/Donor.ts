import mongoose from "mongoose";

const whatsappNotificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "pending", "not_configured", "no_number", "failed", "not_available"],
      default: "not_configured",
    },
    recipient: { type: String, default: "" },
    messageId: { type: String, default: "" },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failureReason: { type: String, default: "" },
    lastAttemptAt: { type: Date },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    submissionId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    category: { type: String, default: "General" },
    notes: { type: String, default: "" },
    whatsappNotification: { type: whatsappNotificationSchema, default: () => ({ status: "not_configured" }) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Donor = mongoose.model("Donor", schema);
