import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";

export async function listPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT id, name, price, duration_days, daily_allocation, rollover_enabled, description
       FROM plans WHERE status = 'active' ORDER BY price ASC`
    );
    res.json({ plans: result.rows });
  } catch (err) {
    next(err);
  }
}
