import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { CommunityMessage, Festival } from "../models/index.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { storeFile } from "../services/upload.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

export const publicCommunityLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many community messages. Please try again later." },
});

const listLimit = 75;
const messageSchema = z.object({
  festId: z.string().min(4).max(80),
  message: z.string().max(2000).optional().default(""),
  displayName: z.string().trim().min(1).max(60).optional(),
});

function normalizeFestId(value: string) {
  return value.trim().toUpperCase();
}

function attachmentKind(mime: string) {
  if (mime.startsWith("image/")) return "image" as const;
  if (mime.startsWith("video/")) return "video" as const;
  if (mime.startsWith("audio/")) return "audio" as const;
  throw new ApiError(400, "Choose an image, video, or audio recording");
}

async function listMessages(festId: string) {
  const messages = await CommunityMessage.find({ festId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(listLimit)
    .select("_id festId senderName senderRole text attachment createdAt")
    .lean();
  return messages.reverse();
}

export const listCommunityMessages = asyncHandler(async (req, res) => {
  const festId = normalizeFestId(String(req.query.festId || ""));
  await loadFestivalForActor(req, festId, "read");
  res.json({ success: true, data: await listMessages(festId) });
});

export const listPublicCommunityMessages = asyncHandler(async (req, res) => {
  const festId = normalizeFestId(String(req.params.festId || ""));
  const festival = await Festival.findOne({ festId }).select("_id");
  if (!festival) throw new ApiError(404, "Festival not found");
  res.json({ success: true, data: await listMessages(festId) });
});

async function createMessage(req: Request, res: Response, isGuest: boolean) {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid message");
  const festId = normalizeFestId(parsed.data.festId);
  const text = parsed.data.message.trim();
  if (!text && !req.file) throw new ApiError(400, "Write a message or attach media");

  const festival = isGuest
    ? await Festival.findOne({ festId })
    : await loadFestivalForActor(req, festId, "manage");
  if (!festival) throw new ApiError(404, "Festival not found");

  let attachment;
  if (req.file) {
    const kind = attachmentKind(req.file.mimetype);
    const maxBytes = kind === "image" ? 20 : kind === "audio" ? 15 : 100;
    if (req.file.size > maxBytes * 1024 * 1024) {
      throw new ApiError(400, `Keep ${kind} files under ${maxBytes} MB`);
    }
    const stored = await storeFile(req.file, "community");
    attachment = { ...stored, kind };
  }

  const message = await CommunityMessage.create({
    festival: festival._id,
    festId,
    senderUser: isGuest ? undefined : req.auth!.id,
    senderName: isGuest ? parsed.data.displayName || "Guest" : req.auth!.name,
    senderRole: isGuest ? "GUEST" : req.auth!.role,
    text,
    attachment,
  });
  res.status(201).json({
    success: true,
    data: {
      _id: message._id,
      festId: message.festId,
      senderName: message.senderName,
      senderRole: message.senderRole,
      text: message.text,
      attachment: message.attachment,
      createdAt: message.createdAt,
    },
  });
}

export const postCommunityMessage = asyncHandler(async (req, res) => {
  await createMessage(req, res, false);
});

export const postPublicCommunityMessage = asyncHandler(async (req, res) => {
  await createMessage(req, res, true);
});

export const deleteCommunityMessage = asyncHandler(async (req, res) => {
  const message = await CommunityMessage.findById(req.params.id);
  if (!message) throw new ApiError(404, "Community message not found");
  await loadFestivalForActor(req, message.festId, "manage");
  if (req.auth?.role !== "ADMIN" && String(message.senderUser || "") !== req.auth?.id) {
    throw new ApiError(403, "You can remove only your own messages");
  }
  await message.deleteOne();
  res.json({ success: true, message: "Community message removed" });
});