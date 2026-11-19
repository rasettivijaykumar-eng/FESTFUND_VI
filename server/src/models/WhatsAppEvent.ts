import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    messageId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    provider: { type: String, enum: ["meta", "twilio"], required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
    eventTimestamp: { type: Date },
    processingStatus: { type: String, enum: ["processing", "processed", "ignored", "failed", "dead_letter"], required: true, default: "processing" },
    processingResult: { type: String, default: "" },
  },
  { timestamps: true },
);

schema.index({ messageId: 1, eventType: 1, eventTimestamp: -1 });

export const WhatsAppEvent = mongoose.model("WhatsAppEvent", schema);
