import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["image", "video", "audio"], required: true },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    mime: { type: String, required: true },
    bytes: { type: Number, required: true },
    originalName: { type: String, default: "" },
  },
  { _id: false },
);

const communityMessageSchema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true },
    festId: { type: String, required: true },
    senderUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, required: true, maxlength: 80 },
    senderRole: { type: String, enum: ["ADMIN", "COMMITTEE", "GUEST", "SYSTEM"], required: true },
    text: { type: String, default: "", maxlength: 2000 },
    attachment: { type: attachmentSchema, default: undefined },
  },
  { timestamps: true },
);

communityMessageSchema.index({ festId: 1, createdAt: -1, _id: -1 });

export const CommunityMessage = mongoose.model("CommunityMessage", communityMessageSchema);