import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getStudentProfile,
  updateStudentProfile,
  createBudget,
  getBudget,
  getWithdrawalStatus,
  requestWithdrawal,
  transferToNextDay,
  confirmRollover,
  declineRollover,
  requestHotelTransfer,
} from "../controllers/student.controller";

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole("student"));

studentRouter.get("/profile", getStudentProfile);
studentRouter.patch("/profile", updateStudentProfile);
studentRouter.post("/budget", createBudget);
studentRouter.get("/budget", getBudget);
studentRouter.post("/budget/transfer-to-next-day", transferToNextDay);
studentRouter.post("/budget/rollover/confirm", confirmRollover);
studentRouter.post("/budget/rollover/decline", declineRollover);
studentRouter.get("/withdrawal-status", getWithdrawalStatus);
studentRouter.post("/withdraw", requestWithdrawal);
// Frozen MVP2 feature — see requestHotelTransfer's own comment.
studentRouter.post("/hotel-transfer", requestHotelTransfer);
