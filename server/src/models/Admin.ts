import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayName: { type: String, required: true },
  },
  { timestamps: true },
);

export const Admin = mongoose.model("Admin", schema);
