import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";
import { CommitteeMember, Donor, Event, Expense, Festival, GalleryItem, Vendor, User, AdminNote } from "../models/index.js";

export type AiRole = "ADMIN" | "COMMITTEE" | "VISITOR";

export type FestivalAiContext = {
  userName: string;
  role: AiRole;
  festivalId: string;
  festivalName: string;
  festivalLocation: string;
  permissions: string[];
  summary: {
    contributions: number;
    expenses: number;
    balance: number;
    donorCount: number;
    expenseCount: number;
    eventCount: number;
    upcomingEvents: number;
    galleryPhotos: number;
    galleryVideos: number;
    committeeCount: number;
    vendorCount: number;
    topDonor?: { name: string; amount: number };
    topExpense?: { description: string; amount: number; category: string };
    topExpenseCategory?: { category: string; amount: number };
  };
  publicInfo: {
    description: string;
    startDate: string;
    endDate: string;
    district: string;
    state: string;
    address: string;
    village: string;
    isDemo: boolean;
  };
  recentEvents: { name: string; date: string; location: string; status: string }[];
  recentExpenses: { description: string; amount: number; category: string; date: string }[];
  recentDonors: { name: string; amount: number; category: string; date: string }[];
  committeeNames: string[];
  gallerySummary: { photos: number; videos: number };
  vendorSummary?: { names: string[]; categories: string[] };
  notes?: string[];
};

function normalizeFestId(value: string) {
  return String(value || "").trim().toUpperCase();
}

function textToCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

async function secureFestivalValue(festivalId: string, role: AiRole, userId?: string, userFestId?: string) {
  const festId = normalizeFestId(festivalId);
  if (!festId) throw new ApiError(400, "Festival context is required");
  const festival = await Festival.findOne({ festId: festId });
  if (!festival) throw new ApiError(404, "Festival not found");

  if (role === "ADMIN") {
    if (!userId || String(festival.createdBy) !== String(userId)) {
      throw new ApiError(403, "You are not authorized to access this festival");
    }
  } else if (role === "COMMITTEE") {
    if (!userFestId || normalizeFestId(userFestId) !== festId) {
      throw new ApiError(403, "You are not authorized to access this festival");
    }
  }

  return festival;
}

async function buildFestivalAiContext(input: {
  festivalId: string;
  userName: string;
  role: AiRole;
  userId?: string;
  userFestId?: string;
}) : Promise<FestivalAiContext> {
  const festival = await secureFestivalValue(input.festivalId, input.role, input.userId, input.userFestId);
  const festId = festival.festId;
  const [donors, expenses, events, gallery, committeeMembers, vendors] = await Promise.all([
    Donor.find({ festId }).sort({ date: -1 }).limit(25),
    Expense.find({ festId }).sort({ date: -1 }).limit(25),
    Event.find({ festId }).sort({ date: 1 }).limit(25),
    GalleryItem.find({ festId }).sort({ createdAt: -1 }).limit(25),
    CommitteeMember.find({ festId, status: "approved" }).populate("user", "name"),
    Vendor.find({
      $or: [
        { district: festival.district },
        { village: festival.village },
      ],
    }).limit(25),
  ]);

  const contributions = donors.reduce((sum, donor) => sum + Number(donor.amount || 0), 0);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = contributions - spent;
  const topDonor = [...donors].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const topExpense = [...expenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const topExpenseCategoryMap = new Map<string, number>();
  for (const item of expenses) {
    const amount = Number(item.amount || 0);
    topExpenseCategoryMap.set(item.category, (topExpenseCategoryMap.get(item.category) || 0) + amount);
  }
  const topExpenseCategory = [...topExpenseCategoryMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const upcomingEvents = events.filter((event) => event.status === "Upcoming" || event.status === "Ongoing").length;

  const permissions = input.role === "ADMIN"
    ? ["festival", "finance", "donors", "expenses", "events", "gallery", "committee", "vendors", "reports", "notes"]
    : input.role === "COMMITTEE"
      ? ["festival", "finance", "events", "gallery", "committee", "vendors"]
      : ["festival", "events", "gallery", "committee", "vendors"];

  let notes: string[] | undefined;
  if (input.role === "ADMIN" || input.role === "COMMITTEE") {
    const adminNotes = await AdminNote.find({ festId }).sort({ createdAt: -1 }).limit(5);
    notes = adminNotes.map((note) => `${note.title}: ${note.description}`);
  }

  return {
    userName: input.userName,
    role: input.role,
    festivalId: festId,
    festivalName: festival.name,
    festivalLocation: `${festival.village || festival.district || "Festival"}, ${festival.district || festival.state || ""}`.replace(/\s+,\s+/g, ", ").trim(),
    permissions,
    summary: {
      contributions,
      expenses: spent,
      balance,
      donorCount: donors.length,
      expenseCount: expenses.length,
      eventCount: events.length,
      upcomingEvents,
      galleryPhotos: gallery.filter((item) => item.kind === "photo").length,
      galleryVideos: gallery.filter((item) => item.kind === "video").length,
      committeeCount: committeeMembers.length,
      vendorCount: vendors.length,
      topDonor: topDonor ? { name: topDonor.name, amount: Number(topDonor.amount || 0) } : undefined,
      topExpense: topExpense ? { description: topExpense.description, amount: Number(topExpense.amount || 0), category: topExpense.category } : undefined,
      topExpenseCategory: topExpenseCategory ? { category: topExpenseCategory[0], amount: topExpenseCategory[1] } : undefined,
    },
    publicInfo: {
      description: festival.description || "",
      startDate: festival.startDate ? new Date(festival.startDate).toISOString() : "",
      endDate: festival.endDate ? new Date(festival.endDate).toISOString() : "",
      district: festival.district || "",
      state: festival.state || "",
      address: festival.address || "",
      village: festival.village || "",
      isDemo: Boolean(festival.isDemo),
    },
    recentEvents: events.slice(0, 5).map((event) => ({
      name: event.name,
      date: event.date ? new Date(event.date).toISOString() : "",
      location: event.location || "",
      status: event.status,
    })),
    recentExpenses: expenses.slice(0, 5).map((expense) => ({
      description: expense.description,
      amount: Number(expense.amount || 0),
      category: expense.category,
      date: expense.date ? new Date(expense.date).toISOString() : "",
    })),
    recentDonors: donors.slice(0, 5).map((donor) => ({
      name: donor.name,
      amount: Number(donor.amount || 0),
      category: donor.category,
      date: donor.date ? new Date(donor.date).toISOString() : "",
    })),
    committeeNames: committeeMembers.map((member) => String((member.user as { name?: string } | null)?.name || "Committee member")),
    gallerySummary: {
      photos: gallery.filter((item) => item.kind === "photo").length,
      videos: gallery.filter((item) => item.kind === "video").length,
    },
    vendorSummary: {
      names: vendors.slice(0, 8).map((vendor) => vendor.businessName),
      categories: [...new Set(vendors.map((vendor) => vendor.category))].slice(0, 8),
    },
    notes,
  };
}

function buildSystemPrompt(context: FestivalAiContext) {
  const safeSummary = JSON.stringify({
    userName: context.userName,
    role: context.role,
    festival: {
      name: context.festivalName,
      festId: context.festivalId,
      location: context.festivalLocation,
    },
    permissions: context.permissions,
    summary: context.summary,
    publicInfo: context.publicInfo,
    recentEvents: context.recentEvents,
    recentExpenses: context.recentExpenses,
    recentDonors: context.recentDonors,
    committeeNames: context.committeeNames,
    gallerySummary: context.gallerySummary,
    vendorSummary: context.vendorSummary,
    notes: context.notes || [],
  }, null, 2);

  return [
    "You are FestFund AI, the festival assistant for the current authenticated user and current validated festival.",
    "Use only the verified data in the context below and do not invent information.",
    "Never reveal secrets, API keys, passwords, internal authentication details, or database records beyond the current festival and allowed permissions.",
    "If the user asks for something blocked by permissions, respond politely that that information is not available to their role.",
    "If there is no data, say that the information is not available for this festival.",
    "For forecasts, clearly label estimates as estimated or predicted and avoid claiming certainty.",
    "For unusual expenses, use neutral wording such as 'potential anomaly' and 'requires review' without accusing anyone.",
    "Keep the answer concise, friendly, and festival-aware.",
    "",
    "CONTEXT JSON:",
    safeSummary,
  ].join("\n");
}

export async function answerFestivalQuestion(input: {
  festivalId: string;
  message: string;
  userName: string;
  role: AiRole;
  userId?: string;
  userFestId?: string;
}) {
  const festivalContext = await buildFestivalAiContext(input);
  const prompt = [
    buildSystemPrompt(festivalContext),
    "",
    `User message: ${input.message}`,
    "",
    "Respond in a concise, structured format with numbers, categories, and festival-specific guidance. Use only the context above.",
  ].join("\n");

  if (!env.geminiApiKey) {
    console.error("FestFund AI request skipped: GEMINI_API_KEY is missing.");
    return {
      answer: "FestFund AI is temporarily unavailable. Your FestFund dashboard is still working normally.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
    let response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: prompt,
        });
        break;
      } catch (error) {
        const status = error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
        if (![429, 500, 502, 503, 504].includes(status) || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    const answer = (response.text || "I could not generate a response for that request.").trim();
    return { answer };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const safeDetail = env.geminiApiKey ? detail.replaceAll(env.geminiApiKey, "[redacted]") : detail;
    console.error("FestFund AI Gemini request failed:", safeDetail);
    return {
      answer: "FestFund AI is temporarily unavailable. Your FestFund dashboard is still working normally.",
    };
  }
}

export async function getFestivalAiSummary(festivalId: string, role: AiRole, userName: string, userId?: string, userFestId?: string) {
  return buildFestivalAiContext({ festivalId, userName, role, userId, userFestId });
}

export function formatFestivalAiGreetingContext(festivalId: string, role: AiRole, userName: string) {
  const displayRole = role === "ADMIN" ? "Admin" : role === "COMMITTEE" ? "Committee" : "Festival Visitor";
  return role === "VISITOR"
    ? `Welcome to ${festivalId}! 👋 I'm your FestFund AI assistant. What would you like to know about this festival?`
    : `Hello ${userName}! 👋 I'm FestFund AI. You're currently managing ${festivalId}. How can I help?`;
}

export function buildFestivalContextText(context: FestivalAiContext) {
  return `${context.festivalName} (${context.festivalId}) • ${context.userName} • ${context.role === "ADMIN" ? "Admin" : context.role === "COMMITTEE" ? "Committee" : "Festival Visitor"}`;
}

export function safeCurrency(value: number) {
  return textToCurrency(value);
}
