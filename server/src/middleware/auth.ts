import type { NextFunction, Request, Response } from "express";
import { User } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyToken } from "../services/token.service.js";
import type { Role } from "../types/express.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = req.cookies?.festfund_token || (header?.startsWith("Bearer ") ? header.slice(7) : "");
    if (!token) throw new ApiError(401, "Unauthorized access");
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, "Unauthorized access");
    if (user.role === "COMMITTEE" && user.committeeStatus !== "approved") {
      throw new ApiError(403, "Your committee request is still pending approval");
    }
    req.auth = {
      id: String(user._id),
      role: user.role as Role,
      festId: user.festId || undefined,
      name: user.name,
      email: user.email,
    };
    next();
  } catch (error) {
    if (error instanceof ApiError) next(error);
    else next(new ApiError(401, "Unauthorized access"));
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new ApiError(403, "Unauthorized access"));
      return;
    }
    next();
  };
}
