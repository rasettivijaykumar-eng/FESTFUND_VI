import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    verifiedPhoneNumber: { type: String, default: "" },
    verifiedBusinessName: { type: String, default: "" },
    verifiedAt: { type: Date },
    verifiedConfigFingerprint: { type: String, default: "" },
    lastTestFailure: { type: String, default: "" },
  },
  { timestamps: true },
);

export const WhatsAppSettings = mongoose.model("WhatsAppSettings", schema);