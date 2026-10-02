import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth";
import { MAX_IMAGE_BYTES } from "../services/storageService";
import {
  getStudentProfile,
  updateStudentProfile,
  uploadAvatar,
  createBudget,
  getBudget,
  getWithdrawalStatus,
  requestWithdrawal,
  transferToNextDay,
  confirmRollover,
  declineRollover,
  requestHotelTransfer,
} from "../controllers/student.controller";

// Memory storage, same as hotel.routes.ts's own upload — small files
// (4MB cap), streamed straight to Supabase Storage, never written to
// local disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole("student"));

studentRouter.get("/profile", getStudentProfile);
studentRouter.patch("/profile", updateStudentProfile);
studentRouter.post("/profile/avatar", upload.single("image"), uploadAvatar);
studentRouter.post("/budget", createBudget);
studentRouter.get("/budget", getBudget);
studentRouter.post("/budget/transfer-to-next-day", transferToNextDay);
studentRouter.post("/budget/rollover/confirm", confirmRollover);
studentRouter.post("/budget/rollover/decline", declineRollover);
studentRouter.get("/withdrawal-status", getWithdrawalStatus);
studentRouter.post("/withdraw", requestWithdrawal);
// Frozen MVP2 feature — see requestHotelTransfer's own comment.
studentRouter.post("/hotel-transfer", requestHotelTransfer);
