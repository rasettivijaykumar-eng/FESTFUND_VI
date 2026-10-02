import type { Types } from "mongoose";
import { Receipt } from "../models/index.js";
import { nextSeq } from "../models/Counter.js";
import { ApiError } from "../utils/ApiError.js";

type ReceiptDonor = {
  _id: Types.ObjectId;
  festId: string;
  name: string;
  amount: number;
  date: Date;
  category: string;
};

type ReceiptFestival = {
  _id: Types.ObjectId;
  festId: string;
  name: string;
  contactName?: string;
  contactMobile?: string;
};

export async function getOrCreateReceipt(donor: ReceiptDonor, festival: ReceiptFestival) {
  if (donor.festId !== festival.festId) throw new ApiError(404, "Donor record not found for this festival");
  const existing = await Receipt.findOne({ donor: donor._id, festId: festival.festId });
  if (existing) return existing;

  const seq = await nextSeq("receipt");
  try {
    return await Receipt.create({
      receiptNo: `FF-${String(seq).padStart(5, "0")}`,
      donor: donor._id,
      festival: festival._id,
      festId: festival.festId,
      festivalName: festival.name,
      donorName: donor.name,
      adminName: festival.contactName || "",
      adminMobile: festival.contactMobile || "",
      amount: donor.amount,
      contributionDate: donor.date,
      category: donor.category,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const concurrent = await Receipt.findOne({ donor: donor._id, festId: festival.festId });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}