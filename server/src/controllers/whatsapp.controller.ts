import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Donor, Festival, WhatsAppSettings } from "../models/index.js";
import { loadFestivalForActor } from "../services/access.service.js";
import {
  getWhatsAppConfigFingerprint,
  isWhatsAppReady,
  isWhatsAppConfigured,
  processWhatsAppWebhook,
  sendDonationReceipt,
  verifyWhatsAppConfiguration,
  verifyWhatsAppWebhookSignature,
} from "../services/whatsapp.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

async function getAdminSettings(adminId: string) {
  return WhatsAppSettings.findOneAndUpdate(
    { adminUser: adminId },
    { $setOnInsert: { adminUser: adminId, enabled: false } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

function settingsResponse(settings: NonNullable<Awaited<ReturnType<typeof getAdminSettings>>>) {
  const configured = isWhatsAppConfigured();
  const connected = configured && Boolean(settings.verifiedAt) && settings.verifiedConfigFingerprint === getWhatsAppConfigFingerprint();
  return {
    enabled: isWhatsAppReady(settings),
    configured,
    status: !configured ? "not_configured" : connected ? "connected" : "not_tested",
    businessPhoneNumber: settings.verifiedPhoneNumber || env.whatsapp.businessPhone,
    businessName: settings.verifiedBusinessName,
    verifiedAt: settings.verifiedAt || null,
    lastTestFailure: settings.lastTestFailure,
    templateName: env.whatsapp.templateName,
    templateLanguage: env.whatsapp.templateLanguage,
  };
}

export const getWhatsAppSettings = asyncHandler(async (req, res) => {
  const settings = await getAdminSettings(req.auth!.id);
  res.json({ success: true, data: settingsResponse(settings) });
});

export const updateWhatsAppSettings = asyncHandler(async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Choose whether WhatsApp notifications should be enabled");
  const settings = await getAdminSettings(req.auth!.id);
  const configVerified = settings.verifiedAt && settings.verifiedConfigFingerprint === getWhatsAppConfigFingerprint();
  if (parsed.data.enabled && (!isWhatsAppConfigured() || !configVerified)) {
    throw new ApiError(400, "Test the WhatsApp Cloud API configuration successfully before enabling notifications");
  }
  settings.enabled = parsed.data.enabled;
  await settings.save();
  res.json({ success: true, data: settingsResponse(settings) });
});

export const testWhatsAppSettings = asyncHandler(async (req, res) => {
  const settings = await getAdminSettings(req.auth!.id);
  try {
    const verification = await verifyWhatsAppConfiguration();
    settings.verifiedPhoneNumber = verification.phoneNumber;
    settings.verifiedBusinessName = verification.businessName;
    settings.verifiedAt = new Date();
    settings.verifiedConfigFingerprint = getWhatsAppConfigFingerprint();
    settings.lastTestFailure = "";
    await settings.save();
    res.json({ success: true, data: settingsResponse(settings) });
  } catch (error) {
    settings.verifiedAt = undefined;
    settings.verifiedConfigFingerprint = "";
    settings.lastTestFailure = error instanceof Error ? error.message.slice(0, 240) : "WhatsApp configuration test failed";
    await settings.save();
    throw new ApiError(502, settings.lastTestFailure);
  }
});

export const resendDonationWhatsApp = asyncHandler(async (req, res) => {
  const parsed = z.object({ festId: z.string().min(4).max(80) }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Fest ID is required");
  const festId = parsed.data.festId.trim().toUpperCase();
  const donor = await Donor.findById(req.params.id);
  if (!donor || donor.festId !== festId) throw new ApiError(404, "Donor record not found for this festival");
  const festival = await loadFestivalForActor(req, festId, "admin");
  if (String(donor.festival) !== String(festival._id)) throw new ApiError(404, "Donor record not found for this festival");
  if (["sent", "delivered", "read", "pending"].includes(donor.whatsappNotification?.status || "")) {
    throw new ApiError(409, "This WhatsApp message is already sent or awaiting delivery confirmation");
  }

  const result = await sendDonationReceipt(donor, festival, req.auth!.id);
  const updated = await Donor.findById(donor._id).select("whatsappNotification");
  res.json({ success: true, data: { receiptNo: result.receiptNo, whatsappNotification: updated?.whatsappNotification } });
});

export const verifyWhatsAppWebhook = asyncHandler(async (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const expected = env.whatsapp.verifyToken;
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  const validToken = Boolean(expected) && tokenBuffer.length === expectedBuffer.length && timingSafeEqual(tokenBuffer, expectedBuffer);
  if (mode !== "subscribe" || !validToken || !challenge) {
    res.sendStatus(403);
    return;
  }
  res.status(200).type("text/plain").send(challenge);
});

export const receiveWhatsAppWebhook = asyncHandler(async (req, res) => {
  const signature = req.header("x-hub-signature-256");
  if (!verifyWhatsAppWebhookSignature(req.rawBody, signature)) {
    res.sendStatus(401);
    return;
  }
  await processWhatsAppWebhook(req.body);
  res.sendStatus(200);
});