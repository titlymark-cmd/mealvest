import { NextFunction, Request, Response } from "express";

/**
 * Minimal request logger (no external dependency like morgan needed
 * for this). Logs method, path, status, and duration — enough to
 * debug the Day 1 health-check round trip and beyond.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
