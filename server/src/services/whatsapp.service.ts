import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumber } from "libphonenumber-js";
import type { Types } from "mongoose";
import { Donor, WhatsAppSettings } from "../models/index.js";
import { env } from "../config/env.js";
import { getOrCreateReceipt } from "./receipt.service.js";
import { notify } from "./notification.service.js";

type WhatsAppStatus = "sent" | "delivered" | "read" | "pending" | "not_configured" | "no_number" | "failed" | "not_available";

type DonationInput = {
  _id: Types.ObjectId;
  festival: Types.ObjectId;
  festId: string;
  name: string;
  mobile: string;
  amount: number;
  date: Date;
  category: string;
};

type FestivalInput = {
  _id: Types.ObjectId;
  festId: string;
  name: string;
  contactName?: string;
  contactMobile?: string;
};

type SendResult = {
  status: WhatsAppStatus;
  recipient: string;
  messageId: string;
  sentAt?: Date;
  failureReason: string;
};

function apiConfigured() {
  return Boolean(
    env.whatsapp.accessToken &&
    /^\d+$/.test(env.whatsapp.phoneNumberId) &&
    env.whatsapp.businessAccountId &&
    /^v\d+\.\d+$/.test(env.whatsapp.apiVersion) &&
    env.whatsapp.appSecret &&
    env.whatsapp.verifyToken &&
    env.whatsapp.templateName &&
    env.whatsapp.templateLanguage,
  );
}

export function isWhatsAppConfigured() {
  return apiConfigured();
}

export function isWhatsAppReady(settings: { enabled: boolean; verifiedAt?: Date | null; verifiedConfigFingerprint?: string }) {
  return Boolean(
    settings.enabled &&
    apiConfigured() &&
    settings.verifiedAt &&
    settings.verifiedConfigFingerprint === getWhatsAppConfigFingerprint(),
  );
}

export function getWhatsAppConfigFingerprint() {
  return createHash("sha256")
    .update([
      env.whatsapp.accessToken,
      env.whatsapp.phoneNumberId,
      env.whatsapp.businessAccountId,
      env.whatsapp.apiVersion,
      env.whatsapp.appSecret,
      env.whatsapp.verifyToken,
      env.whatsapp.templateName,
      env.whatsapp.templateLanguage,
    ].join("|"))
    .digest("hex");
}

export function normalizeWhatsAppRecipient(value: string) {
  const input = value.trim();
  if (!input) return { status: "no_number" as const, e164: "", apiRecipient: "", reason: "No mobile number was provided" };
  try {
    const phone = parsePhoneNumber(input, "IN");
    if (!phone.isValid()) throw new Error("Invalid number");
    return { status: "ready" as const, e164: phone.number, apiRecipient: phone.number.slice(1), reason: "" };
  } catch {
    return { status: "failed" as const, e164: "", apiRecipient: "", reason: "Invalid mobile number format" };
  }
}

function safeRemoteReason(value: string, recipient: string) {
  return value
    .replaceAll(env.whatsapp.accessToken, "[redacted]")
    .replaceAll(recipient, "[recipient]")
    .slice(0, 240);
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${path}`;
}

async function sendTemplateMessage(input: {
  donorName: string;
  amount: number;
  festivalName: string;
  festId: string;
  receiptNo: string;
  festivalLink: string;
  recipient: string;
}): Promise<SendResult> {
  const recipient = normalizeWhatsAppRecipient(input.recipient);
  if (recipient.status === "no_number") return { status: "no_number", recipient: "", messageId: "", failureReason: recipient.reason };
  if (recipient.status === "failed") return { status: "failed", recipient: input.recipient, messageId: "", failureReason: recipient.reason };
  if (!apiConfigured()) return { status: "not_configured", recipient: recipient.e164, messageId: "", failureReason: "WhatsApp Cloud API or approved template is not fully configured" };

  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(input.amount);
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient.apiRecipient,
    type: "template",
    template: {
      name: env.whatsapp.templateName,
      language: { code: env.whatsapp.templateLanguage },
      components: [{
        type: "body",
        parameters: [input.donorName, amount, input.festivalName, input.festId, input.receiptNo, input.festivalLink]
          .map((text) => ({ type: "text", text: String(text) })),
      }],
    },
  };

  try {
    const response = await fetch(graphUrl(`${env.whatsapp.phoneNumberId}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json() as {
      messages?: { id?: string; message_status?: string }[];
      error?: { code?: number; error_user_title?: string; error_user_msg?: string; message?: string };
    };
    if (!response.ok) {
      const code = Number(result.error?.code || 0);
      const rawReason = result.error?.error_user_msg || result.error?.error_user_title || result.error?.message || `HTTP ${response.status}`;
      const failureReason = safeRemoteReason(rawReason, recipient.apiRecipient);
      return {
        status: code === 131026 ? "not_available" : "failed",
        recipient: recipient.e164,
        messageId: "",
        failureReason: code ? `${failureReason} (Meta error ${code})` : failureReason,
      };
    }
    const messageId = result.messages?.[0]?.id || "";
    if (!messageId) return { status: "failed", recipient: recipient.e164, messageId: "", failureReason: "WhatsApp API did not confirm a message ID" };
    return { status: "pending", recipient: recipient.e164, messageId, failureReason: "Accepted by WhatsApp; awaiting delivery status webhook" };
  } catch (error) {
    const detail = error instanceof Error && error.name === "TimeoutError"
      ? "WhatsApp request timed out; delivery was not confirmed"
      : error instanceof Error ? error.message : "WhatsApp request failed";
    return { status: "failed", recipient: recipient.e164, messageId: "", failureReason: safeRemoteReason(detail, recipient.apiRecipient) };
  }
}

async function saveNotification(donorId: Types.ObjectId, festId: string, result: SendResult) {
  const update: Record<string, unknown> = {
    "whatsappNotification.status": result.status,
    "whatsappNotification.recipient": result.recipient,
    "whatsappNotification.messageId": result.messageId,
    "whatsappNotification.sentAt": result.sentAt,
    "whatsappNotification.failureReason": result.failureReason,
    "whatsappNotification.lastAttemptAt": new Date(),
  };
  if (/^\+[1-9]\d{7,14}$/.test(result.recipient)) update.mobile = result.recipient;
  await Donor.updateOne({ _id: donorId, festId }, { $set: update });
}

export async function sendDonationReceipt(donor: DonationInput, festival: FestivalInput, adminId: string) {
  if (donor.festId !== festival.festId || String(donor.festival) !== String(festival._id)) {
    return { status: "failed" as const, receiptNo: "", failureReason: "Festival context mismatch" };
  }

  const settings = await WhatsAppSettings.findOne({ adminUser: adminId });
  const parsedPhone = normalizeWhatsAppRecipient(donor.mobile || "");
  if (parsedPhone.status === "no_number") {
    const result: SendResult = { status: "no_number", recipient: "", messageId: "", failureReason: parsedPhone.reason };
    await saveNotification(donor._id, festival.festId, result);
    return { status: result.status, receiptNo: "", failureReason: result.failureReason };
  }
  if (!settings || !isWhatsAppReady(settings)) {
    const result: SendResult = { status: "not_configured", recipient: parsedPhone.e164, messageId: "", failureReason: settings?.enabled ? "WhatsApp Cloud API is not configured" : "WhatsApp notifications are disabled" };
    await saveNotification(donor._id, festival.festId, result);
    return { status: result.status, receiptNo: "", failureReason: result.failureReason };
  }
  if (parsedPhone.status !== "ready") {
    const result: SendResult = { status: "failed", recipient: donor.mobile, messageId: "", failureReason: parsedPhone.reason };
    await saveNotification(donor._id, festival.festId, result);
    return { status: result.status, receiptNo: "", failureReason: result.failureReason };
  }

  try {
    const receipt = await getOrCreateReceipt(donor, festival);
    const festivalLink = new URL(`/festival/${encodeURIComponent(festival.festId)}`, env.festfundPublicUrl).toString();
    const result = await sendTemplateMessage({
      donorName: donor.name,
      amount: donor.amount,
      festivalName: festival.name,
      festId: festival.festId,
      receiptNo: receipt.receiptNo,
      festivalLink,
      recipient: parsedPhone.e164,
    });
    await saveNotification(donor._id, festival.festId, result);
    if (result.status === "failed" || result.status === "not_available") {
      await notify(adminId, "WhatsApp receipt failed", `Contribution ${receipt.receiptNo} was saved, but WhatsApp could not be confirmed. ${result.failureReason}`, "whatsapp", "/admin/donors");
    }
    return { status: result.status, receiptNo: receipt.receiptNo, failureReason: result.failureReason };
  } catch (error) {
    const reason = "WhatsApp receipt preparation failed. The contribution is still recorded.";
    const result: SendResult = { status: "failed", recipient: parsedPhone.e164, messageId: "", failureReason: reason };
    await saveNotification(donor._id, festival.festId, result).catch(() => undefined);
    await notify(adminId, "WhatsApp receipt failed", "The contribution was saved, but its WhatsApp receipt could not be prepared.", "whatsapp", "/admin/donors").catch(() => undefined);
    return { status: result.status, receiptNo: "", failureReason: result.failureReason };
  }
}

export async function verifyWhatsAppConfiguration() {
  if (!apiConfigured()) throw new Error("WhatsApp Cloud API, webhook, or approved template settings are incomplete");
  const response = await fetch(graphUrl(`${env.whatsapp.phoneNumberId}?fields=display_phone_number,verified_name`), {
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
  const result = await response.json() as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  if (!response.ok || !result.display_phone_number) {
    throw new Error(safeRemoteReason(result.error?.message || `Meta verification failed (HTTP ${response.status})`, ""));
  }
  const templateUrl = graphUrl(`${env.whatsapp.businessAccountId}/message_templates?name=${encodeURIComponent(env.whatsapp.templateName)}&fields=name,status,language,components`);
  const templateResponse = await fetch(templateUrl, {
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
  const templates = await templateResponse.json() as {
    data?: { name?: string; status?: string; language?: string; components?: { type?: string; text?: string }[] }[];
    error?: { message?: string };
  };
  if (!templateResponse.ok) {
    throw new Error(safeRemoteReason(templates.error?.message || `Meta template lookup failed (HTTP ${templateResponse.status})`, ""));
  }
  const approvedTemplate = templates.data?.find((template) =>
    template.name === env.whatsapp.templateName &&
    template.language === env.whatsapp.templateLanguage &&
    template.status === "APPROVED",
  );
  const body = approvedTemplate?.components?.find((component) => component.type === "BODY")?.text || "";
  const parameters = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  if (!approvedTemplate || parameters.length !== 6 || parameters.some((number, index) => number !== index + 1)) {
    throw new Error("The configured WhatsApp template must be approved and contain body variables {{1}} through {{6}} in order");
  }
  return { phoneNumber: result.display_phone_number, businessName: result.verified_name || "" };
}

export function verifyWhatsAppWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!env.whatsapp.appSecret || !rawBody || !signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
};

type WhatsAppWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: WhatsAppWebhookStatus[];
      };
    }[];
  }[];
};

export async function processWhatsAppWebhook(payload: unknown) {
  const body = payload as WhatsAppWebhookPayload;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (value?.metadata?.phone_number_id !== env.whatsapp.phoneNumberId) continue;
      for (const event of value?.statuses || []) {
        if (!event.id || !event.status) continue;
        const donor = await Donor.findOne({ "whatsappNotification.messageId": event.id });
        if (!donor) continue;
        const alreadyFailed = donor.whatsappNotification.status === "failed" || donor.whatsappNotification.status === "not_available";
        const code = Number(event.errors?.[0]?.code || 0);
        const status: WhatsAppStatus = event.status === "read"
          ? "read"
          : event.status === "delivered"
            ? "delivered"
            : event.status === "sent"
              ? "sent"
              : event.status === "failed" && code === 131026
                ? "not_available"
                : event.status === "failed" ? "failed" : "pending";
        const timestamp = event.timestamp ? new Date(Number(event.timestamp) * 1000) : new Date();
        donor.whatsappNotification.status = status;
        if (status === "sent" && !donor.whatsappNotification.sentAt) donor.whatsappNotification.sentAt = timestamp;
        if (status === "delivered") donor.whatsappNotification.deliveredAt = timestamp;
        if (status === "read") donor.whatsappNotification.readAt = timestamp;
        donor.whatsappNotification.failureReason = status === "failed" || status === "not_available"
          ? `WhatsApp delivery failed${code ? ` (Meta error ${code})` : ""}${event.errors?.[0]?.title ? `: ${event.errors[0].title}` : ""}`.slice(0, 240)
          : "";
        await donor.save();
        if ((status === "failed" || status === "not_available") && !alreadyFailed) {
          const festival = await (await import("../models/index.js")).Festival.findOne({ festId: donor.festId }).select("createdBy");
          if (festival?.createdBy) {
            await notify(
              String(festival.createdBy),
              "WhatsApp delivery failed",
              `A WhatsApp receipt for a saved contribution could not be delivered. Review the donor record before retrying. ${donor.whatsappNotification.failureReason}`,
              "whatsapp",
              "/admin/donors",
            );
          }
        }
      }
    }
  }
}