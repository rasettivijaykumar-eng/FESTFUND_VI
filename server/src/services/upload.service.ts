import fs from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { cloudinaryEnabled, env } from "../config/env.js";

const uploadRoot = path.resolve(process.cwd(), "uploads");

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

export async function ensureUploadDir() {
  await fs.mkdir(uploadRoot, { recursive: true });
}

export type StoredFile = {
  url: string;
  publicId: string;
  bytes: number;
  mime: string;
  originalName: string;
};

export async function storeFile(file: Express.Multer.File, folder: string): Promise<StoredFile> {
  if (cloudinaryEnabled) {
    const uploaded = await new Promise<{ secure_url: string; public_id: string; bytes: number }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `festfund/${folder}`,
          resource_type: "auto",
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) reject(error || new Error("Upload failed"));
          else resolve(result);
        },
      );
      stream.end(file.buffer);
    });
    return {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      bytes: uploaded.bytes || file.size,
      mime: file.mimetype,
      originalName: file.originalname,
    };
  }

  await ensureUploadDir();
  const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safe}`;
  await fs.writeFile(path.join(uploadRoot, filename), file.buffer);
  return {
    url: `/uploads/${filename}`,
    publicId: filename,
    bytes: file.size,
    mime: file.mimetype,
    originalName: file.originalname,
  };
}

export function downloadTarget(url: string) {
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}
