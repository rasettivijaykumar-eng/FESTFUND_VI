import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    category: { type: String, default: "General" },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Donor = mongoose.model("Donor", schema);
