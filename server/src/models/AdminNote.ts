import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ["Normal", "Important", "Urgent"], default: "Normal" },
    attachmentUrl: { type: String, default: "" },
    attachmentPublicId: { type: String, default: "" },
    attachmentName: { type: String, default: "" },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    authorName: { type: String, default: "" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const AdminNote = mongoose.model("AdminNote", schema);
