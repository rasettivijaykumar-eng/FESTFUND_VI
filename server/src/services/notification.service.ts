import { Notification, User } from "../models/index.js";

export async function notify(userId: string, title: string, message: string, type = "info", link = "") {
  const user = await User.findById(userId);
  if (user && user.notificationPrefs?.inApp === false) return;
  await Notification.create({ user: userId, title, message, type, link });
}
