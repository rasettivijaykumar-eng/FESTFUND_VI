import { Advertisement, CommitteeMember, Donor, Event, Expense, Festival, GalleryItem, Vendor } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { haversineKm } from "../utils/geo.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { env } from "../config/env.js";

async function festivalScope(reqFest: string | undefined, adminId: string, role: string, memberFest?: string) {
  if (role === "COMMITTEE") {
    const festival = await Festival.findOne({ festId: memberFest });
    return festival ? [festival] : [];
  }
  if (reqFest) {
    const festival = await Festival.findOne({ festId: reqFest.toUpperCase(), createdBy: adminId });
    return festival ? [festival] : [];
  }
  return Festival.find({ createdBy: adminId });
}

export const analytics = asyncHandler(async (req, res) => {
  const festId = req.query.festId ? String(req.query.festId) : undefined;
  if (festId) await loadFestivalForActor(req, festId.toUpperCase(), "read");
  const festivals = await festivalScope(festId, req.auth!.id, req.auth!.role, req.auth!.festId);
  const ids = festivals.map((f) => f.festId);
  const [donors, expenses, events, gallery, committee] = await Promise.all([
    Donor.find({ festId: { $in: ids } }),
    Expense.find({ festId: { $in: ids } }),
    Event.find({ festId: { $in: ids } }),
    GalleryItem.find({ festId: { $in: ids } }),
    CommitteeMember.find({ festId: { $in: ids }, status: "approved" }),
  ]);
  const contributions = donors.reduce((s, d) => s + d.amount, 0);
  const spent = expenses.reduce((s, d) => s + d.amount, 0);
  const byCategory = new Map<string, number>();
  for (const expense of expenses) byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amount);
  const months = new Map<string, { month: string; contributions: number; expenses: number }>();
  const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  for (const donor of donors) {
    const key = keyOf(new Date(donor.date));
    const row = months.get(key) || { month: key, contributions: 0, expenses: 0 };
    row.contributions += donor.amount;
    months.set(key, row);
  }
  for (const expense of expenses) {
    const key = keyOf(new Date(expense.date));
    const row = months.get(key) || { month: key, contributions: 0, expenses: 0 };
    row.expenses += expense.amount;
    months.set(key, row);
  }
  let nearby = 0;
  const origin = festivals.find((f) => f.latitude != null && f.longitude != null);
  const vendors = await Vendor.find();
  if (origin?.latitude != null && origin.longitude != null) {
    nearby = vendors.filter((v) => v.latitude != null && v.longitude != null && haversineKm(origin.latitude!, origin.longitude!, v.latitude!, v.longitude!) <= 20).length;
  }
  const ads = await Advertisement.find(req.auth!.role === "VENDOR" ? { vendorUser: req.auth!.id } : {});
  const vendorCategories = new Map<string, number>();
  for (const vendor of vendors) vendorCategories.set(vendor.category, (vendorCategories.get(vendor.category) || 0) + 1);
  res.json({
    success: true,
    data: {
      festivals: festivals.length,
      donors: donors.length,
      contributions,
      expenses: spent,
      balance: contributions - spent,
      committee: committee.length,
      events: {
        total: events.length,
        upcoming: events.filter((e) => e.status === "Upcoming").length,
        ongoing: events.filter((e) => e.status === "Ongoing").length,
        completed: events.filter((e) => e.status === "Completed").length,
        cancelled: events.filter((e) => e.status === "Cancelled").length,
      },
      gallery: gallery.length,
      nearbyVendors: nearby,
      expenseByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })),
      trend: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      vendorCategories: [...vendorCategories.entries()].map(([category, count]) => ({ category, count })),
      advertisementViews: ads.reduce((s, a) => s + a.views, 0),
      advertisements: ads.length,
    },
  });
});

export const forecast = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || req.auth?.festId || "").toUpperCase();
  if (!festId) {
    res.json({
      success: true,
      data: {
        mode: "unavailable",
        disclaimer: "Choose a festival. Predictions appear only when a forecast service is connected.",
        currentContributions: 0,
        currentExpenses: 0,
      },
    });
    return;
  }
  await loadFestivalForActor(req, festId, "read");
  const [donors, expenses] = await Promise.all([Donor.find({ festId }), Expense.find({ festId })]);
  const currentContributions = donors.reduce((s, d) => s + d.amount, 0);
  const currentExpenses = expenses.reduce((s, d) => s + d.amount, 0);
  if (env.forecastApiUrl) {
    try {
      const response = await fetch(env.forecastApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ festId, currentContributions, currentExpenses, donorCount: donors.length }),
      });
      if (response.ok) {
        const live = await response.json() as Record<string, number>;
        res.json({ success: true, data: { mode: "live", ...live, currentContributions, currentExpenses } });
        return;
      }
    } catch {
      res.json({
        success: true,
        data: {
          mode: "unavailable",
          disclaimer: "The forecast service could not be reached. No estimate is shown.",
          currentContributions,
          currentExpenses,
        },
      });
      return;
    }
  }
  res.json({
    success: true,
    data: {
      mode: "unavailable",
      disclaimer: "No forecast service is connected. Current totals below are from recorded contributions and expenses.",
      currentContributions,
      currentExpenses,
    },
  });
});

export const landingStats = asyncHandler(async (_req, res) => {
  const [festivals, donors, expenses, vendors, events] = await Promise.all([
    Festival.countDocuments(),
    Donor.find(),
    Expense.find(),
    Vendor.countDocuments(),
    Event.countDocuments(),
  ]);
  const contributions = donors.reduce((s, d) => s + d.amount, 0);
  const spent = expenses.reduce((s, d) => s + d.amount, 0);
  const featured = await Festival.find().sort({ createdAt: -1 }).limit(4).select("name festId district state startDate endDate imageUrl type village");
  res.json({
    success: true,
    data: {
      festivals,
      donors: donors.length,
      contributions,
      expenses: spent,
      balance: contributions - spent,
      vendors,
      events,
      featured,
    },
  });
});

export const searchAll = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (req.auth!.role === "VENDOR") {
    res.json({ success: true, data: [] });
    return;
  }
  const festFilter = req.auth!.role === "COMMITTEE" ? { festId: req.auth!.festId } : { createdBy: req.auth!.id };
  const festivals = await Festival.find({ ...festFilter, name: regex }).limit(5);
  const festIds = req.auth!.role === "COMMITTEE"
    ? [req.auth!.festId]
    : (await Festival.find({ createdBy: req.auth!.id }).select("festId")).map((f) => f.festId);
  const donors = await Donor.find({ festId: { $in: festIds }, name: regex }).limit(5);
  res.json({
    success: true,
    data: [
      ...festivals.map((f) => ({ type: "festival", label: f.name, hint: f.festId, href: req.auth!.role === "COMMITTEE" ? "/committee" : `/admin/festivals/${f.festId}` })),
      ...donors.map((d) => ({ type: "donor", label: d.name, hint: d.festId, href: req.auth!.role === "COMMITTEE" ? "/committee/donors" : `/admin/donors?festId=${d.festId}` })),
    ],
  });
});
