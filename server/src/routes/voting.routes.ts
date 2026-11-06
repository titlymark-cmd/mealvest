import { Router } from "express";
import { requestVoteOtp, castVote, listVotableHotels, getVoteStats, activateVotersForHotel, createVotingHotel } from "../controllers/voting.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const votingRouter = Router();

// Public voting endpoints (phone OTP is the proof)
votingRouter.post("/otp", requestVoteOtp);
votingRouter.post("/cast", castVote);
votingRouter.get("/hotels", listVotableHotels);
votingRouter.get("/stats", getVoteStats);

// Admin: activate voters when a hotel is partnered
votingRouter.post("/hotels/:hotelId/activate", requireAuth, requireRole("mealvest_admin"), activateVotersForHotel);
votingRouter.post("/admin/hotels", requireAuth, requireRole("mealvest_admin"), createVotingHotel);
