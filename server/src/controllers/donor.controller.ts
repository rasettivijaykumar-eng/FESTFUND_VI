import { z } from "zod";
import { Donor } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex } from "../utils/geo.js";
import { loadFestivalForActor } from "../services/access.service.js";

const schema = z.object({
  festId: z.string().min(4),
  name: z.string().min(2, "Donor name is required"),
  mobile: z.string().min(8, "Mobile number is required"),
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
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
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
  const donor = await Donor.create({ ...parsed.data, festId, festival: festival._id, createdBy: req.auth!.id });
  res.status(201).json({ success: true, data: donor });
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
