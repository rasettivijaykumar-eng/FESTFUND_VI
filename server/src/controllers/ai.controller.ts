import { z } from "zod";
import { answerFestivalQuestion } from "../services/ai.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  festId: z.string().min(3).max(80).optional(),
});

export const chatWithAi = asyncHandler(async (req, res) => {
  const data = messageSchema.safeParse(req.body);
  if (!data.success) throw new ApiError(400, data.error.issues[0]?.message || "Invalid request");
  const festId = String(data.data.festId || req.auth?.festId || "").trim().toUpperCase();
  if (!festId) throw new ApiError(400, "Choose a festival before asking FestFund AI");
  const response = await answerFestivalQuestion({
    festivalId: festId,
    message: data.data.message,
    userName: req.auth?.name || "User",
    role: req.auth?.role === "COMMITTEE" ? "COMMITTEE" : "ADMIN",
    userId: req.auth?.id,
    userFestId: req.auth?.festId,
  });
  res.json({ success: true, data: response });
});

export const chatWithPublicAi = asyncHandler(async (req, res) => {
  const data = messageSchema.safeParse(req.body);
  if (!data.success) throw new ApiError(400, data.error.issues[0]?.message || "Invalid request");
  const festId = String(data.data.festId || "").trim().toUpperCase();
  if (!festId) throw new ApiError(400, "Fest ID is required");
  const response = await answerFestivalQuestion({
    festivalId: festId,
    message: data.data.message,
    userName: "Festival Visitor",
    role: "VISITOR",
  });
  res.json({ success: true, data: response });
});
