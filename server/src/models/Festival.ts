import mongoose from "mongoose";

const festivalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    description: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    plannedExpenseBudget: { type: Number, min: 0 },
    address: { type: String, default: "" },
    village: { type: String, default: "" },
    district: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, default: "" },
    latitude: { type: Number },
    longitude: { type: Number },
    contactName: { type: String, default: "" },
    contactMobile: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    festId: { type: String, required: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Festival = mongoose.model("Festival", festivalSchema);
