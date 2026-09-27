import { z } from "zod";
import { CommitteeMember, CommitteeRequest, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { loadFestivalForActor } from "../services/access.service.js";
import { notify } from "../services/notification.service.js";

export const listRequests = asyncHandler(async (req, res) => {
  const festivals = await (await import("../models/index.js")).Festival.find({ createdBy: req.auth!.id }).select("festId");
  const ids = festivals.map((f) => f.festId);
  const status = String(req.query.status || "");
  const filter: Record<string, unknown> = { festId: { $in: ids } };
  if (status) filter.status = status;
  const requests = await CommitteeRequest.find(filter).populate("user", "name email mobile").sort({ createdAt: -1 });
  res.json({ success: true, data: requests });
});

export const decideRequest = asyncHandler(async (req, res) => {
  const schema = z.object({ status: z.enum(["approved", "rejected"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Choose approve or reject");
  const request = await CommitteeRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, "Request not found");
  await loadFestivalForActor(req, request.festId, "admin");
  if (request.status !== "pending") throw new ApiError(400, "This request was already reviewed");
  request.status = parsed.data.status;
  await request.save();
  await User.findByIdAndUpdate(request.user, { committeeStatus: parsed.data.status, festId: request.festId, festival: request.festival });
  await CommitteeMember.findOneAndUpdate(
    { user: request.user },
    { status: parsed.data.status, festId: request.festId, festival: request.festival },
    { upsert: true },
  );
  await notify(
    String(request.user),
    parsed.data.status === "approved" ? "Committee request approved" : "Committee request rejected",
    parsed.data.status === "approved"
      ? `You can now sign in to ${request.festId}`
      : `Your request to join ${request.festId} was rejected`,
    "committee",
    "/login/committee",
  );
  res.json({ success: true, data: request });
});

export const listMembers = asyncHandler(async (req, res) => {
  const festId = String(req.query.festId || req.auth?.festId || "").toUpperCase();
  await loadFestivalForActor(req, festId, "read");
  const members = await CommitteeMember.find({ festId }).populate("user", "name email mobile avatarUrl committeeStatus");
  res.json({ success: true, data: members });
});
