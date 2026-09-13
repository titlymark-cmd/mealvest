import { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Mounted last in app.ts, after all routes. Never leaks stack traces
 * or raw DB error messages to the client — those go to the server
 * log only. Client sees a stable { error: { code, message } } shape.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error("Unhandled server error:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}
