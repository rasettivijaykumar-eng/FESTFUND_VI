import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["photo", "video"], required: true },
    title: { type: String, default: "" },
    category: { type: String, default: "Festival Activities" },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    bytes: { type: Number, default: 0 },
    mime: { type: String, default: "" },
    originalName: { type: String, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const GalleryItem = mongoose.model("GalleryItem", schema);
