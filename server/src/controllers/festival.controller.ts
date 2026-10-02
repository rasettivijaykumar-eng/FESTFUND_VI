import { z } from "zod";
import { Donor, Event, Expense, Festival, GalleryItem, CommitteeMember } from "../models/index.js";
import { nextSeq } from "../models/Counter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { districtCode } from "../utils/geo.js";
import { storeFile } from "../services/upload.service.js";
import { loadFestivalForActor, publicFestival } from "../services/access.service.js";

const festivalSchema = z.object({
  name: z.string().min(2, "Festival name is required"),
  type: z.string().min(2, "Festival type is required"),
  description: z.string().optional().default(""),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  plannedExpenseBudget: z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.coerce.number().nonnegative().optional(),
  ),
  address: z.string().min(3, "Address is required"),
  village: z.string().min(2, "Village or town is required"),
  district: z.string().min(2, "District is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().min(4, "Pincode is required"),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  contactName: z.string().optional().default(""),
  contactMobile: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
});

function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, result.error.issues[0]?.message || "Invalid input");
  return result.data;
}

export const createFestival = asyncHandler(async (req, res) => {
  const data = parse(festivalSchema, req.body);
  if (data.endDate < data.startDate) throw new ApiError(400, "End date must be after the start date");
  const year = data.startDate.getFullYear();
  const code = districtCode(data.district);
  const prefix = `FEST-${code}-${year}`;
  const seq = await nextSeq(prefix);
  const festId = `${prefix}-${String(seq).padStart(3, "0")}`;
  let imageUrl = "";
  let imagePublicId = "";
  if (req.file) {
    const stored = await storeFile(req.file, "festivals");
    imageUrl = stored.url;
    imagePublicId = stored.publicId;
  }
  const festival = await Festival.create({
    ...data,
    latitude: data.latitude ? Number(data.latitude) : undefined,
    longitude: data.longitude ? Number(data.longitude) : undefined,
    festId,
    imageUrl,
    imagePublicId,
    createdBy: req.auth!.id,
  });
  res.status(201).json({ success: true, message: "Festival created successfully", data: festival });
});

export const listMyFestivals = asyncHandler(async (req, res) => {
  const festivals = await Festival.find({ createdBy: req.auth!.id }).sort({ createdAt: -1 });
  res.json({ success: true, data: festivals });
});

export const getFestival = asyncHandler(async (req, res) => {
  const festival = await loadFestivalForActor(req, String(req.params.festId).toUpperCase(), "read");
  res.json({ success: true, data: festival });
});

export const updateFestival = asyncHandler(async (req, res) => {
  const festival = await loadFestivalForActor(req, String(req.params.festId).toUpperCase(), "admin");
  const data = parse(festivalSchema.partial(), req.body);
  Object.assign(festival, data);
  if (req.file) {
    const stored = await storeFile(req.file, "festivals");
    festival.imageUrl = stored.url;
    festival.imagePublicId = stored.publicId;
  }
  await festival.save();
  res.json({ success: true, data: festival });
});

export const deleteFestival = asyncHandler(async (req, res) => {
  const festival = await loadFestivalForActor(req, String(req.params.festId).toUpperCase(), "admin");
  const festId = festival.festId;
  await Promise.all([
    Donor.deleteMany({ festId }),
    Expense.deleteMany({ festId }),
    Event.deleteMany({ festId }),
    GalleryItem.deleteMany({ festId }),
    CommitteeMember.deleteMany({ festId }),
    Festival.deleteOne({ _id: festival._id }),
  ]);
  res.json({ success: true, message: "Festival removed" });
});

export const publicFestivalById = asyncHandler(async (req, res) => {
  const festId = String(req.params.festId).trim().toUpperCase();
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Fest ID not found");
  const [donors, expenses, events, gallery, committee] = await Promise.all([
    Donor.find({ festId }).sort({ date: -1 }),
    Expense.find({ festId }).sort({ date: -1 }),
    Event.find({ festId }).sort({ date: 1 }),
    GalleryItem.find({ festId }).sort({ createdAt: -1 }),
    CommitteeMember.find({ festId, status: "approved" }).populate("user", "name"),
  ]);
  const contributions = donors.reduce((sum, d) => sum + d.amount, 0);
  const spent = expenses.reduce((sum, d) => sum + d.amount, 0);
  res.json({
    success: true,
    data: {
      festival: publicFestival(festival),
      donors: donors.map((d) => ({
        _id: d._id,
        name: d.name,
        amount: d.amount,
        date: d.date,
        category: d.category,
        notes: d.notes,
        address: d.address,
      })),
      expenses: expenses.map((e) => ({
        _id: e._id,
        description: e.description,
        amount: e.amount,
        category: e.category,
        date: e.date,
        addedByName: e.addedByName,
      })),
      events,
      gallery,
      committee: committee.map((m) => ({ name: (m.user as { name?: string } | null)?.name || "Member" })),
      finance: { contributions, expenses: spent, balance: contributions - spent, donorCount: donors.length },
    },
  });
});

export const validateFestId = asyncHandler(async (req, res) => {
  const festId = String(req.params.festId || req.query.festId || "").trim().toUpperCase();
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Fest ID not found");
  res.json({ success: true, data: { festId: festival.festId, name: festival.name } });
});
