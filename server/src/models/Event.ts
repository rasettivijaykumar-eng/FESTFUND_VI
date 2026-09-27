import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    date: { type: Date, required: true },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    location: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    status: { type: String, enum: ["Upcoming", "Ongoing", "Completed", "Cancelled"], default: "Upcoming" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Event = mongoose.model("Event", schema);
