import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { Donor, Expense, Festival, Receipt } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { getOrCreateReceipt } from "../services/receipt.service.js";

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
  const receipt = await getOrCreateReceipt(donor, festival);
  res.status(201).json({ success: true, data: receipt });
});

export const receiptPdf = asyncHandler(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id);
  if (!receipt) throw new ApiError(404, "Receipt not found");
  const festival = await loadFestivalForActor(req, receipt.festId, "read");
  sendReceiptPdf(res, { ...receipt.toObject(), adminName: receipt.adminName || festival.contactName, adminMobile: receipt.adminMobile || festival.contactMobile }, req.query.inline === "1");
});

function sendReceiptPdf(res: import("express").Response, receipt: { receiptNo: string; festivalName: string; festId: string; donorName: string; amount: number; category?: string; contributionDate: Date; adminName?: string; adminMobile?: string }, inline: boolean) {
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
  if (receipt.adminName || receipt.adminMobile) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Festival admin contact");
    doc.font("Helvetica").fillColor("#333").text(receipt.adminName || "Festival administrator");
    if (receipt.adminMobile) doc.text(`Mobile: ${receipt.adminMobile}`, { link: `tel:${receipt.adminMobile}` });
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
  const receipt = await getOrCreateReceipt(donor, festival);
  sendReceiptPdf(res, { ...receipt.toObject(), adminName: receipt.adminName || festival.contactName, adminMobile: receipt.adminMobile || festival.contactMobile }, false);
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
  if (type === "donors" || type === "expenses") drawReportTable(doc, type, donors, expenses, [], title, contributions, spent);
  else for (const line of reportLines(type, donors, expenses, [], [], [], contributions, spent)) doc.text(line);
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
  if (type === "committee" || type === "donors" || type === "expenses") {
    drawReportTable(doc, type, donors, expenses, committee, title, contributions, spent);
  } else {
    const body = reportLines(type, donors, expenses, events, committee, ads, contributions, spent);
    for (const line of body) doc.text(line);
  }
  doc.end();
});

function drawReportTable(
  doc: InstanceType<typeof PDFDocument>,
  type: string,
  donors: { name: string; amount: number; date: Date; category: string }[],
  expenses: { description: string; amount: number; category: string; date: Date }[],
  committee: { user?: unknown }[],
  title: string,
  contributions: number,
  spent: number,
) {
  type Column = { title: string; ratio: number; align?: "left" | "right" };
  const columns: Column[] = type === "committee"
    ? [{ title: "Committee member", ratio: 0.34 }, { title: "Email", ratio: 0.39 }, { title: "Mobile", ratio: 0.27 }]
    : type === "expenses"
      ? [{ title: "Expense", ratio: 0.38 }, { title: "Category", ratio: 0.21 }, { title: "Amount", ratio: 0.17, align: "right" }, { title: "Date", ratio: 0.24 }]
      : [{ title: "Donor", ratio: 0.34 }, { title: "Category", ratio: 0.22 }, { title: "Amount", ratio: 0.18, align: "right" }, { title: "Date", ratio: 0.26 }];
  const rows: { cells: string[]; total?: boolean }[] = type === "committee"
    ? committee.map((member) => {
      const user = member.user as { name?: string; email?: string; mobile?: string } | null;
      return { cells: [user?.name || "Member", user?.email || "", user?.mobile || ""] };
    })
    : type === "expenses"
      ? [
        ...expenses.map((expense) => ({ cells: [expense.description, expense.category, inr(expense.amount), new Date(expense.date).toLocaleDateString("en-IN")] })),
        { cells: ["TOTAL EXPENSES", "", inr(spent), ""], total: true },
      ]
      : [
        ...donors.map((donor) => ({ cells: [donor.name, donor.category, inr(donor.amount), new Date(donor.date).toLocaleDateString("en-IN")] })),
        { cells: ["TOTAL DONATIONS", "", inr(contributions), ""], total: true },
      ];
  const margin = 42;
  const tableWidth = doc.page.width - margin * 2;
  const widths = columns.map((column) => tableWidth * column.ratio);
  const headerHeight = 28;
  let y = doc.y;

  const drawHeader = (continuation = false) => {
    if (continuation) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(`${title} (continued)`, margin, margin, { width: tableWidth });
      y = margin + 20;
    }
    let x = margin;
    columns.forEach((column, index) => {
      doc.rect(x, y, widths[index], headerHeight).fillAndStroke("#FCE8D7", "#E7C9B1");
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#572B13").text(column.title, x + 6, y + 8, { width: widths[index] - 12, align: column.align || "left" });
      x += widths[index];
    });
    y += headerHeight;
  };

  drawHeader();
  rows.forEach((row, rowIndex) => {
    doc.font(row.total ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const textHeights = row.cells.map((cell, index) => doc.heightOfString(cell || " ", { width: widths[index] - 12 }));
    const rowHeight = Math.max(28, ...textHeights.map((height) => height + 12));
    if (y + rowHeight > doc.page.height - margin) {
      doc.addPage();
      drawHeader(true);
    }
    let x = margin;
    row.cells.forEach((cell, index) => {
      const fill = row.total ? "#FFF0E4" : rowIndex % 2 === 0 ? "#FFFFFF" : "#FAFAFA";
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(fill, "#E4E4E4");
      doc.font(row.total ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#24170F").text(cell || "", x + 6, y + 6, {
        width: widths[index] - 12,
        align: columns[index].align || "left",
      });
      x += widths[index];
    });
    y += rowHeight;
  });
  doc.y = y + 10;
}

function reportLines(type: string, donors: { name: string; amount: number; date: Date; category: string }[], expenses: { description: string; amount: number; category: string; date: Date }[], events: { name: string; date: Date; status: string; location?: string }[], committee: { user?: unknown }[], ads: { title: string; status: string; views: number; vendor?: unknown }[], contributions: number, spent: number) {
  const lines: string[] = [];
  if (type === "summary" || type === "funds") lines.push(`Total contributions: ${inr(contributions)}`, `Total expenses: ${inr(spent)}`, `Balance: ${inr(contributions - spent)}`, "");
  if (type === "donors") {
    lines.push(`Total donations: ${inr(contributions)}`, "", "Donations");
    donors.forEach((d) => lines.push(`${d.name} · ${inr(d.amount)} · ${d.category} · ${new Date(d.date).toLocaleDateString("en-IN")}`));
  } else if (type === "summary") {
    lines.push("Donors");
    donors.forEach((d) => lines.push(`${d.name} · ${inr(d.amount)} · ${d.category} · ${new Date(d.date).toLocaleDateString("en-IN")}`));
    lines.push("");
  }
  if (type === "expenses") {
    lines.push(`Total expenses: ${inr(spent)}`, "", "Expenses");
    expenses.forEach((e) => lines.push(`${e.description} · ${e.category} · ${inr(e.amount)} · ${new Date(e.date).toLocaleDateString("en-IN")}`));
  } else if (type === "summary" || type === "funds") {
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
      const user = m.user as { name?: string; email?: string; mobile?: string } | null;
      lines.push(`${user?.name || "Member"} · ${user?.email || ""} · ${user?.mobile || ""}`);
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
    return ["Name,Category,Amount,Date", ...donors.map((d) => `"${d.name}","${d.category}",${d.amount},${new Date(d.date).toISOString().slice(0, 10)}`), `Total donations,,${contributions},`].join("\n");
  }
  if (type === "expenses") {
    return ["Description,Category,Amount,Date", ...expenses.map((e) => `"${e.description}","${e.category}",${e.amount},${new Date(e.date).toISOString().slice(0, 10)}`), `Total expenses,,${spent},`].join("\n");
  }
  if (type === "events") {
    return ["Name,Status,Date", ...events.map((e) => `"${e.name}","${e.status}",${new Date(e.date).toISOString().slice(0, 10)}`)].join("\n");
  }
  if (type === "committee") {
    return ["Name,Email,Mobile", ...committee.map((m) => {
      const user = m.user as { name?: string; email?: string; mobile?: string } | null;
      return `"${user?.name || ""}","${user?.email || ""}","${user?.mobile || ""}"`;
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
    if (type === "donors") sheet.addRow(["Total donations", "", contributions]);
    sheet.addRow([]);
  }
  if (type === "expenses" || type === "summary" || type === "funds") {
    sheet.addRow(["Expense", "Category", "Amount", "Date"]);
    expenses.forEach((e) => sheet.addRow([e.description, e.category, e.amount, new Date(e.date).toISOString().slice(0, 10)]));
    if (type === "expenses") sheet.addRow(["Total expenses", "", spent]);
    sheet.addRow([]);
  }
  if (type === "events" || type === "summary") {
    sheet.addRow(["Event", "Status", "Date"]);
    events.forEach((e) => sheet.addRow([e.name, e.status, new Date(e.date).toISOString().slice(0, 10)]));
  }
  if (type === "committee") {
    sheet.addRow(["Name", "Email", "Mobile"]);
    committee.forEach((m) => {
      const user = m.user as { name?: string; email?: string; mobile?: string } | null;
      sheet.addRow([user?.name || "", user?.email || "", user?.mobile || ""]);
    });
  }
  if (type === "advertisements") {
    sheet.addRow(["Title", "Status", "Views"]);
    ads.forEach((a) => sheet.addRow([a.title, a.status, a.views]));
  }
  if (!["donors", "expenses", "committee"].includes(type)) {
    sheet.addRow([]);
    sheet.addRow(["Contributions", contributions]);
    sheet.addRow(["Expenses", spent]);
    sheet.addRow(["Balance", contributions - spent]);
  }
}
