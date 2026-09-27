import { Notification } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.auth!.id }).sort({ createdAt: -1 }).limit(40);
  const unread = items.filter((n) => !n.read).length;
  res.json({ success: true, data: items, meta: { unread } });
});

export const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.auth!.id }, { read: true });
  res.json({ success: true });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.auth!.id, read: false }, { read: true });
  res.json({ success: true });
});
