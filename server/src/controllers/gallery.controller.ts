import { z } from "zod";
import { GalleryItem, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { downloadTarget, storeFile } from "../services/upload.service.js";
import { notify } from "../services/notification.service.js";

export const listGallery = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const filter: Record<string, unknown> = { festId };
  if (req.query.kind) filter.kind = String(req.query.kind);
  if (req.query.category) filter.category = String(req.query.category);
  const items = await GalleryItem.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});

export const uploadGallery = asyncHandler(async (req, res) => {
  const schema = z.object({
    festId: z.string().min(4),
    kind: z.enum(["photo", "video"]),
    title: z.string().optional().default(""),
    category: z.string().optional().default("Festival Activities"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  if (!req.file) throw new ApiError(400, "Choose a file to upload");
  const festId = parsed.data.festId.toUpperCase();
  const festival = await loadFestivalForActor(req, festId, "manage");
  if (parsed.data.kind === "photo" && !req.file.mimetype.startsWith("image/")) {
    throw new ApiError(400, "Invalid file format");
  }
  if (parsed.data.kind === "video" && !req.file.mimetype.startsWith("video/")) {
    throw new ApiError(400, "Invalid file format");
  }
  const stored = await storeFile(req.file, parsed.data.kind === "photo" ? "gallery" : "videos");
  const item = await GalleryItem.create({
    festival: festival._id,
    festId,
    kind: parsed.data.kind,
    title: parsed.data.title || stored.originalName,
    category: parsed.data.category,
    url: stored.url,
    publicId: stored.publicId,
    bytes: stored.bytes,
    mime: stored.mime,
    originalName: stored.originalName,
    uploadedBy: req.auth!.id,
  });
  if (festival.createdBy && String(festival.createdBy) !== req.auth!.id) {
    await notify(String(festival.createdBy), "New gallery upload", `${req.auth!.name} added ${item.title}`, "gallery", "/admin/gallery");
  }
  const members = await User.find({ role: "COMMITTEE", festId, committeeStatus: "approved", _id: { $ne: req.auth!.id } });
  await Promise.all(members.map((m) => notify(String(m._id), "Gallery update", `${item.title} was added`, "gallery", "/committee/gallery")));
  res.status(201).json({ success: true, data: item });
});

export const deleteGallery = asyncHandler(async (req, res) => {
  const item = await GalleryItem.findById(req.params.id);
  if (!item) throw new ApiError(404, "Gallery item not found");
  await loadFestivalForActor(req, item.festId, "manage");
  await item.deleteOne();
  res.json({ success: true, message: "Removed from gallery" });
});

export const downloadGallery = asyncHandler(async (req, res) => {
  const item = await GalleryItem.findById(req.params.id);
  if (!item) throw new ApiError(404, "Gallery item not found");
  const target = downloadTarget(item.url);
  if (target.startsWith("http")) {
    res.redirect(target);
    return;
  }
  const path = await import("node:path");
  const file = path.resolve(process.cwd(), "uploads", item.publicId || path.basename(item.url));
  res.download(file, item.originalName || "festfund-media");
});
