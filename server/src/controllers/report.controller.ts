import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { Donor, Expense, Festival, Receipt } from "../models/index.js";
import { nextSeq } from "../models/Counter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";

function logoPath() {
  const candidate = path.resolve(process.cwd(), "assets", "festfund-logo.png");
  return fs.existsSync(candidate) ? candidate : "";
}

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export const listReceipts = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const receipts = await Receipt.find({ festId }).sort({ createdAt: -1 });
  res.json({ success: true, data: receipts });
});

export const createReceipt = asyncHandler(async (req, res) => {
  const donor = await Donor.findById(req.body.donorId);
  if (!donor) throw new ApiError(404, "Donor record not found");
  const festival = await loadFestivalForActor(req, donor.festId, "read");
  let receipt = await Receipt.findOne({ donor: donor._id });
  if (!receipt) {
    const seq = await nextSeq("receipt");
    receipt = await Receipt.create({
      receiptNo: `FF-${String(seq).padStart(5, "0")}`,
      donor: donor._id,
      festival: festival._id,
      festId: festival.festId,
      festivalName: festival.name,
      donorName: donor.name,
      amount: donor.amount,
      contributionDate: donor.date,
      category: donor.category,
    });
  }
  res.status(201).json({ success: true, data: receipt });
});

export const receiptPdf = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) throw new ApiError(404, "Receipt not found");
  await loadFestivalForActor(req, receipt.festId, "read");
  sendReceiptPdf(res, receipt, req.query.inline === "1");
});

function sendReceiptPdf(res: import("express").Response, receipt: { receiptNo: string; festivalName: string; festId: string; donorName: string; amount: number; category?: string; contributionDate: Date }, inline: boolean) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${receipt.receiptNo}.pdf"`);
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  doc.pipe(res);
  const logo = logoPath();
  if (logo) doc.image(logo, 48, 42, { width: 72 });
  doc.fillColor("#E65100").fontSize(22).text("FESTFUND", 140, 56);
  doc.fillColor("#1A0D05").fontSize(12).text("Donor contribution receipt", 140, 84);
  doc.moveDown(4);
  doc.fontSize(18).fillColor("#FF6B00").text("DONOR CONTRIBUTION RECEIPT", { align: "left" });
  doc.moveDown(0.6);
  doc.fillColor("#1A0D05").fontSize(12);
  const rows: [string, string][] = [
    ["Receipt No", receipt.receiptNo],
    ["Festival", receipt.festivalName],
    ["Fest ID", receipt.festId],
    ["Donor", receipt.donorName],
    ["Contribution", inr(receipt.amount)],
    ["Category", receipt.category || "General"],
    ["Date", new Date(receipt.contributionDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
  ];
  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").text(label, { continued: false });
    doc.font("Helvetica").fillColor("#333").text(value);
    doc.moveDown(0.4);
    doc.fillColor("#1A0D05");
  }
  doc.moveDown(1.2);
  doc.fontSize(10).fillColor("#666").text("This receipt records a contribution entered by the festival admin. FestFund does not collect online donations.");
  doc.end();
}

export const publicDonorReceipt = asyncHandler(async (req, res) => {
  const festId = String(req.params.festId || "").trim().toUpperCase();
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Fest ID not found");
  const donor = await Donor.findOne({ _id: req.params.donorId, festId });
  if (!donor) throw new ApiError(404, "Donor record not found");
  let receipt = await Receipt.findOne({ donor: donor._id });
  if (!receipt) {
    const seq = await nextSeq("receipt");
    receipt = await Receipt.create({
      receiptNo: `FF-${String(seq).padStart(5, "0")}`,
      donor: donor._id,
      festival: festival._id,
      festId: festival.festId,
      festivalName: festival.name,
      donorName: donor.name,
      amount: donor.amount,
      contributionDate: donor.date,
      category: donor.category,
    });
  }
  sendReceiptPdf(res, receipt, false);
});

export const publicFestivalReport = asyncHandler(async (req, res) => {
  const festId = String(req.params.festId || "").trim().toUpperCase();
  const type = String(req.params.type);
  if (type !== "donors" && type !== "expenses") throw new ApiError(404, "Report not found");
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Fest ID not found");
  const format = String(req.query.format || "pdf");
  const donors = await Donor.find({ festId }).sort({ date: -1 });
  const expenses = await Expense.find({ festId }).sort({ date: -1 });
  const contributions = donors.reduce((sum, donor) => sum + donor.amount, 0);
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const title = type === "donors" ? "Donor Report" : "Expense Report";
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title);
    fillSheet(sheet, type, donors, expenses, [], [], [], contributions, spent, festival.name, festival.festId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-${festId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-${festId}.pdf"`);
  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);
  const logo = logoPath();
  if (logo) doc.image(logo, 42, 36, { width: 48 });
  doc.fillColor("#E65100").fontSize(16).text("FESTFUND", 100, 46);
  doc.fillColor("#1A0D05").fontSize(18).text(title, 42, 100);
  doc.fontSize(11).fillColor("#444").text(`${festival.name} · ${festival.festId}`, 42, 126);
  doc.moveDown(2);
  doc.fontSize(10).fillColor("#111");
  for (const line of reportLines(type, donors, expenses, [], [], [], contributions, spent)) doc.text(line);
  doc.end();
});

type ReportType = "summary" | "donors" | "expenses" | "funds" | "events" | "committee" | "advertisements";

export const downloadReport = asyncHandler(async (req, res) => {
  const type = String(req.params.type) as ReportType;
  const festId = String(req.query.festId || "").toUpperCase();
  const format = String(req.query.format || "pdf");
  const festival = festId ? await loadFestivalForActor(req, festId, "read") : null;
  if (!festival && type !== "advertisements") throw new ApiError(400, "Fest ID is required");
  const { Event, CommitteeMember, Advertisement, Vendor } = await import("../models/index.js");
  const donors = festival ? await Donor.find({ festId: festival.festId }).sort({ date: -1 }) : [];
  const expenses = festival ? await Expense.find({ festId: festival.festId }).sort({ date: -1 }) : [];
  const events = festival ? await Event.find({ festId: festival.festId }).sort({ date: 1 }) : [];
  const committee = festival ? await CommitteeMember.find({ festId: festival.festId, status: "approved" }).populate("user", "name email mobile") : [];
  const ads = await Advertisement.find().populate("vendor", "businessName category");
  const contributions = donors.reduce((s, d) => s + d.amount, 0);
  const spent = expenses.reduce((s, d) => s + d.amount, 0);

  const titleMap: Record<string, string> = {
    summary: "Festival Summary",
    donors: "Donor Report",
    expenses: "Expense Report",
    funds: "Fund Summary",
    events: "Event Report",
    committee: "Committee Report",
    advertisements: "Vendor Advertisement Report",
  };
  const title = titleMap[type] || "Report";

  if (format === "csv") {
    const lines = toCsv(type, donors, expenses, events, committee, ads, contributions, spent);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-${festId || "all"}.csv"`);
    res.send(lines);
    return;
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 28));
    fillSheet(sheet, type, donors, expenses, events, committee, ads, contributions, spent, festival?.name || "", festival?.festId || "");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-${festId || "all"}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${type}-${festId || "all"}.pdf"`);
  const doc = new PDFDocument({ size: "A4", margin: 42 });
  doc.pipe(res);
  const logo = logoPath();
  if (logo) doc.image(logo, 42, 36, { width: 48 });
  doc.fillColor("#E65100").fontSize(16).text("FESTFUND", 100, 46);
  doc.fillColor("#1A0D05").fontSize(18).text(title, 42, 100);
  if (festival) doc.fontSize(11).fillColor("#444").text(`${festival.name} · ${festival.festId}`, 42, 126);
  doc.moveDown(2);
  doc.fontSize(10).fillColor("#111");
  const body = reportLines(type, donors, expenses, events, committee, ads, contributions, spent);
  for (const line of body) doc.text(line);
  doc.end();
});

function reportLines(type: string, donors: { name: string; amount: number; date: Date; category: string }[], expenses: { description: string; amount: number; category: string; date: Date }[], events: { name: string; date: Date; status: string; location?: string }[], committee: { user?: unknown }[], ads: { title: string; status: string; views: number; vendor?: unknown }[], contributions: number, spent: number) {
  const lines = [`Total contributions: ${inr(contributions)}`, `Total expenses: ${inr(spent)}`, `Balance: ${inr(contributions - spent)}`, ""];
  if (type === "summary" || type === "donors") {
    lines.push("Donors");
    donors.forEach((d) => lines.push(`${d.name} · ${inr(d.amount)} · ${d.category} · ${new Date(d.date).toLocaleDateString("en-IN")}`));
    lines.push("");
  }
  if (type === "summary" || type === "expenses" || type === "funds") {
    lines.push("Expenses");
    expenses.forEach((e) => lines.push(`${e.description} · ${e.category} · ${inr(e.amount)}`));
    lines.push("");
  }
  if (type === "summary" || type === "events") {
    lines.push("Events");
    events.forEach((e) => lines.push(`${e.name} · ${e.status} · ${new Date(e.date).toLocaleDateString("en-IN")}`));
    lines.push("");
  }
  if (type === "committee") {
    lines.push("Committee");
    committee.forEach((m) => {
      const user = m.user as { name?: string; email?: string } | null;
      lines.push(`${user?.name || "Member"} · ${user?.email || ""}`);
    });
  }
  if (type === "advertisements") {
    lines.push("Advertisements (free)");
    ads.forEach((a) => {
      const vendor = a.vendor as { businessName?: string } | null;
      lines.push(`${a.title} · ${vendor?.businessName || ""} · ${a.status} · ${a.views} views`);
    });
  }
  return lines;
}

function toCsv(type: string, donors: { name: string; mobile?: string; amount: number; date: Date; category: string }[], expenses: { description: string; amount: number; category: string; date: Date }[], events: { name: string; date: Date; status: string }[], committee: { user?: unknown }[], ads: { title: string; status: string; views: number }[], contributions: number, spent: number) {
  if (type === "donors") {
    return ["Name,Category,Amount,Date", ...donors.map((d) => `"${d.name}","${d.category}",${d.amount},${new Date(d.date).toISOString().slice(0, 10)}`)].join("\n");
  }
  if (type === "expenses") {
    return ["Description,Category,Amount,Date", ...expenses.map((e) => `"${e.description}","${e.category}",${e.amount},${new Date(e.date).toISOString().slice(0, 10)}`)].join("\n");
  }
  if (type === "events") {
    return ["Name,Status,Date", ...events.map((e) => `"${e.name}","${e.status}",${new Date(e.date).toISOString().slice(0, 10)}`)].join("\n");
  }
  if (type === "committee") {
    return ["Name,Email", ...committee.map((m) => {
      const user = m.user as { name?: string; email?: string } | null;
      return `"${user?.name || ""}","${user?.email || ""}"`;
    })].join("\n");
  }
  if (type === "advertisements") {
    return ["Title,Status,Views", ...ads.map((a) => `"${a.title}","${a.status}",${a.views}`)].join("\n");
  }
  return ["Metric,Value", `Contributions,${contributions}`, `Expenses,${spent}`, `Balance,${contributions - spent}`, `Donors,${donors.length}`, `Events,${events.length}`].join("\n");
}

function fillSheet(sheet: ExcelJS.Worksheet, type: string, donors: { name: string; amount: number; date: Date; category: string }[], expenses: { description: string; amount: number; category: string; date: Date }[], events: { name: string; date: Date; status: string }[], committee: { user?: unknown }[], ads: { title: string; status: string; views: number }[], contributions: number, spent: number, name: string, festId: string) {
  sheet.addRow(["FestFund", name, festId]);
  sheet.addRow([]);
  if (type === "donors" || type === "summary" || type === "funds") {
    sheet.addRow(["Donor", "Category", "Amount", "Date"]);
    donors.forEach((d) => sheet.addRow([d.name, d.category, d.amount, new Date(d.date).toISOString().slice(0, 10)]));
    sheet.addRow([]);
  }
  if (type === "expenses" || type === "summary" || type === "funds") {
    sheet.addRow(["Expense", "Category", "Amount", "Date"]);
    expenses.forEach((e) => sheet.addRow([e.description, e.category, e.amount, new Date(e.date).toISOString().slice(0, 10)]));
    sheet.addRow([]);
  }
  if (type === "events" || type === "summary") {
    sheet.addRow(["Event", "Status", "Date"]);
    events.forEach((e) => sheet.addRow([e.name, e.status, new Date(e.date).toISOString().slice(0, 10)]));
  }
  if (type === "committee") {
    sheet.addRow(["Name", "Email"]);
    committee.forEach((m) => {
      const user = m.user as { name?: string; email?: string } | null;
      sheet.addRow([user?.name || "", user?.email || ""]);
    });
  }
  if (type === "advertisements") {
    sheet.addRow(["Title", "Status", "Views"]);
    ads.forEach((a) => sheet.addRow([a.title, a.status, a.views]));
  }
  sheet.addRow([]);
  sheet.addRow(["Contributions", contributions]);
  sheet.addRow(["Expenses", spent]);
  sheet.addRow(["Balance", contributions - spent]);
}
