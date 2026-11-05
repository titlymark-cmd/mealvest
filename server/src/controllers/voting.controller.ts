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
      to: phone,
      message: `Your Mealvest voting code is ${code}. Valid for 5 minutes.`,
    });

    res.json({ success: true, message: "OTP sent." });
  } catch (err) {
    next(err);
  }
}

/** Verify OTP and cast a vote. */
export async function castVote(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, code, hotelId, voterName, profilePicture } = req.body;

    if (!phone || !code || !hotelId) {
      res.status(400).json({ error: { code: "MISSING_FIELDS", message: "phone, code, and hotelId are required." } });
      return;
    }

    const otpResult = await pool.query(
      `SELECT id FROM vote_otps
       WHERE phone = $1 AND code = $2 AND used = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );

    if (otpResult.rows.length === 0) {
      res.status(400).json({ error: { code: "INVALID_OTP", message: "Invalid or expired OTP." } });
      return;
    }

    const otpId = otpResult.rows[0].id;

    // Mark OTP used
    await pool.query(`UPDATE vote_otps SET used = true WHERE id = $1`, [otpId]);

    // Check hotel exists
    const hotelResult = await pool.query(`SELECT id, name, status FROM hotels WHERE id = $1`, [hotelId]);
    if (hotelResult.rows.length === 0) {
      res.status(404).json({ error: { code: "HOTEL_NOT_FOUND", message: "Hotel not found." } });
      return;
    }

    // Upsert vote (one per phone)
    const voteResult = await pool.query(
      `INSERT INTO hotel_votes (phone, hotel_id, voter_name, profile_picture, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (phone) DO UPDATE SET
         hotel_id = EXCLUDED.hotel_id,
         voter_name = COALESCE(EXCLUDED.voter_name, hotel_votes.voter_name),
         profile_picture = COALESCE(EXCLUDED.profile_picture, hotel_votes.profile_picture),
         updated_at = now()
       RETURNING id, status`,
      [phone, hotelId, voterName || null, profilePicture || null]
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
    const result = await pool.query(
      `SELECT h.id, h.name, h.location, h.image_url, h.description, h.status,
              COALESCE(v.vote_count, 0)::int AS vote_count
       FROM hotels h
       LEFT JOIN (
         SELECT hotel_id, COUNT(*) AS vote_count FROM hotel_votes GROUP BY hotel_id
       ) v ON v.hotel_id = h.id
       ORDER BY COALESCE(v.vote_count, 0) DESC, h.name ASC`
    );
    res.json({ hotels: result.rows });
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
