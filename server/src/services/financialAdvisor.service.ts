import { GoogleGenAI } from "@google/genai";
import type { Types } from "mongoose";
import {
  CommitteeMember,
  CommunityMessage,
  Donor,
  Event,
  Expense,
  Festival,
  User,
} from "../models/index.js";
import { env } from "../config/env.js";
import { notify } from "./notification.service.js";

type HistoricalAmount = { festId: string; amount: number };
type ExpenseInput = { _id: Types.ObjectId; amount: number; category: string; createdAt: Date };
type FestivalInput = { _id: Types.ObjectId; createdBy: Types.ObjectId; festId: string; plannedExpenseBudget?: number | null };

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function projectedTotal(current: number, progress: number, historicalTotals: number[]) {
  const historicalMedian = median(historicalTotals);
  if (progress >= 0.15) {
    const paceEstimate = current / progress;
    if (historicalMedian > 0) {
      const paceWeight = Math.min(0.85, Math.max(0.5, progress));
      return Math.round(paceEstimate * paceWeight + historicalMedian * (1 - paceWeight));
    }
    return Math.round(paceEstimate);
  }
  return historicalMedian ? Math.round(historicalMedian) : null;
}

async function generateInsights(context: Record<string, unknown>) {
  if (!env.geminiApiKey) return "Gemini insights are unavailable; the verified totals and forecasts above are still shown.";
  try {
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        "You are FestFund's private financial advisor for admins and approved committee. Analyze only these aggregate, verified numbers.",
        "Return 3-5 concise Markdown bullets: one financial insight, one budget status, one forecast interpretation, and one practical next step.",
        "Clearly label estimates; never claim certainty, invent a planned budget, identify people, accuse anyone, or imply that a trend proves misconduct.",
        "If the history is too limited, say the estimate has low confidence. Keep the response under 120 words.",
        JSON.stringify(context),
      ].join("\n\n"),
      config: { maxOutputTokens: 320, temperature: 0.2 },
    });
    return (response.text || "No additional AI insight is available right now.").trim();
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("Financial advisor Gemini request failed:", env.geminiApiKey ? detail.replaceAll(env.geminiApiKey, "[redacted]") : detail);
    return "Gemini could not add an insight right now. Review the verified totals and estimates above.";
  }
}

export async function getFinancialAdvisor(festId: string, role: string, adminId: string) {
  const festival = await Festival.findOne({ festId });
  if (!festival) return null;
  const festivalIds = role === "ADMIN"
    ? (await Festival.find({ createdBy: adminId }).select("festId")).map((item) => item.festId)
    : [festival.festId];
  const historicalIds = festivalIds.filter((id) => id !== festival.festId);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [donors, expenses, historyDonors, historyExpenses, events] = await Promise.all([
    Donor.find({ festId: festival.festId }).select("amount date"),
    Expense.find({ festId: festival.festId }).sort({ createdAt: 1 }).select("amount category date createdAt"),
    historicalIds.length ? Donor.find({ festId: { $in: historicalIds } }).select("amount festId") : [],
    historicalIds.length ? Expense.find({ festId: { $in: historicalIds } }).select("amount category festId createdAt") : [],
    Event.find({ festId: festival.festId, $or: [{ status: "Ongoing" }, { date: { $gte: today }, status: "Upcoming" }] })
      .sort({ date: 1 })
      .limit(5)
      .select("name date status"),
  ]);

  const currentContributions = donors.reduce((total, donor) => total + Number(donor.amount || 0), 0);
  const currentExpenses = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0);
  const currentBalance = currentContributions - currentExpenses;
  const contributionByFestival = new Map<string, number>();
  const expensesByFestival = new Map<string, number>();
  for (const donor of historyDonors as HistoricalAmount[]) {
    contributionByFestival.set(donor.festId, (contributionByFestival.get(donor.festId) || 0) + Number(donor.amount || 0));
  }
  for (const expense of historyExpenses as (HistoricalAmount & { category: string })[]) {
    expensesByFestival.set(expense.festId, (expensesByFestival.get(expense.festId) || 0) + Number(expense.amount || 0));
  }
  const comparableHistoricalFestivals = new Set([...contributionByFestival.keys(), ...expensesByFestival.keys()]).size;
  const historicalContributions = [...contributionByFestival.values()];
  const historicalExpenses = [...expensesByFestival.values()];
  const categoryTotals = new Map<string, number>();
  for (const expense of expenses) categoryTotals.set(expense.category, (categoryTotals.get(expense.category) || 0) + Number(expense.amount || 0));
  const expenseByCategory = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount, share: currentExpenses ? amount / currentExpenses : 0 }))
    .sort((left, right) => right.amount - left.amount);
  const priorByCategory = new Map<string, number[]>();
  for (const expense of historyExpenses as (HistoricalAmount & { category: string })[]) {
    const amounts = priorByCategory.get(expense.category) || [];
    amounts.push(Number(expense.amount || 0));
    priorByCategory.set(expense.category, amounts);
  }
  const expenseAlerts: {
    expenseId: string;
    category: string;
    amount: number;
    historicalMedian: number;
    threshold: number;
    ratio: number;
    date: Date;
  }[] = [];
  for (const expense of expenses) {
    const previousAmounts = priorByCategory.get(expense.category) || [];
    const anomaly = classifyExpenseAnomaly(Number(expense.amount || 0), previousAmounts);
    if (anomaly) expenseAlerts.push({
      expenseId: String(expense._id),
      category: expense.category,
      amount: Number(expense.amount || 0),
      historicalMedian: anomaly.baseline,
      threshold: anomaly.threshold,
      ratio: anomaly.ratio,
      date: expense.date,
    });
    previousAmounts.push(Number(expense.amount || 0));
    priorByCategory.set(expense.category, previousAmounts);
  }

  const festivalEnd = new Date(festival.endDate);
  festivalEnd.setUTCHours(23, 59, 59, 999);
  const duration = Math.max(1, festivalEnd.getTime() - festival.startDate.getTime());
  const progress = Math.max(0, Math.min(1, (Date.now() - festival.startDate.getTime()) / duration));
  const estimatedContributions = projectedTotal(currentContributions, progress, historicalContributions);
  const estimatedExpenses = projectedTotal(currentExpenses, progress, historicalExpenses);
  const festivalCompleted = Date.now() > festivalEnd.getTime();
  const estimatedBalance = estimatedContributions == null || estimatedExpenses == null
    ? null
    : estimatedContributions - estimatedExpenses;
  const budget = festival.plannedExpenseBudget == null ? null : Number(festival.plannedExpenseBudget);
  const budgetStatus = budget == null
    ? "No planned expense budget set"
    : currentExpenses > budget
      ? "Current expenses exceed the planned budget"
      : estimatedExpenses != null && estimatedExpenses > budget
        ? "Forecast may exceed the planned budget"
        : budget > 0 && currentExpenses >= budget * 0.8
          ? "Current expenses are approaching the planned budget"
        : "Current spend and forecast are within the planned budget";

  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, contributions: 0, expenses: 0 };
  });
  const months = new Map(monthBuckets.map((row) => [row.month, row]));
  for (const donor of donors) {
    const key = `${donor.date.getFullYear()}-${String(donor.date.getMonth() + 1).padStart(2, "0")}`;
    const row = months.get(key);
    if (row) row.contributions += Number(donor.amount || 0);
  }
  for (const expense of expenses) {
    const key = `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, "0")}`;
    const row = months.get(key);
    if (row) row.expenses += Number(expense.amount || 0);
  }

  const forecast = {
    currentContributions,
    currentExpenses,
    currentBalance,
    estimatedContributions: festivalCompleted ? currentContributions : estimatedContributions,
    estimatedExpenses: festivalCompleted ? currentExpenses : estimatedExpenses,
    estimatedBalance: festivalCompleted ? currentBalance : estimatedBalance,
    confidence: festivalCompleted ? "High" : progress < 0.15 ? (comparableHistoricalFestivals ? "Low" : "Insufficient data") : comparableHistoricalFestivals >= 2 ? "Medium" : "Low",
    festivalProgress: Math.round(progress * 100),
    plannedExpenseBudget: budget,
    budgetStatus,
  };
  const insights = await generateInsights({
    festival: festival.name,
    forecast,
    expenseByCategory,
    recentMonthlyTrend: monthBuckets,
    historicalFestivalsCompared: comparableHistoricalFestivals,
    historicalMedianContributions: median(historicalContributions),
    historicalMedianExpenses: median(historicalExpenses),
    possibleExpenseAnomalies: expenseAlerts,
    upcomingEvents: events.map((event) => ({ name: event.name, date: event.date, status: event.status })),
  });
  return { forecast, expenseByCategory, expenseAlerts, monthlyTrend: monthBuckets, historicalFestivalsCompared: comparableHistoricalFestivals, upcomingEvents: events, insights };
}

export function classifyExpenseAnomaly(amount: number, previousAmounts: number[]) {
  if (previousAmounts.length < 5) return null;
  const baseline = median(previousAmounts);
  const deviations = previousAmounts.map((value) => Math.abs(value - baseline));
  const medianDeviation = median(deviations);
  const threshold = Math.max(baseline * 2, baseline + medianDeviation * 3);
  if (baseline <= 0 || amount <= threshold) return null;
  return { baseline, threshold, sampleSize: previousAmounts.length, ratio: amount / baseline };
}

export function classifyBudgetThreshold(previousExpenses: number, currentExpenses: number, budget: number | null) {
  if (budget == null || budget <= 0) return null;
  if (previousExpenses < budget && currentExpenses >= budget) return "exceeded" as const;
  if (previousExpenses < budget * 0.8 && currentExpenses >= budget * 0.8) return "approaching" as const;
  return null;
}

export async function reviewExpenseForAnomaly(expense: ExpenseInput, festival: FestivalInput) {
  const festivalIds = (await Festival.find({ createdBy: festival.createdBy }).select("festId")).map((item) => item.festId);
  const [previous, expenseTotals] = await Promise.all([
    Expense.find({
      festId: { $in: festivalIds },
      category: expense.category,
      _id: { $ne: expense._id },
      createdAt: { $lt: expense.createdAt },
    }).select("amount"),
    Expense.aggregate([
      { $match: { festId: festival.festId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const anomaly = classifyExpenseAnomaly(Number(expense.amount), previous.map((item) => Number(item.amount || 0)));
  const totalExpenses = Number(expenseTotals[0]?.total || 0);
  const previousExpenses = Math.max(0, totalExpenses - Number(expense.amount || 0));
  const budget = festival.plannedExpenseBudget == null ? null : Number(festival.plannedExpenseBudget);
  const budgetAlert = classifyBudgetThreshold(previousExpenses, totalExpenses, budget);
  const approachingBudget = budgetAlert === "approaching";
  const exceededBudget = budgetAlert === "exceeded";
  if (!anomaly && !approachingBudget && !exceededBudget) return null;

  const safeSummary = anomaly
    ? `An automated pattern check flagged a ${expense.category} expense of ${currency(expense.amount)}. The historical median across ${anomaly.sampleSize} earlier same-category expenses is ${currency(anomaly.baseline)} (${anomaly.ratio.toFixed(1)}x). This is a review signal, not evidence of wrongdoing.`
    : "No unusual expense pattern was detected.";
  let explanation = anomaly ? safeSummary : "";
  if (anomaly && env.geminiApiKey) {
    try {
      const response = await new GoogleGenAI({ apiKey: env.geminiApiKey }).models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `Explain this anomaly signal to festival staff in 1-2 neutral sentences. Do not accuse anyone or infer intent. Suggest checking the invoice and category. Data: ${JSON.stringify({ category: expense.category, amount: expense.amount, historicalMedian: anomaly.baseline, sampleSize: anomaly.sampleSize })}`,
        config: { maxOutputTokens: 120, temperature: 0.1 },
      });
      if (response.text?.trim()) explanation = `${safeSummary}\nAI note: ${response.text.trim()}`;
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("Expense anomaly Gemini explanation failed:", env.geminiApiKey ? detail.replaceAll(env.geminiApiKey, "[redacted]") : detail);
    }
  }

  const committeeUsers = await CommitteeMember.find({ festId: festival.festId, status: "approved" }).distinct("user");
  const staffDetails = [
    ...(anomaly ? [`${expense.category} expense ${currency(expense.amount)} is ${anomaly.ratio.toFixed(1)}× the historical median ${currency(anomaly.baseline)}.`] : []),
    ...(exceededBudget && budget != null ? [`Recorded expenses ${currency(totalExpenses)} have reached/exceeded the planned budget ${currency(budget)}.`] : approachingBudget && budget != null ? [`Recorded expenses ${currency(totalExpenses)} have reached 80% of the planned budget ${currency(budget)}.`] : []),
    "Review the supporting records; this is not an accusation.",
  ].join(" ");
  const title = exceededBudget ? "Planned budget exceeded" : approachingBudget ? "Budget review threshold reached" : "AI expense review alert";
  await Promise.allSettled([
    notify(
      String(festival.createdBy),
      title,
      staffDetails,
      "financial-alert",
      "/admin/expenses",
    ),
    ...committeeUsers.map((userId) => notify(
      String(userId),
      title,
      staffDetails,
      "financial-alert",
      "/committee/expenses",
    )),
  ]);

  const publicNotices = [
    ...(anomaly ? ["A possible expense pattern was flagged for confidential staff review. This is an automated review signal, not an accusation."] : []),
    ...(exceededBudget ? ["Festival spending crossed a planned budget limit. Festival staff are reviewing it."] : approachingBudget ? ["Festival spending reached a planned budget-review threshold. Festival staff are reviewing it."] : []),
  ];
  await CommunityMessage.create({
    festival: festival._id,
    festId: festival.festId,
    senderName: "FestFund AI",
    senderRole: "SYSTEM",
    text: publicNotices.join("\n"),
  });
  return { anomaly, approachingBudget, exceededBudget, explanation };
}