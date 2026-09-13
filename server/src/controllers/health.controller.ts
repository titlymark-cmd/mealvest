import { Request, Response } from "express";
import { checkDatabaseConnection } from "../config/db";

export async function getHealth(_req: Request, res: Response) {
  const dbConnected = await checkDatabaseConnection();

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    db: dbConnected ? "connected" : "unreachable",
    timestamp: new Date().toISOString(),
  });
}
