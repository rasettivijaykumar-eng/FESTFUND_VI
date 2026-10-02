import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";
import { uploadErrorHandler } from "./middleware/upload.js";

export const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const allowedOrigins = new Set([
	...env.clientUrl.split(",").map((origin) => origin.trim()),
	"https://festfund-vi-1.onrender.com",
]);
app.use(cors({ origin: [...allowedOrigins], credentials: true }));
app.use(express.json({
	limit: "2mb",
	verify: (req, _res, buffer) => {
		const request = req as import("express").Request;
		if (request.originalUrl.split("?")[0] === "/api/whatsapp/webhook") request.rawBody = Buffer.from(buffer);
	},
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400, standardHeaders: true, legacyHeaders: false }));
app.use("/api", router);
app.use((_req, res) => res.status(404).json({ success: false, message: "The requested resource was not found" }));
app.use(uploadErrorHandler);
app.use(errorHandler);
