import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumber } from "libphonenumber-js";
import twilio from "twilio";
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

function getTwilioConfig() {
  return {
    accountSid: env.whatsapp.twilioAccountSid || env.whatsapp.businessAccountId || "",
    authToken: env.whatsapp.twilioAuthToken || env.whatsapp.appSecret || "",
    whatsappFrom: env.whatsapp.twilioWhatsappFrom || env.whatsapp.businessPhone || "",
    whatsappContentSid: env.whatsapp.twilioWhatsappContentSid,
    statusCallbackUrl: /^https:\/\//i.test(env.whatsapp.twilioStatusCallbackUrl) && !/example\.com/i.test(env.whatsapp.twilioStatusCallbackUrl) ? env.whatsapp.twilioStatusCallbackUrl : "",
  };
}

function isTwilioConfigured() {
  const { accountSid, authToken, whatsappFrom } = getTwilioConfig();
  return Boolean((process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_WHATSAPP_FROM || accountSid.startsWith("AC")) && authToken && whatsappFrom);
}

function legacyMetaConfigured() {
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

function twilioClient() {
  if (!isTwilioConfigured()) return null;
  const { accountSid, authToken } = getTwilioConfig();
  return twilio(accountSid, authToken);
}

function apiConfigured() {
  return isTwilioConfigured() || legacyMetaConfigured();
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
  const { accountSid, authToken, whatsappFrom, whatsappContentSid, statusCallbackUrl } = getTwilioConfig();
  return createHash("sha256")
    .update([accountSid, authToken, whatsappFrom, whatsappContentSid, statusCallbackUrl].join("|"))
    .digest("hex");
}

export function normalizeWhatsAppRecipient(value: string) {
  const input = value.trim();
  if (!input) return { status: "no_number" as const, e164: "", apiRecipient: "", reason: "No mobile number was provided" };
  try {
    const normalized = input.replace(/^whatsapp:/i, "");
    const phone = parsePhoneNumber(normalized, "IN");
    if (!phone || !phone.isValid()) throw new Error("Invalid number");
    return { status: "ready" as const, e164: phone.number, apiRecipient: phone.number.slice(1), reason: "" };
  } catch {
    return { status: "failed" as const, e164: "", apiRecipient: "", reason: "Invalid mobile number format" };
  }
}

function safeRemoteReason(value: string, recipient: string) {
  return String(value)
    .replaceAll(recipient, "[recipient]")
    .slice(0, 240);
}

function mapTwilioStatus(status?: string, code?: number): WhatsAppStatus {
  switch (status) {
    case "accepted":
    case "queued":
    case "sending":
      return "pending";
    case "sent":
      return "sent";
    case "delivered":
    case "received":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
    case "canceled":
      return code === 21614 ? "not_available" : "failed";
    default:
      return "pending";
  }
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
  if (!apiConfigured()) return { status: "not_configured", recipient: recipient.e164, messageId: "", failureReason: "Twilio WhatsApp is not fully configured" };

  if (!isTwilioConfigured()) {
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
      const response = await fetch(`https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`, {
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

  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(input.amount);
  const q = {
    1: input.donorName,
    2: amount,
    3: input.festivalName,
    4: input.festId,
    5: input.receiptNo,
    6: input.festivalLink,
  };

  const { whatsappFrom, whatsappContentSid, statusCallbackUrl } = getTwilioConfig();
  const messageOptions: Record<string, string> = {
    from: whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${recipient.e164}`,
  };
  if (statusCallbackUrl) messageOptions.statusCallback = statusCallbackUrl;

  try {
    const client = twilioClient();
    if (!client) return { status: "not_configured", recipient: recipient.e164, messageId: "", failureReason: "Twilio credentials are missing" };

    // Template mode sends only ContentSid/ContentVariables; free-form mode sends only Body.
    if (whatsappContentSid) {
      messageOptions.contentSid = whatsappContentSid;
      messageOptions.contentVariables = JSON.stringify(q);
    } else {
      if (!(await hasOpenServiceWindow(client, messageOptions.from, messageOptions.to))) {
        console.warn("[whatsapp] 24-hour customer-service window is closed; free-form text not sent");
        return {
          status: "not_available",
          recipient: recipient.e164,
          messageId: "",
          failureReason: "24-hour WhatsApp window is closed. The donor must message the sender first, or an approved template (TWILIO_WHATSAPP_CONTENT_SID) is required.",
        };
      }
      messageOptions.body = `Thank you ${input.donorName}. Your donation of ${amount} for ${input.festivalName} (Fest ID: ${input.festId}) has been recorded. Receipt: ${input.receiptNo}. ${input.festivalLink}`;
    }

    const message = await client.messages.create(messageOptions as any);
    const mapped = mapTwilioStatus(message.status || "queued", message.errorCode || undefined);
    console.info(`[whatsapp] Twilio message created sid=${message.sid} status=${message.status} mode=${whatsappContentSid ? "template" : "text"}`);
    const failureReason = mapped === "failed" || mapped === "not_available"
      ? `Twilio delivery failed: ${message.errorMessage || message.status || "unknown message error"}`
      : "Accepted by Twilio; awaiting delivery status callback";
    return {
      status: mapped === "pending" ? "pending" : mapped,
      recipient: recipient.e164,
      messageId: String(message.sid || ""),
      sentAt: message.dateCreated ? new Date(message.dateCreated.toISOString()) : undefined,
      failureReason,
    };
  } catch (error) {
    const code = Number((error as { code?: number })?.code || 0);
    const detail = describeTwilioError(code, error instanceof Error ? error.message : "Twilio request failed");
    console.error(`[whatsapp] Twilio send failed${code ? ` code=${code}` : ""}: ${safeRemoteReason(detail, recipient.e164)}`);
    return {
      status: code === 63016 || code === 63049 ? "not_available" : "failed",
      recipient: recipient.e164,
      messageId: "",
      failureReason: safeRemoteReason(code ? `${detail} (Twilio error ${code})` : detail, recipient.e164),
    };
  }
}

function describeTwilioError(code: number, fallback: string) {
  switch (code) {
    case 63016: return "Outside the 24-hour WhatsApp window; an approved template is required";
    case 63015: return "Sandbox recipient has not joined the sandbox; send the join code from this phone first";
    case 63007: return "The WhatsApp sender (TWILIO_WHATSAPP_FROM) is not a valid Twilio WhatsApp sender";
    case 63049: return "WhatsApp did not deliver this message (template or marketing restriction)";
    case 21654: return "Twilio rejected plain text for this account/sender. A Content Template is required: upgrade the Twilio account, create the template, and set TWILIO_WHATSAPP_CONTENT_SID";
    case 21211: return "Invalid recipient phone number";
    case 20003: return "Twilio authentication failed; check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN";
    case 21608: return "Recipient is not verified for this Twilio account";
    default: return fallback;
  }
}

async function hasOpenServiceWindow(client: ReturnType<typeof twilio>, from: string, to: string) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  // Inbound messages from the donor to our sender; dateSentAfter is day-granular, so filter precisely.
  const inbound = await client.messages.list({
    from: to,
    to: from,
    dateSentAfter: new Date(cutoff - 24 * 60 * 60 * 1000),
    limit: 50,
  });
  return inbound.some((message) => message.dateSent && message.dateSent.getTime() >= cutoff);
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
    const result: SendResult = { status: "not_configured", recipient: parsedPhone.e164, messageId: "", failureReason: settings?.enabled ? "Twilio WhatsApp is not configured" : "WhatsApp notifications are disabled" };
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
  if (!apiConfigured()) throw new Error("WhatsApp settings are incomplete");
  if (!isTwilioConfigured()) {
    const response = await fetch(`https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json() as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
    if (!response.ok || !result.display_phone_number) {
      throw new Error(safeRemoteReason(result.error?.message || `Meta verification failed (HTTP ${response.status})`, ""));
    }
    const templateUrl = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.businessAccountId}/message_templates?name=${encodeURIComponent(env.whatsapp.templateName)}&fields=name,status,language,components`;
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

  const { accountSid, whatsappFrom } = getTwilioConfig();
  const client = twilioClient();
  if (!client) throw new Error("Twilio client could not be created");
  const account = await client.api.accounts(accountSid).fetch();
  return { phoneNumber: whatsappFrom, businessName: account.friendlyName || "Twilio WhatsApp" };
}

export function verifyWhatsAppWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined, url?: string, params?: Record<string, unknown>) {
  if (isTwilioConfigured()) {
    const token = env.whatsapp.twilioAuthToken || env.whatsapp.appSecret;
    if (!token) return false;
    if (url && params && signature) {
      const candidates = [url, getTwilioConfig().statusCallbackUrl].filter(Boolean);
      if (candidates.some((candidate) => twilio.validateRequest(token, signature, candidate, params as Record<string, any>))) return true;
    }
    if (rawBody && signature) {
      const expected = Buffer.from(createHmac("sha256", token).update(rawBody).digest("base64"));
      const received = Buffer.from(signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature);
      return received.length === expected.length && timingSafeEqual(received, expected);
    }
    return false;
  }

  if (!env.whatsapp.appSecret || !rawBody || !signature?.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

type WhatsAppWebhookStatus = {
  MessageSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
  Status?: string;
  ErrorCode?: string | number;
  ErrorMessage?: string;
  Timestamp?: string;
};

type WhatsAppWebhookPayload = {
  MessageSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
  Status?: string;
  ErrorCode?: string | number;
  ErrorMessage?: string;
  Timestamp?: string;
};

export async function processWhatsAppWebhook(payload: unknown) {
  const body = payload as Record<string, any>;
  if (body?.entry && Array.isArray(body.entry)) {
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
    return;
  }

  const messageId = body.MessageSid || "";
  const statusValue = body.MessageStatus || body.SmsStatus || body.Status || "";
  const errorCode = typeof body.ErrorCode === "string" ? Number(body.ErrorCode) : Number(body.ErrorCode || 0);
  const errorMessage = body.ErrorMessage || "";

  if (!messageId || !statusValue) return;
  console.info(`[whatsapp] Twilio status callback sid=${messageId} status=${statusValue}${errorCode ? ` errorCode=${errorCode}` : ""}`);
  const donor = await Donor.findOne({ "whatsappNotification.messageId": messageId });
  if (!donor) return;

  const alreadyFailed = donor.whatsappNotification.status === "failed" || donor.whatsappNotification.status === "not_available";
  const mappedStatus = mapTwilioStatus(statusValue, errorCode);
  const timestamp = body.Timestamp ? new Date(Number(body.Timestamp) * 1000) : new Date();

  donor.whatsappNotification.status = mappedStatus;
  if (mappedStatus === "sent" && !donor.whatsappNotification.sentAt) donor.whatsappNotification.sentAt = timestamp;
  if (mappedStatus === "delivered") donor.whatsappNotification.deliveredAt = timestamp;
  if (mappedStatus === "read") donor.whatsappNotification.readAt = timestamp;
  donor.whatsappNotification.failureReason = mappedStatus === "failed" || mappedStatus === "not_available"
    ? `Twilio delivery failed${errorCode ? ` (Twilio error ${errorCode})` : ""}${errorMessage ? `: ${errorMessage}` : ""}`.slice(0, 240)
    : "";
  await donor.save();

  if ((mappedStatus === "failed" || mappedStatus === "not_available") && !alreadyFailed) {
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