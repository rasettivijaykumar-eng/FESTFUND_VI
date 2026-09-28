import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    festivalName: { type: String, required: true },
    donorName: { type: String, required: true },
    adminName: { type: String, default: "" },
    adminMobile: { type: String, default: "" },
    amount: { type: Number, required: true },
    contributionDate: { type: Date, required: true },
    category: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Receipt = mongoose.model("Receipt", schema);
