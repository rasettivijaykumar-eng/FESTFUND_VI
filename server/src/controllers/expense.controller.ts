import { z } from "zod";
import { EXPENSE_CATEGORIES, Expense } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex } from "../utils/geo.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { storeFile } from "../services/upload.service.js";
import { reviewExpenseForAnomaly } from "../services/financialAdvisor.service.js";

const schema = z.object({
  festId: z.string().min(4),
  description: z.string().min(2),
  amount: z.coerce.number().positive(),
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]]),
  date: z.coerce.date(),
});

export const listExpenses = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const filter: Record<string, unknown> = { festId };
  if (req.query.category) filter.category = String(req.query.category);
  if (req.query.q) {
    const search = new RegExp(escapeRegex(String(req.query.q)), "i");
    filter.$or = [{ description: search }, { category: search }];
  }
  if (req.query.min || req.query.max) {
    filter.amount = {
      ...(req.query.min ? { $gte: Number(req.query.min) } : {}),
      ...(req.query.max ? { $lte: Number(req.query.max) } : {}),
    };
  }
  if (req.query.from || req.query.to) {
    filter.date = {
      ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
    };
  }
  const items = await Expense.find(filter).sort({ date: -1 });
  res.json({ success: true, data: items });
});

export const createExpense = asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const festId = parsed.data.festId.toUpperCase();
  const festival = await loadFestivalForActor(req, festId, "admin");
  let billUrl = "";
  let billPublicId = "";
  let billName = "";
  if (req.file) {
    const stored = await storeFile(req.file, "bills");
    billUrl = stored.url;
    billPublicId = stored.publicId;
    billName = stored.originalName;
  }
  const expense = await Expense.create({
    ...parsed.data,
    festId,
    festival: festival._id,
    addedBy: req.auth!.id,
    addedByName: req.auth!.name,
    billUrl,
    billPublicId,
    billName,
  });
  void reviewExpenseForAnomaly(expense, festival).catch((error) => {
    console.error("Automatic expense anomaly review failed:", error instanceof Error ? error.message : String(error));
  });
  res.status(201).json({ success: true, data: expense });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, "Expense not found");
  await loadFestivalForActor(req, expense.festId, "admin");
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const { festId: _ignore, ...rest } = parsed.data;
  Object.assign(expense, rest);
  if (req.file) {
    const stored = await storeFile(req.file, "bills");
    expense.billUrl = stored.url;
    expense.billPublicId = stored.publicId;
    expense.billName = stored.originalName;
  }
  await expense.save();
  res.json({ success: true, data: expense });
});

export const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, "Expense not found");
  await loadFestivalForActor(req, expense.festId, "admin");
  await expense.deleteOne();
  res.json({ success: true, message: "Expense removed" });
});
