import mongoose from "mongoose";

const categories = ["Decoration", "Stage", "Lighting", "Sound", "Food", "Transport", "Other"];

const schema = new mongoose.Schema(
  {
    festival: { type: mongoose.Schema.Types.ObjectId, ref: "Festival", required: true, index: true },
    festId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: categories, required: true },
    date: { type: Date, required: true },
    addedByName: { type: String, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    billUrl: { type: String, default: "" },
    billPublicId: { type: String, default: "" },
    billName: { type: String, default: "" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const EXPENSE_CATEGORIES = categories;
export const Expense = mongoose.model("Expense", schema);
