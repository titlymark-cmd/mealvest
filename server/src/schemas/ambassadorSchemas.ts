import { z } from "zod";

export const universityQuerySchema = z.object({
  universityId: z.string().uuid().optional(),
  range: z.enum(["today", "7d", "30d", "semester", "custom"]).default("30d"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const createCampaignSchema = z.object({
  universityId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(200),
  category: z.enum([
    "whatsapp",
    "tiktok",
    "instagram",
    "facebook",
    "campus_activations",
    "class_rep_outreach",
    "student_referrals",
    "other",
  ]),
  objective: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  posterUrl: z.string().trim().url().optional().or(z.literal("")),
  startDate: z.string().min(10),
  endDate: z.string().min(10).optional(),
  budgetKes: z.number().min(0).default(0),
});

export const updateCampaignSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  status: z.enum(["planning", "active", "paused", "completed", "cancelled"]).optional(),
  spendKes: z.number().min(0).optional(),
  budgetKes: z.number().min(0).optional(),
  endDate: z.string().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const submitPerformanceSchema = z.object({
  studentReach: z.number().int().min(0).default(0),
  impressions: z.number().int().min(0).default(0),
  engagement: z.number().int().min(0).default(0),
  linkClicks: z.number().int().min(0).default(0),
  newRegistrations: z.number().int().min(0).default(0),
  notes: z.string().trim().max(1000).optional(),
  reportDate: z.string().optional(),
});

export const createLeadSchema = z.object({
  universityId: z.string().uuid().optional(),
  businessName: z.string().trim().min(2).max(200),
  ownerManagerName: z.string().trim().max(150).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  physicalLocation: z.string().trim().max(250).optional(),
  stage: z
    .enum([
      "identified",
      "contacted",
      "interested",
      "negotiating",
      "agreement_pending",
      "onboarded",
      "active",
      "rejected_inactive",
    ])
    .default("identified"),
  commissionRate: z.number().min(0).max(100).default(10.0),
  estimatedDailyMeals: z.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).optional(),
  assignedTo: z.string().uuid().optional(),
  nextFollowupDate: z.string().optional(),
});

export const updateLeadSchema = z.object({
  stage: z
    .enum([
      "identified",
      "contacted",
      "interested",
      "negotiating",
      "agreement_pending",
      "onboarded",
      "active",
      "rejected_inactive",
    ])
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  nextFollowupDate: z.string().nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  estimatedDailyMeals: z.number().int().min(0).optional(),
});

export const createTicketSchema = z.object({
  universityId: z.string().uuid().optional(),
  studentName: z.string().trim().min(2).max(150),
  studentPhone: z.string().trim().max(50).optional(),
  category: z.enum([
    "login_problems",
    "payment_issues",
    "meal_plan_issues",
    "hotel_complaints",
    "qr_meal_pass_issues",
    "refund_or_transaction",
    "account_issues",
    "general_inquiries",
  ]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  description: z.string().trim().min(5).max(3000),
  assignedTo: z.string().uuid().optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(["open", "assigned", "in_progress", "escalated", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  escalatedToAdmin: z.boolean().optional(),
  escalationReason: z.string().trim().max(1000).optional(),
  csatRating: z.number().int().min(1).max(5).optional(),
});

export const createTicketMessageSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  isInternalNote: z.boolean().default(false),
});

export const addTeamMemberSchema = z.object({
  universityId: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email(),
  phoneNumber: z.string().trim().max(50).optional(),
  department: z.enum(["leadership", "marketing", "hotels", "customer_care"]),
  roleTitle: z.string().trim().min(2).max(100),
  responsibilities: z.string().trim().max(1000).optional(),
  permissions: z.array(z.string()).default([]),
});

export const updateTeamMemberSchema = z.object({
  roleTitle: z.string().trim().min(2).max(100).optional(),
  responsibilities: z.string().trim().max(1000).optional(),
  status: z.enum(["active", "suspended", "inactive"]).optional(),
  permissions: z.array(z.string()).optional(),
  performanceScore: z.number().min(0).max(100).optional(),
});

export const createTaskSchema = z.object({
  universityId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  department: z.enum(["leadership", "marketing", "hotels", "customer_care"]),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  deadline: z.string().optional(),
});

export const updateTaskSchema = z.object({
  status: z.enum(["todo", "in_progress", "under_review", "completed", "overdue"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completionEvidence: z.string().trim().max(2000).optional(),
});

export const generateReportSchema = z.object({
  universityId: z.string().uuid().optional(),
  reportType: z.enum([
    "student_acquisition",
    "university_growth",
    "hotel_recruitment",
    "hotel_performance",
    "digital_marketing",
    "customer_care",
    "team_performance",
    "financial_commission",
    "monthly_performance",
  ]),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
});

export const createAnnouncementSchema = z.object({
  universityId: z.string().uuid().optional(),
  targetType: z.enum(["central", "university", "team", "operational"]).default("university"),
  targetDepartment: z.enum(["leadership", "marketing", "hotels", "customer_care", "all"]).default("all"),
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(5).max(4000),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
  isPinned: z.boolean().default(false),
});

export type UniversityQuery = z.infer<typeof universityQuerySchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type SubmitPerformanceInput = z.infer<typeof submitPerformanceSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type CreateTicketMessageInput = z.infer<typeof createTicketMessageSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
