import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getStudentProfile,
  createBudget,
  getBudget,
  getWithdrawalStatus,
  requestWithdrawal,
  transferToNextDay,
  requestHotelTransfer,
} from "../controllers/student.controller";

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole("student"));

studentRouter.get("/profile", getStudentProfile);
studentRouter.post("/budget", createBudget);
studentRouter.get("/budget", getBudget);
studentRouter.post("/budget/transfer-to-next-day", transferToNextDay);
studentRouter.get("/withdrawal-status", getWithdrawalStatus);
studentRouter.post("/withdraw", requestWithdrawal);
// Frozen MVP2 feature — see requestHotelTransfer's own comment.
studentRouter.post("/hotel-transfer", requestHotelTransfer);
