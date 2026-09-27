import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Admin, CommitteeRequest, Festival, User, Vendor } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { clearAuthCookie, setAuthCookie, signToken } from "../services/token.service.js";
import { storeFile } from "../services/upload.service.js";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

const adminSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email"),
  mobile: z.string().min(8, "Enter a valid mobile number"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" });

const committeeSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Enter a valid email"),
  mobile: z.string().min(8, "Enter a valid mobile number"),
  password: passwordSchema,
  confirmPassword: z.string(),
  festId: z.string().min(4, "Fest ID is required"),
}).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" });

const vendorSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().min(8),
  password: passwordSchema,
  confirmPassword: z.string(),
  category: z.string().min(2),
  address: z.string().min(3),
  village: z.string().min(2),
  district: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(4),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  description: z.string().optional().default(""),
  businessHours: z.string().optional().default(""),
}).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" });

function parse(schema: z.ZodTypeAny, body: unknown): any {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, result.error.issues[0]?.message || "Invalid input");
  return result.data;
}

async function issue(res: Response, user: { _id: unknown; role: "ADMIN" | "COMMITTEE" | "VENDOR" }) {
  const token = signToken({ sub: String(user._id), role: user.role });
  setAuthCookie(res, token);
  const safe = await User.findById(user._id);
  res.json({ success: true, data: { user: safe, token } });
}

export const registerAdmin = asyncHandler(async (req, res) => {
  const data = parse(adminSchema, req.body);
  const exists = await User.findOne({ email: data.email.toLowerCase() });
  if (exists) throw new ApiError(409, "An account with this email already exists");
  const user = await User.create({
    name: data.name,
    email: data.email,
    mobile: data.mobile,
    password: await bcrypt.hash(data.password, 10),
    role: "ADMIN",
  });
  await Admin.create({ user: user._id, displayName: data.name });
  await issue(res, user);
});

export const registerCommittee = asyncHandler(async (req, res) => {
  const data = parse(committeeSchema, req.body);
  const festId = data.festId.trim().toUpperCase();
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Fest ID not found");
  const exists = await User.findOne({ email: data.email.toLowerCase() });
  if (exists) throw new ApiError(409, "An account with this email already exists");
  const duplicate = await CommitteeRequest.findOne({ festId, status: "pending" }).populate("user");
  if (duplicate) {
    const populated = duplicate.user as { email?: string } | null;
    if (populated && typeof populated === "object" && populated.email === data.email.toLowerCase()) {
      throw new ApiError(409, "Committee request already submitted");
    }
  }
  const user = await User.create({
    name: data.name,
    email: data.email,
    mobile: data.mobile,
    password: await bcrypt.hash(data.password, 10),
    role: "COMMITTEE",
    committeeStatus: "pending",
    festival: festival._id,
    festId,
  });
  try {
    await CommitteeRequest.create({ user: user._id, festival: festival._id, festId, status: "pending" });
  } catch {
    await User.deleteOne({ _id: user._id });
    throw new ApiError(409, "Committee request already submitted");
  }
  const { CommitteeMember } = await import("../models/index.js");
  await CommitteeMember.create({ user: user._id, festival: festival._id, festId, status: "pending" });
  if (festival.createdBy) {
    const { notify } = await import("../services/notification.service.js");
    await notify(String(festival.createdBy), "New Committee Request", `${data.name} requested to join ${festival.name}`, "committee", "/admin/committee");
  }
  res.status(201).json({
    success: true,
    message: "Join request submitted. You can sign in after an admin approves it.",
    data: { festId, status: "pending" },
  });
});

export const registerVendor = asyncHandler(async (req, res) => {
  const data = parse(vendorSchema, req.body);
  const exists = await User.findOne({ email: data.email.toLowerCase() });
  if (exists) throw new ApiError(409, "An account with this email already exists");
  const user = await User.create({
    name: data.ownerName,
    email: data.email,
    mobile: data.mobile,
    password: await bcrypt.hash(data.password, 10),
    role: "VENDOR",
  });
  let logoUrl = "";
  let logoPublicId = "";
  const files = req.files as { logo?: Express.Multer.File[]; images?: Express.Multer.File[] } | undefined;
  if (files?.logo?.[0]) {
    const stored = await storeFile(files.logo[0], "vendors");
    logoUrl = stored.url;
    logoPublicId = stored.publicId;
    user.avatarUrl = stored.url;
    await user.save();
  }
  const images = [];
  for (const image of files?.images || []) {
    images.push(await storeFile(image, "vendors"));
  }
  await Vendor.create({
    user: user._id,
    businessName: data.businessName,
    ownerName: data.ownerName,
    category: data.category,
    address: data.address,
    village: data.village,
    district: data.district,
    state: data.state,
    pincode: data.pincode,
    latitude: data.latitude,
    longitude: data.longitude,
    location: { type: "Point", coordinates: [data.longitude, data.latitude] },
    description: data.description,
    businessHours: data.businessHours,
    logoUrl,
    logoPublicId,
    images: images.map((img) => ({ url: img.url, publicId: img.publicId, originalName: img.originalName })),
    contactMobile: data.mobile,
  });
  await issue(res, user);
});

export const login = asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    role: z.enum(["ADMIN", "COMMITTEE", "VENDOR"]),
  });
  const data = parse(schema, req.body);
  const user = await User.findOne({ email: data.email.toLowerCase() }).select("+password");
  if (!user) throw new ApiError(401, "Invalid login credentials");
  const ok = await bcrypt.compare(data.password, user.password);
  if (!ok) throw new ApiError(401, "Invalid login credentials");
  if (user.role !== data.role) throw new ApiError(401, "Invalid login credentials");
  if (user.role === "COMMITTEE") {
    if (user.committeeStatus === "pending") throw new ApiError(403, "Your committee request is still pending approval");
    if (user.committeeStatus === "rejected") throw new ApiError(403, "Your committee request was rejected");
  }
  await issue(res, user);
});

export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: "Logged out" });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth!.id);
  res.json({ success: true, data: user });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    mobile: z.string().min(8).optional(),
    appearance: z.enum(["dark", "light"]).optional(),
    inApp: z.coerce.boolean().optional(),
    emailNotes: z.coerce.boolean().optional(),
  });
  const data = parse(schema, req.body);
  const user = await User.findById(req.auth!.id);
  if (!user) throw new ApiError(404, "Account not found");
  if (data.name) user.name = data.name;
  if (data.mobile) user.mobile = data.mobile;
  if (data.appearance) user.appearance = data.appearance;
  user.notificationPrefs = user.notificationPrefs || { inApp: true, email: true };
  if (typeof data.inApp === "boolean") user.notificationPrefs.inApp = data.inApp;
  if (typeof data.emailNotes === "boolean") user.notificationPrefs.email = data.emailNotes;
  if (req.file) {
    const stored = await storeFile(req.file, "avatars");
    user.avatarUrl = stored.url;
    user.avatarPublicId = stored.publicId;
  }
  await user.save();
  if (user.role === "VENDOR" && data.name) {
    await Vendor.updateOne({ user: user._id }, { ownerName: data.name });
  }
  res.json({ success: true, data: user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  });
  const data = parse(schema, req.body);
  const user = await User.findById(req.auth!.id).select("+password");
  if (!user) throw new ApiError(404, "Account not found");
  const ok = await bcrypt.compare(data.currentPassword, user.password);
  if (!ok) throw new ApiError(400, "Current password is incorrect");
  user.password = await bcrypt.hash(data.newPassword, 10);
  await user.save();
  res.json({ success: true, message: "Password updated" });
});
