import { Response, NextFunction } from "express";
import { z } from "zod";
import { Request } from "express";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

/** Any signed-in user (student, hotel owner/staff) — the popup target audience. */
export async function listActiveAnnouncements(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      "SELECT id, message, created_at FROM announcements WHERE is_active = true ORDER BY created_at DESC"
    );
    res.json({ announcements: result.rows });
  } catch (err) {
    next(err);
  }
}

/** Admin-only — full history, active and inactive, most recent first. */
export async function listAnnouncements(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT a.id, a.message, a.is_active, a.created_at, a.updated_at, u.email AS created_by_email
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC`
    );
    res.json({ announcements: result.rows });
  } catch (err) {
    next(err);
  }
}

const createAnnouncementSchema = z.object({
  message: z.string().trim().min(1, "Announcement text is required.").max(2000),
});

export async function createAnnouncement(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid announcement.");
    }
    const result = await pool.query(
      `INSERT INTO announcements (message, created_by) VALUES ($1, $2)
       RETURNING id, message, is_active, created_at, updated_at`,
      [parsed.data.message, req.user!.id]
    );
    res.status(201).json({ announcement: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

const updateAnnouncementSchema = z
  .object({
    message: z.string().trim().min(1, "Announcement text is required.").max(2000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes to save." });

export async function updateAnnouncement(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid update.");
    }
    const { message, isActive } = parsed.data;
    const result = await pool.query(
      `UPDATE announcements SET
         message = COALESCE($1, message),
         is_active = COALESCE($2, is_active)
       WHERE id = $3
       RETURNING id, message, is_active, created_at, updated_at`,
      [message ?? null, isActive ?? null, req.params.id]
    );
    if (result.rows.length === 0) throw new ApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
    res.json({ announcement: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteAnnouncement(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query("DELETE FROM announcements WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) throw new ApiError(404, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}
