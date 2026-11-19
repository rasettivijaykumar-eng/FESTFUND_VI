import type { Request } from "express";
import type { Model } from "mongoose";
import { Festival } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";

export async function loadFestivalForActor(req: Request, festId: string, write: "read" | "manage" | "admin") {
  if (!festId) throw new ApiError(400, "Fest ID is required");
  const festival = await Festival.findOne({ festId });
  if (!festival) throw new ApiError(404, "Festival not found");
  const auth = req.auth;
  if (!auth) throw new ApiError(401, "Unauthorized access");

  if (auth.role === "ADMIN") {
    if (String(festival.createdBy) !== auth.id) throw new ApiError(403, "Unauthorized access");
    return festival;
  }

  if (auth.role === "COMMITTEE") {
    if (auth.festId !== festival.festId) throw new ApiError(403, "Unauthorized access");
    if (write === "admin") throw new ApiError(403, "Unauthorized access");
    return festival;
  }

  throw new ApiError(403, "Unauthorized access");
}

export async function getFestivalOwnedRecord(
  req: Request,
  model: Model<any>,
  recordId: string,
  write: "read" | "manage" | "admin" = "read",
) {
  if (!req.auth) throw new ApiError(401, "Unauthorized access");

  const festivalIds = await loadActorFestivalContext(req);
  if (!festivalIds.length) throw new ApiError(404, "Record not found");

  if (write === "admin" && req.auth.role !== "ADMIN") {
    throw new ApiError(403, "Unauthorized access");
  }
  if (write === "manage" && req.auth.role === "VENDOR") {
    throw new ApiError(403, "Unauthorized access");
  }

  const record = await model.findOne({ _id: recordId, festId: { $in: festivalIds } }).exec();
  if (!record) throw new ApiError(404, "Record not found");
  return record;
}

async function loadActorFestivalContext(req: Request) {
  const auth = req.auth;
  if (!auth) throw new ApiError(401, "Unauthorized access");

  if (auth.role === "COMMITTEE") {
    if (!auth.festId) throw new ApiError(403, "Unauthorized access");
    return [auth.festId.toUpperCase()];
  }

  if (auth.role !== "ADMIN") throw new ApiError(403, "Unauthorized access");

  const actorFestivals = await Festival.find({ createdBy: auth.id }).select("festId").lean().exec();
  return actorFestivals.map((festival) => festival.festId);
}

export function publicFestival(festival: {
  name: string;
  type: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  address?: string;
  village?: string;
  district: string;
  state: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  contactName?: string;
  contactMobile?: string;
  imageUrl?: string;
  festId: string;
}) {
  return {
    name: festival.name,
    type: festival.type,
    description: festival.description || "",
    startDate: festival.startDate,
    endDate: festival.endDate,
    address: festival.address || "",
    village: festival.village || "",
    district: festival.district,
    state: festival.state,
    pincode: festival.pincode || "",
    latitude: festival.latitude ?? undefined,
    longitude: festival.longitude ?? undefined,
    contactName: festival.contactName || "",
    contactMobile: festival.contactMobile || "",
    imageUrl: festival.imageUrl || "",
    festId: festival.festId,
  };
}
