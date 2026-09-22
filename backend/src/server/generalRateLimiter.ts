import type { Request } from "express";
import rateLimit from "express-rate-limit";

const assetPreviewPath = /^\/assets\/[^/]+\/svg$/;

export const skipGeneralRateLimit = (req: Request): boolean =>
  req.method === "GET" &&
  (req.path === "/health" ||
    req.path === "/auth/status" ||
    assetPreviewPath.test(req.path));

export const createGeneralRateLimiter = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    skip: skipGeneralRateLimit,
    message: {
      error: "Rate limit exceeded",
      message: "Too many requests, please try again later",
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });
