import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const billTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function filter(allowed: Set<string>) {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowed.has(file.mimetype)) {
      cb(new ApiError(400, "Invalid file format"));
      return;
    }
    cb(null, true);
  };
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: filter(imageTypes),
});

export const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: filter(videoTypes),
});

export const billUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: filter(billTypes),
});

export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: filter(new Set([...imageTypes, ...videoTypes])),
});

export function uploadErrorHandler(error: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") next(new ApiError(400, "File too large"));
    else next(new ApiError(400, "Invalid file format"));
    return;
  }
  next(error);
}
