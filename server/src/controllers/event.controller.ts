import { z } from "zod";
import { Event } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { storeFile } from "../services/upload.service.js";
import { notify } from "../services/notification.service.js";
import { User } from "../models/index.js";

const schema = z.object({
  festId: z.string().min(4),
  name: z.string().min(2),
  description: z.string().optional().default(""),
  date: z.coerce.date(),
  startTime: z.string().optional().default(""),
  endTime: z.string().optional().default(""),
  location: z.string().optional().default(""),
  status: z.enum(["Upcoming", "Ongoing", "Completed", "Cancelled"]).optional(),
});

export const listEvents = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const filter: Record<string, unknown> = { festId };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.from || req.query.to) {
    filter.date = {
      ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
    };
  }
  const items = await Event.find(filter).sort({ date: 1 });
  res.json({ success: true, data: items });
});

async function tellCommittee(festId: string, title: string, message: string) {
  const members = await User.find({ role: "COMMITTEE", festId, committeeStatus: "approved" });
  await Promise.all(members.map((m) => notify(String(m._id), title, message, "event", "/committee/events")));
}

export const createEvent = asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const festId = parsed.data.festId.toUpperCase();
  const festival = await loadFestivalForActor(req, festId, "manage");
  let imageUrl = "";
  let imagePublicId = "";
  if (req.file) {
    const stored = await storeFile(req.file, "events");
    imageUrl = stored.url;
    imagePublicId = stored.publicId;
  }
  const event = await Event.create({
    ...parsed.data,
    festId,
    festival: festival._id,
    imageUrl,
    imagePublicId,
    createdBy: req.auth!.id,
    status: parsed.data.status || "Upcoming",
  });
  if (req.auth!.role === "ADMIN") await tellCommittee(festId, "Event update", `${event.name} was added to the schedule`);
  res.status(201).json({ success: true, data: event });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  await loadFestivalForActor(req, event.festId, "manage");
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message || "Invalid input");
  const { festId: _ignore, ...rest } = parsed.data;
  Object.assign(event, rest);
  if (req.file) {
    const stored = await storeFile(req.file, "events");
    event.imageUrl = stored.url;
    event.imagePublicId = stored.publicId;
  }
  await event.save();
  res.json({ success: true, data: event });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  await loadFestivalForActor(req, event.festId, "manage");
  await event.deleteOne();
  res.json({ success: true, message: "Event removed" });
});
