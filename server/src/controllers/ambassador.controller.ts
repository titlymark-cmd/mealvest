import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { pool } from "../config/db";
import * as ambassadorService from "../services/ambassadorService";
import {
  universityQuerySchema,
  createCampaignSchema,
  updateCampaignSchema,
  submitPerformanceSchema,
  createLeadSchema,
  updateLeadSchema,
  createTicketSchema,
  updateTicketSchema,
  createTicketMessageSchema,
  addTeamMemberSchema,
  updateTeamMemberSchema,
  createTaskSchema,
  updateTaskSchema,
  generateReportSchema,
  createAnnouncementSchema,
} from "../schemas/ambassadorSchemas";

function assertDepartmentAccess(scope: { role: string; department?: string; isCentralAdmin: boolean }, department: string) {
  if (scope.isCentralAdmin || scope.role === "university_ambassador") return;
  if (scope.role !== "team_member" || scope.department !== department) {
    throw new ApiError(403, "FORBIDDEN", `You do not have permission to manage ${department.replace("_", " ")} operations.`);
  }
}

export async function getMe(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const universitiesRes = await pool.query<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM universities WHERE is_active = true ORDER BY name ASC"
    );
    res.json({
      scope,
      universities: universitiesRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function getUniversities(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const resUnis = await pool.query<{ id: string; name: string; slug: string; county: string; town: string }>(
      "SELECT id, name, slug, county, town FROM universities WHERE is_active = true ORDER BY name ASC"
    );
    res.json({ universities: resUnis.rows });
  } catch (err) {
    next(err);
  }
}

export async function getOverview(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = universityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_QUERY", "Invalid query parameters.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const metrics = await ambassadorService.getOverviewMetrics(
      scope.universityId,
      parsed.data.range,
      parsed.data.startDate,
      parsed.data.endDate
    );
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

export async function getAnalytics(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = universityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_QUERY", "Invalid query parameters.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const analytics = await ambassadorService.getUniversityAnalytics(
      scope.universityId,
      parsed.data.range,
      parsed.data.startDate,
      parsed.data.endDate
    );
    res.json(analytics);
  } catch (err) {
    next(err);
  }
}

export async function getMarketing(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getMarketingDepartmentData(scope.universityId);
    res.json({ universityId: scope.universityId, ...data });
  } catch (err) {
    next(err);
  }
}

export async function createCampaign(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    assertDepartmentAccess(scope, "marketing");
    const created = await ambassadorService.createMarketingCampaign(scope.universityId, req.user!.id, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador/Marketer",
      "marketing",
      "campaign_created",
      "marketing_campaigns",
      created.id,
      { title: parsed.data.title, category: parsed.data.category }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaign(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.updateMarketingCampaign(req.params.id, scope.universityId, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function submitCampaignPerformance(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = submitPerformanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.recordCampaignPerformance(req.params.id, req.user!.id, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Marketer",
      "marketing",
      "campaign_reported",
      "marketing_campaigns",
      req.params.id,
      { reach: parsed.data.studentReach, clicks: parsed.data.linkClicks }
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getHotels(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getHotelDepartmentData(scope.universityId);
    res.json({ universityId: scope.universityId, ...data });
  } catch (err) {
    next(err);
  }
}

export async function createHotelLead(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.createHotelLead(scope.universityId, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Hotel Officer",
      "hotels",
      "lead_created",
      "hotel_leads",
      created.id,
      { businessName: parsed.data.businessName }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateHotelLead(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.updateHotelLead(req.params.id, scope.universityId, parsed.data);

    if (parsed.data.stage) {
      await ambassadorService.logActivity(
        scope.universityId,
        req.user!.id,
        "Hotel Officer",
        "hotels",
        "pipeline_advanced",
        "hotel_leads",
        req.params.id,
        { stage: parsed.data.stage }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerCare(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getCustomerCareDepartmentData(scope.universityId, {
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      priority: req.query.priority as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json({ universityId: scope.universityId, ...data });
  } catch (err) {
    next(err);
  }
}

export async function createSupportTicket(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.createSupportTicket(scope.universityId, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Support Agent",
      "customer_care",
      "ticket_created",
      "support_tickets",
      created.id,
      { ticketNumber: created.ticket_number, studentName: parsed.data.studentName }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function getTicketDetails(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getTicketDetails(req.params.id, scope.universityId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function addTicketMessage(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createTicketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.addTicketMessage(
      req.params.id,
      scope.universityId,
      { id: req.user!.id, fullName: "Staff Agent", role: req.user!.role },
      parsed.data.message,
      parsed.data.isInternalNote
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function updateSupportTicket(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.updateSupportTicket(req.params.id, scope.universityId, parsed.data);

    if (parsed.data.escalatedToAdmin) {
      await ambassadorService.logActivity(
        scope.universityId,
        req.user!.id,
        "Support Agent",
        "customer_care",
        "ticket_escalated",
        "support_tickets",
        req.params.id,
        { reason: parsed.data.escalationReason }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getTeam(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getTeamManagementData(scope.universityId);
    res.json({ universityId: scope.universityId, ...data });
  } catch (err) {
    next(err);
  }
}

export async function addTeamMember(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = addTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.addTeamMember(scope.universityId, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador",
      "leadership",
      "team_member_added",
      "team_members",
      created.id,
      { fullName: parsed.data.fullName, department: parsed.data.department, roleTitle: parsed.data.roleTitle }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateTeamMember(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.updateTeamMember(req.params.id, scope.universityId, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getTasks(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const data = await ambassadorService.getTasksData(scope.universityId, req.user!.id);
    res.json({ universityId: scope.universityId, ...data });
  } catch (err) {
    next(err);
  }
}

export async function createTask(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.createTeamTask(scope.universityId, req.user!.id, parsed.data);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador",
      "leadership",
      "task_created",
      "team_tasks",
      created.id,
      { title: parsed.data.title, department: parsed.data.department }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateTask(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.updateTeamTask(req.params.id, scope.universityId, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getReports(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const reports = await ambassadorService.getUniversityReports(scope.universityId);
    res.json({ universityId: scope.universityId, reports });
  } catch (err) {
    next(err);
  }
}

export async function generateReport(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = generateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.generateUniversityReport(
      scope.universityId,
      req.user!.id,
      parsed.data.reportType,
      parsed.data.startDate,
      parsed.data.endDate
    );

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador",
      "leadership",
      "report_generated",
      "university_reports",
      created.id,
      { title: created.title }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function submitReportToAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    await ambassadorService.submitReportToAdmin(req.params.id, scope.universityId);

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador",
      "leadership",
      "report_submitted_admin",
      "university_reports",
      req.params.id,
      {}
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function getAnnouncements(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const scope = await ambassadorService.resolveUniversityScope(
      req.user!,
      req.query.universityId as string | undefined
    );
    const announcements = await ambassadorService.getUniversityAnnouncements(scope.universityId);
    res.json({ universityId: scope.universityId, announcements });
  } catch (err) {
    next(err);
  }
}

export async function createAnnouncement(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_FAILED", parsed.error.issues[0]?.message || "Invalid input.");
    }
    const scope = await ambassadorService.resolveUniversityScope(req.user!, parsed.data.universityId);
    const created = await ambassadorService.createUniversityAnnouncement(
      scope.universityId,
      req.user!.id,
      parsed.data
    );

    await ambassadorService.logActivity(
      scope.universityId,
      req.user!.id,
      "Ambassador/Admin",
      "leadership",
      "announcement_published",
      "university_announcements",
      created.id,
      { title: parsed.data.title }
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function getAdminComparison(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== "mealvest_admin") {
      throw new ApiError(403, "FORBIDDEN", "Only central administrators can view multi-university comparisons.");
    }
    const comparison = await ambassadorService.getCentralAdminComparison();
    res.json(comparison);
  } catch (err) {
    next(err);
  }
}
