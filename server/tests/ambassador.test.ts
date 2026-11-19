import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveDateRange } from "../src/services/ambassadorService";
import {
  createCampaignSchema,
  createLeadSchema,
  createTicketSchema,
  addTeamMemberSchema,
  createTaskSchema,
  generateReportSchema,
  createAnnouncementSchema,
} from "../src/schemas/ambassadorSchemas";

describe("Ambassador Command Centre — Date Range Resolution", () => {
  test("7d range creates 7-day current window and matching 7-day previous window", () => {
    const range = resolveDateRange("7d");
    const currentDurationMs = range.currentEnd.getTime() - range.currentStart.getTime();
    const prevDurationMs = range.prevEnd.getTime() - range.prevStart.getTime();

    assert.equal(Math.round(currentDurationMs / 86_400_000), 7);
    assert.equal(Math.round(prevDurationMs / 86_400_000), 7);
    assert.equal(range.prevEnd.getTime(), range.currentStart.getTime());
  });

  test("30d range creates 30-day window", () => {
    const range = resolveDateRange("30d");
    const durationDays = Math.round((range.currentEnd.getTime() - range.currentStart.getTime()) / 86_400_000);
    assert.equal(durationDays, 30);
  });

  test("custom range honors provided dates", () => {
    const range = resolveDateRange("custom", "2026-01-01", "2026-01-15");
    assert.equal(range.currentStart.toISOString().slice(0, 10), "2026-01-01");
    assert.equal(range.currentEnd.toISOString().slice(0, 10), "2026-01-15");
  });
});

describe("Ambassador Command Centre — Schema Validations", () => {
  test("createCampaignSchema validates categories and fields", () => {
    const valid = createCampaignSchema.safeParse({
      title: "Campus Fresher Outreach 2026",
      category: "campus_activations",
      objective: "Acquire 500 new registered students",
      startDate: "2026-02-01",
      budgetKes: 15000,
    });
    assert.equal(valid.success, true);

    const invalidCategory = createCampaignSchema.safeParse({
      title: "Invalid Campaign",
      category: "unsupported_channel",
      startDate: "2026-02-01",
    });
    assert.equal(invalidCategory.success, false);

    const negativeBudget = createCampaignSchema.safeParse({
      title: "Negative Budget",
      category: "tiktok",
      startDate: "2026-02-01",
      budgetKes: -500,
    });
    assert.equal(negativeBudget.success, false);
  });

  test("createLeadSchema validates pipeline stages", () => {
    const valid = createLeadSchema.safeParse({
      businessName: "University Cafeteria Annex",
      ownerManagerName: "David Otieno",
      contactPhone: "0711223344",
      stage: "negotiating",
      commissionRate: 10.0,
      estimatedDailyMeals: 150,
    });
    assert.equal(valid.success, true);

    const invalidStage = createLeadSchema.safeParse({
      businessName: "Bad Stage Hotel",
      stage: "flying",
    });
    assert.equal(invalidStage.success, false);
  });

  test("createTicketSchema validates student support categories", () => {
    const validCategories = [
      "login_problems",
      "payment_issues",
      "meal_plan_issues",
      "hotel_complaints",
      "qr_meal_pass_issues",
      "refund_or_transaction",
      "account_issues",
      "general_inquiries",
    ];

    for (const cat of validCategories) {
      const res = createTicketSchema.safeParse({
        studentName: "Jane Doe",
        studentPhone: "0722000000",
        category: cat,
        description: "Student is experiencing issue with meal voucher QR.",
      });
      assert.equal(res.success, true, `Category ${cat} should be valid`);
    }

    const invalid = createTicketSchema.safeParse({
      studentName: "Jane Doe",
      category: "random_category",
      description: "Short",
    });
    assert.equal(invalid.success, false);
  });

  test("addTeamMemberSchema validates 4 required departments", () => {
    const validDepts = ["leadership", "marketing", "hotels", "customer_care"];
    for (const dept of validDepts) {
      const res = addTeamMemberSchema.safeParse({
        fullName: "Brian Kiprop",
        email: "brian@campus.ac.ke",
        department: dept,
        roleTitle: "Team Representative",
      });
      assert.equal(res.success, true, `Department ${dept} should be accepted`);
    }

    const invalidDept = addTeamMemberSchema.safeParse({
      fullName: "Brian Kiprop",
      email: "brian@campus.ac.ke",
      department: "finance",
      roleTitle: "Manager",
    });
    assert.equal(invalidDept.success, false);
  });

  test("createTaskSchema requires valid priority and title", () => {
    const valid = createTaskSchema.safeParse({
      title: "Distribute posters at Hall 4",
      department: "marketing",
      priority: "high",
    });
    assert.equal(valid.success, true);

    const missingTitle = createTaskSchema.safeParse({
      title: "ab",
      department: "marketing",
    });
    assert.equal(missingTitle.success, false);
  });

  test("generateReportSchema accepts all 9 official university report types", () => {
    const reportTypes = [
      "student_acquisition",
      "university_growth",
      "hotel_recruitment",
      "hotel_performance",
      "digital_marketing",
      "customer_care",
      "team_performance",
      "financial_commission",
      "monthly_performance",
    ];

    for (const type of reportTypes) {
      const res = generateReportSchema.safeParse({
        reportType: type,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      assert.equal(res.success, true, `Report type ${type} should be accepted`);
    }

    const invalidReport = generateReportSchema.safeParse({
      reportType: "secret_report",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    assert.equal(invalidReport.success, false);
  });

  test("createAnnouncementSchema validates target types and priority", () => {
    const valid = createAnnouncementSchema.safeParse({
      targetType: "university",
      targetDepartment: "all",
      title: "Semester Kickoff Ambassador Meeting",
      content: "All department leads must report with their monthly goals by Friday.",
      priority: "urgent",
      isPinned: true,
    });
    assert.equal(valid.success, true);
  });
});

describe("Ambassador Command Centre — University Performance Score Logic", () => {
  test("Performance score weighting formula sums to 100%", () => {
    const weights = {
      studentAcquisition: 0.3,
      hotelPartnerships: 0.25,
      activeStudentUsage: 0.2,
      customerSatisfaction: 0.15,
      teamProductivity: 0.1,
    };

    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 100), 100);

    // Test calculation with full scores
    const perfectScore = Math.round(
      100 * weights.studentAcquisition +
        100 * weights.hotelPartnerships +
        100 * weights.activeStudentUsage +
        100 * weights.customerSatisfaction +
        100 * weights.teamProductivity
    );
    assert.equal(perfectScore, 100);

    // Test realistic score
    const realisticScore = Math.round(
      80 * weights.studentAcquisition + // 24
        70 * weights.hotelPartnerships + // 17.5
        85 * weights.activeStudentUsage + // 17
        90 * weights.customerSatisfaction + // 13.5
        80 * weights.teamProductivity // 8
    );
    assert.equal(realisticScore, 80);
  });
});
