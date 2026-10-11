import { NextFunction, Request, Response } from "express";
import multer from "multer";

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

  // express.json() / express.raw() (body-parser) reject a malformed or
  // oversized body by throwing an error that carries `type` (e.g.
  // "entity.parse.failed", "entity.too.large") and an HTTP `status`.
  // Those are the CLIENT's fault, so answer with that 4xx in the same
  // { error: { code, message } } shape as everything else instead of
  // letting them fall through to the generic 500 below.
  if (isBodyParserError(err)) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 400;
    const code = err.type === "entity.parse.failed" ? "INVALID_JSON" : "INVALID_REQUEST_BODY";
    const message =
      err.type === "entity.parse.failed"
        ? "Request body is not valid JSON."
        : err.type === "entity.too.large"
          ? "Request body is too large."
          : "Could not read the request body.";
    res.status(status).json({ error: { code, message } });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Image is too large — 4MB maximum." : "Could not process the uploaded file.";
    res.status(400).json({ error: { code: err.code, message } });
    return;
  }

  console.error("Unhandled server error:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

interface BodyParserError extends Error {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    err instanceof Error &&
    typeof (err as Partial<BodyParserError>).type === "string" &&
    typeof (err as Partial<BodyParserError>).status === "number" &&
    (err as Partial<BodyParserError>).type!.startsWith("entity.")
  );
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}
