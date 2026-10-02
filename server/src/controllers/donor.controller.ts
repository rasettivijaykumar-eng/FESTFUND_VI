import { z } from "zod";
import { Donor } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex } from "../utils/geo.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { sendDonationReceipt } from "../services/whatsapp.service.js";
import { notify } from "../services/notification.service.js";
import { getOrCreateReceipt } from "../services/receipt.service.js";

const schema = z.object({
  festId: z.string().min(4),
  submissionId: z.string().uuid().optional(),
  name: z.string().min(2, "Donor name is required"),
  mobile: z.string().trim().max(40).optional().default(""),
  email: z.string().optional().default(""),
  address: z.string().optional().default(""),
  amount: z.coerce.number().positive("Contribution amount must be greater than zero"),
  date: z.coerce.date(),
  category: z.string().optional().default("General"),
  notes: z.string().optional().default(""),
});

function queryFest(reqFest?: string) {
  return String(reqFest || "").toUpperCase();
}

export const listDonors = asyncHandler(async (req, res) => {
  const festId = queryFest(String(req.query.festId || ""));
  await loadFestivalForActor(req, festId, "read");
  const q = String(req.query.q || "");
  const filter: Record<string, unknown> = { festId };
  if (q) {
    const search = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: search }, { mobile: search }, { category: search }];
  }
  if (req.query.min) filter.amount = { ...(filter.amount as object), $gte: Number(req.query.min) };
  if (req.query.max) filter.amount = { ...(filter.amount as object), $lte: Number(req.query.max) };
  if (req.query.from || req.query.to) {
    filter.date = {
      ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
    };
  }
  const sortField = String(req.query.sort || "date");
  const dir = String(req.query.dir || "desc") === "asc" ? 1 : -1;
  const allowed = new Set(["name", "amount", "date"]);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit || 20)));
  const sort = { [allowed.has(sortField) ? sortField : "date"]: dir } as Record<string, 1 | -1>;
  const [items, total] = await Promise.all([
    Donor.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Donor.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export const createDonor = asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const festId = parsed.data.festId.toUpperCase();
  const festival = await loadFestivalForActor(req, festId, "admin");
  const { submissionId, ...donorData } = parsed.data;
  if (submissionId) {
    const existing = await Donor.findOne({ submissionId, festId });
    if (existing) {
      res.json({ success: true, data: existing, message: "This donor submission was already saved." });
      return;
    }
  }
  try {
    const donor = await Donor.create({ ...donorData, submissionId, festId, festival: festival._id, createdBy: req.auth!.id });
    let receiptNo = "";
    try {
      receiptNo = (await getOrCreateReceipt(donor, festival)).receiptNo;
    } catch (error) {
      console.error("Receipt creation failed after contribution save:", error instanceof Error ? error.name : "UnknownError");
    }
    try {
      const result = await sendDonationReceipt(donor, festival, req.auth!.id);
      receiptNo = result.receiptNo || receiptNo;
    } catch (error) {
      console.error("WhatsApp notification failed after contribution save:", error instanceof Error ? error.name : "UnknownError");
      await Donor.updateOne({ _id: donor._id, festId }, {
        $set: {
          "whatsappNotification.status": "failed",
          "whatsappNotification.failureReason": "WhatsApp sending could not be completed. The contribution remains recorded.",
          "whatsappNotification.lastAttemptAt": new Date(),
        },
      }).catch(() => undefined);
      await notify(req.auth!.id, "WhatsApp receipt failed", "The contribution was saved, but WhatsApp sending could not be completed.", "whatsapp", "/admin/donors").catch(() => undefined);
    }
    const updatedDonor = await Donor.findById(donor._id).catch(() => donor);
    res.status(201).json({ success: true, data: { ...(updatedDonor || donor).toObject(), receiptNo } });
  } catch (error) {
    if (submissionId && (error as { code?: number }).code === 11000) {
      const existing = await Donor.findOne({ submissionId, festId });
      if (existing) {
        res.json({ success: true, data: existing, message: "This donor submission was already saved." });
        return;
      }
    }
    throw error;
  }
});

export const updateDonor = asyncHandler(async (req, res) => {
  const donor = await Donor.findById(req.params.id);
  if (!donor) throw new ApiError(404, "Donor record not found");
  await loadFestivalForActor(req, donor.festId, "admin");
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const { festId: _festId, ...rest } = parsed.data;
  Object.assign(donor, rest);
  await donor.save();
  res.json({ success: true, data: donor });
});

export const deleteDonor = asyncHandler(async (req, res) => {
  const donor = await Donor.findById(req.params.id);
  if (!donor) throw new ApiError(404, "Donor record not found");
  await loadFestivalForActor(req, donor.festId, "admin");
  await donor.deleteOne();
  res.json({ success: true, message: "Donor record removed" });
});
