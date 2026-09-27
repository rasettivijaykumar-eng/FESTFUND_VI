import type { Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { Role } from "../types/express.js";

export function signToken(payload: { sub: string; role: Role }) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpires as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.jwtSecret) as { sub: string; role: Role };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("festfund_token", token, {
    httpOnly: true,
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie("festfund_token", {
    httpOnly: true,
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    secure: env.nodeEnv === "production",
    path: "/",
  });
}
