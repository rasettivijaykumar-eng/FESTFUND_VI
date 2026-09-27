import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, required: true },
    ownerName: { type: String, required: true },
    category: { type: String, required: true },
    address: { type: String, default: "" },
    village: { type: String, default: "" },
    district: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    latitude: { type: Number },
    longitude: { type: Number },
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] },
    },
    description: { type: String, default: "" },
    businessHours: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    logoPublicId: { type: String, default: "" },
    images: [{ url: String, publicId: String, originalName: String }],
    products: [{
      name: { type: String, required: true },
      price: { type: Number, required: true },
      imageUrl: { type: String, default: "" },
      imagePublicId: { type: String, default: "" },
    }],
    contactMobile: { type: String, default: "" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.index({ location: "2dsphere" });

export const Vendor = mongoose.model("Vendor", schema);
