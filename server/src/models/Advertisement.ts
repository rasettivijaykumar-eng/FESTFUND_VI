import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    vendorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    mediaPublicId: { type: String, default: "" },
    mediaType: { type: String, enum: ["image", "video", "none"], default: "none" },
    category: { type: String, default: "" },
    contactNumber: { type: String, default: "" },
    businessAddress: { type: String, default: "" },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date },
    status: { type: String, enum: ["active", "paused"], default: "active" },
    views: { type: Number, default: 0 },
    isFree: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Advertisement = mongoose.model("Advertisement", schema);
