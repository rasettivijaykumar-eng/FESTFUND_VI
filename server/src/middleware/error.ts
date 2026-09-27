import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  const err = error as { code?: number; message?: string };
  if (err.code === 11000) {
    res.status(409).json({ success: false, message: "A record with these details already exists" });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }
  res.status(500).json({ success: false, message: "Server unavailable" });
}
