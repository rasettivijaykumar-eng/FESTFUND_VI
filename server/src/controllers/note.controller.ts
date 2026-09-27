import { z } from "zod";
import { AdminNote, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { storeFile } from "../services/upload.service.js";
import { notify } from "../services/notification.service.js";

const schema = z.object({
  festId: z.string().min(4),
  title: z.string().min(2),
  description: z.string().min(2),
  priority: z.enum(["Normal", "Important", "Urgent"]).default("Normal"),
});

export const listNotes = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const notes = await AdminNote.find({ festId }).sort({ createdAt: -1 });
  res.json({ success: true, data: notes });
});

export const createNote = asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const festId = parsed.data.festId.toUpperCase();
  const festival = await loadFestivalForActor(req, festId, "manage");
  let attachmentUrl = "";
  let attachmentPublicId = "";
  let attachmentName = "";
  if (req.file) {
    const stored = await storeFile(req.file, "notes");
    attachmentUrl = stored.url;
    attachmentPublicId = stored.publicId;
    attachmentName = stored.originalName;
  }
  const note = await AdminNote.create({
    ...parsed.data,
    festId,
    festival: festival._id,
    attachmentUrl,
    attachmentPublicId,
    attachmentName,
    author: req.auth!.id,
    authorName: req.auth!.name,
  });
  if (parsed.data.priority !== "Normal" && festival.createdBy) {
    await notify(String(festival.createdBy), "Important note", `${parsed.data.priority}: ${parsed.data.title}`, "note", "/admin/notes");
  }
  const members = await User.find({ role: "COMMITTEE", festId, committeeStatus: "approved", _id: { $ne: req.auth!.id } });
  await Promise.all(members.map((m) => notify(String(m._id), "Admin message", parsed.data.title, "note", "/committee/notes")));
  res.status(201).json({ success: true, data: note });
});

export const deleteNote = asyncHandler(async (req, res) => {
  const note = await AdminNote.findById(req.params.id);
  if (!note) throw new ApiError(404, "Note not found");
  await loadFestivalForActor(req, note.festId, "manage");
  if (req.auth!.role === "COMMITTEE" && String(note.author) !== req.auth!.id) {
    throw new ApiError(403, "Unauthorized access");
  }
  await note.deleteOne();
  res.json({ success: true, message: "Note removed" });
});
