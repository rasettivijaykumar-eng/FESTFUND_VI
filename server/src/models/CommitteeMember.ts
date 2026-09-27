import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true },
    festId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true },
);

export const CommitteeMember = mongoose.model("CommitteeMember", schema);
