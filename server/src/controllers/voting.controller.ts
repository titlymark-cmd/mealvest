import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { sendSMS, isSmsConfigured } from "../services/smsService";
import { randomInt } from "crypto";

/** Request an OTP for voting. */
export async function requestVoteOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== "string" || !phone.startsWith("+")) {
      res.status(400).json({ error: { code: "INVALID_PHONE", message: "Phone must be in international format (+254...)." } });
      return;
    }

    if (!isSmsConfigured()) {
      res.status(503).json({ error: { code: "SMS_NOT_CONFIGURED", message: "SMS is not configured on this server." } });
      return;
    }

    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `INSERT INTO vote_otps (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    );

    await sendSMS({
      phoneNumber: phone,
      message: `Your Mealvest voting code is ${code}. Valid for 5 minutes.`,
    });

    res.json({ success: true, message: "OTP sent." });
  } catch (err) {
    next(err);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cast a vote. The student provides their name, phone, email and (optionally)
 * a profile photo. One vote per phone number — re-voting moves the vote and
 * refreshes the profile. Phone/email are stored safely in hotel_votes.
 *
 * OTP is OPTIONAL: if a `code` is supplied it is verified (the SMS-proof
 * flow), otherwise the vote is accepted directly so the system works
 * end-to-end even when SMS is not configured. This keeps the "just enter
 * phone, email, name and photo" flow working everywhere.
 */
export async function castVote(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, code, hotelId, voterName, email, profilePicture } = req.body;

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: { code: "MISSING_PHONE", message: "Phone number is required." } });
      return;
    }
    if (!voterName || typeof voterName !== "string" || !voterName.trim()) {
      res.status(400).json({ error: { code: "MISSING_NAME", message: "Your name is required." } });
      return;
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      res.status(400).json({ error: { code: "INVALID_EMAIL", message: "A valid email is required." } });
      return;
    }
    if (!hotelId) {
      res.status(400).json({ error: { code: "MISSING_HOTEL", message: "Please choose a hotel to vote for." } });
      return;
    }

    const normalizedPhone = phone.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Optional OTP proof: only enforced when a code is sent along.
    if (code) {
      const otpResult = await pool.query(
        `SELECT id FROM vote_otps
         WHERE phone = $1 AND code = $2 AND used = false AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedPhone, code]
      );
      if (otpResult.rows.length === 0) {
        res.status(400).json({ error: { code: "INVALID_OTP", message: "Invalid or expired OTP." } });
        return;
      }
      await pool.query(`UPDATE vote_otps SET used = true WHERE id = $1`, [otpResult.rows[0].id]);
    }

    // Check hotel exists
    const hotelResult = await pool.query(`SELECT id, name, status FROM hotels WHERE id = $1`, [hotelId]);
    if (hotelResult.rows.length === 0) {
      res.status(404).json({ error: { code: "HOTEL_NOT_FOUND", message: "Hotel not found." } });
      return;
    }

    // Upsert vote (one per phone)
    const voteResult = await pool.query(
      `INSERT INTO hotel_votes (phone, hotel_id, voter_name, email, profile_picture, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (phone) DO UPDATE SET
         hotel_id = EXCLUDED.hotel_id,
         voter_name = COALESCE(EXCLUDED.voter_name, hotel_votes.voter_name),
         email = COALESCE(EXCLUDED.email, hotel_votes.email),
         profile_picture = COALESCE(EXCLUDED.profile_picture, hotel_votes.profile_picture),
         updated_at = now()
       RETURNING id, status`,
      [normalizedPhone, hotelId, voterName.trim(), normalizedEmail, profilePicture || null]
    );

    res.json({
      success: true,
      voteId: voteResult.rows[0].id,
      status: voteResult.rows[0].status,
      message: "Vote recorded. Your profile is pending until the hotel partners.",
    });
  } catch (err) {
    next(err);
  }
}

/** List hotels available for voting (includes pending ones), with vote counts. */
export async function listVotableHotels(_req: Request, res: Response, next: NextFunction) {
  try {
    const vis = await pool.query("SELECT value FROM platform_settings WHERE key = 'votes_public'");
    const publicVotes = vis.rows[0]?.value !== "false";

    let result;
    try {
      result = await pool.query(
        `SELECT h.id, h.name, h.location, h.image_url, h.description, h.status,
                COALESCE(v.vote_count, 0)::int AS vote_count,
                COALESCE(r.review_count, 0)::int AS review_count,
                r.average_rating
         FROM hotels h
         LEFT JOIN (
           SELECT hotel_id, COUNT(*) AS vote_count FROM hotel_votes GROUP BY hotel_id
         ) v ON v.hotel_id = h.id
         LEFT JOIN (
           SELECT hotel_id, COUNT(*) AS review_count, ROUND(AVG(rating)::numeric, 1) AS average_rating
           FROM hotel_reviews GROUP BY hotel_id
         ) r ON r.hotel_id = h.id
         ORDER BY COALESCE(v.vote_count, 0) DESC, r.average_rating DESC NULLS LAST, h.name ASC`
      );
    } catch {
      // hotel_votes / hotel_reviews table may not exist yet
      result = await pool.query(
        `SELECT id, name, location, image_url, description, status,
                0 AS vote_count, 0 AS review_count, NULL AS average_rating
         FROM hotels ORDER BY name ASC`
      );
    }
    const hotels = result.rows.map((h: any) => ({
      ...h,
      vote_count: publicVotes ? h.vote_count : null,
    }));
    res.json({ hotels, votesPublic: publicVotes });
  } catch (err) {
    next(err);
  }
}

/** Admin: get/set whether vote counts are publicly visible. */
export async function getVotesVisibility(_req: Request, res: Response, next: NextFunction) {
  try {
    const r = await pool.query("SELECT value FROM platform_settings WHERE key = 'votes_public'");
    res.json({ votesPublic: r.rows[0]?.value !== "false" });
  } catch (err) {
    next(err);
  }
}

export async function setVotesVisibility(req: Request, res: Response, next: NextFunction) {
  try {
    const { votesPublic } = req.body;
    const value = votesPublic === false ? "false" : "true";
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('votes_public', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
      [value]
    );
    res.json({ success: true, votesPublic: value === "true" });
  } catch (err) {
    next(err);
  }
}

/** Activate all voters for a hotel once it partners (call from admin approval flow). */
export async function activateVotersForHotel(req: Request, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const result = await pool.query(
      `UPDATE hotel_votes SET status = 'active', updated_at = now()
       WHERE hotel_id = $1 AND status = 'pending'
       RETURNING id, phone`,
      [hotelId]
    );
    res.json({ success: true, activated: result.rowCount, phones: result.rows.map((r: any) => r.phone) });
  } catch (err) {
    next(err);
  }
}

/** Public vote stats. */
export async function getVoteStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM hotel_votes) AS total_votes,
         (SELECT COUNT(DISTINCT hotel_id) FROM hotel_votes) AS hotels_with_votes`
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/** Admin: create a simple voting hotel (name, logo, location, description). */
export async function createVotingHotel(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, location, description, imageUrl } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: { code: "MISSING_NAME", message: "Hotel name is required." } });
      return;
    }
    const result = await pool.query(
      `INSERT INTO hotels (name, location, description, image_url, status)
       VALUES ($1, $2, $3, $4, 'pending_verification')
       RETURNING id, name, location, description, image_url, status`,
      [name.trim(), location || null, description || null, imageUrl || null]
    );
    res.json({ success: true, hotel: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
