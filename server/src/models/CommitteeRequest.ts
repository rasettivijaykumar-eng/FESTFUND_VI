import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true },
    festId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

schema.index({ user: 1, festival: 1 }, { unique: true });

export const CommitteeRequest = mongoose.model("CommitteeRequest", schema);
