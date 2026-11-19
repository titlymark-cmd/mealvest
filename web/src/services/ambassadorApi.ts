export type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export interface UniversityItem {
  id: string;
  name: string;
  slug: string;
  county?: string;
  town?: string;
}

export interface AmbassadorScope {
  universityId: string;
  universityName: string;
  universitySlug: string;
  role: string;
  department?: string;
  permissions?: string[];
  isCentralAdmin: boolean;
}

export interface AmbassadorMeResponse {
  scope: AmbassadorScope;
  universities: UniversityItem[];
}

export interface KpiCardData {
  value: number | string;
  sub?: string;
  target?: number;
  percentChange?: number;
  trend?: "up" | "down" | "neutral";
}

export interface AmbassadorOverviewData {
  universityId: string;
  universityName: string;
  range: string;
  performanceScore: {
    overall: number;
    breakdown: {
      studentAcquisition: { score: number; weight: number };
      hotelPartnerships: { score: number; weight: number };
      activeStudentUsage: { score: number; weight: number };
      customerSatisfaction: { score: number; weight: number };
      teamProductivity: { score: number; weight: number };
    };
  };
  kpis: {
    totalRegisteredStudents: KpiCardData;
    activeUsers: KpiCardData;
    studentsWithActivePlans: KpiCardData;
    newRegistrations: KpiCardData;
    totalPayingStudents: KpiCardData;
    studentConversionRate: KpiCardData;
    totalHotelsOnboarded: KpiCardData;
    hotelsAwaitingApproval: KpiCardData;
    totalMealOrders: KpiCardData;
    totalTransactionValue: KpiCardData;
    totalCommissionGenerated: KpiCardData;
    mealBoostParticipation: KpiCardData;
  };
  recentActivity: Array<{
    id: string;
    user_name: string;
    department: string;
    action_type: string;
    entity_type: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface AmbassadorAnalyticsData {
  universityId: string;
  range: string;
  studentAnalytics: {
    totalRegistered: number;
    activeCount: number;
    inactiveCount: number;
    activePct: number;
    dailyRegistrationTrend: Array<{ date: string; count: number }>;
    funnel: Array<{ stage: string; count: number; pct: number }>;
    retentionRate: number;
  };
  financialAnalytics: {
    totalOrderValueKes: number;
    totalCommissionKes: number;
    totalCompletedTransactions: number;
    averageOrderValueKes: number;
    dailyTrend: Array<{ date: string; gmv: number; commission: number; orders: number }>;
    hotelCommissionBreakdown: Array<{
      hotelId: string;
      hotelName: string;
      ordersCount: number;
      gmvKes: number;
      commissionKes: number;
    }>;
  };
  engagementAnalytics: {
    activePeriods: Array<{ period: string; count: number }>;
    popularMealPlans: Array<{ name: string; count: number; share: string }>;
  };
}

export interface MarketingCampaign {
  id: string;
  title: string;
  category: string;
  objective?: string;
  description?: string;
  targetAudience?: string;
  posterUrl?: string;
  startDate: string;
  endDate?: string;
  budgetKes: number;
  spendKes: number;
  status: "planning" | "active" | "paused" | "completed" | "cancelled";
  metrics: {
    reach: number;
    clicks: number;
    registrations: number;
  };
}

export interface MarketerLeaderboardEntry {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  roleTitle: string;
  status: string;
  performanceScore: number;
  studentsAcquired: number;
  campaignsHandled: number;
}

export interface MarketingDepartmentData {
  universityId: string;
  kpis: {
    totalCampaigns: number;
    totalStudentReach: number;
    totalLinkClicks: number;
    totalRegistrationsAttributed: number;
    conversionRate: string;
    costPerAcquisitionKes: number;
    totalSpendKes: number;
  };
  campaigns: MarketingCampaign[];
  marketersLeaderboard: MarketerLeaderboardEntry[];
}

export interface HotelLead {
  id: string;
  businessName: string;
  ownerManagerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  physicalLocation?: string;
  commissionRate: number;
  estimatedDailyMeals: number;
  notes?: string;
  assignedToName?: string;
  nextFollowupDate?: string;
}

export interface HotelPartnerProfile {
  id: string;
  name: string;
  location?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: string;
  payoutMethod?: string;
  menuCount: number;
  ordersCount: number;
  gmvKes: number;
  commissionKes: number;
  rating: number;
}

export interface HotelDepartmentData {
  universityId: string;
  kpis: {
    totalHotelsIdentified: number;
    hotelsContacted: number;
    hotelsInterested: number;
    hotelsOnboarded: number;
    hotelsWithMenus: number;
    hotelsReceivingOrders: number;
  };
  pipeline: Array<{
    stage: string;
    leads: HotelLead[];
  }>;
  partners: HotelPartnerProfile[];
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  studentName: string;
  studentPhone?: string;
  category: string;
  priority: string;
  status: string;
  assignedToName?: string;
  description: string;
  escalatedToAdmin: boolean;
  escalationReason?: string;
  csatRating?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface CustomerCareDepartmentData {
  universityId: string;
  kpis: {
    totalTickets: number;
    openTickets: number;
    pendingTickets: number;
    resolvedTickets: number;
    escalatedTickets: number;
    averageResponseTime: string;
    averageResolutionTime: string;
    csatScore: number;
  };
  tickets: SupportTicket[];
}

export interface TeamMember {
  id: string;
  userId?: string;
  department: "leadership" | "marketing" | "hotels" | "customer_care";
  fullName: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  roleTitle: string;
  responsibilities?: string;
  status: "active" | "suspended" | "inactive";
  performanceScore: number;
  studentsAcquired: number;
  campaignsHandled: number;
  permissions: string[];
}

export interface TeamDepartmentGroup {
  id: string;
  name: string;
  description?: string;
  leader?: { fullName: string; roleTitle: string } | null;
  members: TeamMember[];
}

export interface TeamManagementData {
  universityId: string;
  ambassador?: {
    id: string;
    full_name: string;
    email: string;
    phone_number?: string;
    photo_url?: string;
    bio?: string;
  } | null;
  departments: TeamDepartmentGroup[];
  allMembers: TeamMember[];
}

export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  department: string;
  priority: string;
  status: string;
  deadline?: string;
  completionEvidence?: string;
  completedAt?: string;
  createdAt: string;
  assignedToName?: string;
  isMine: boolean;
}

export interface TasksData {
  universityId: string;
  summary: {
    total: number;
    myCount: number;
    overdueCount: number;
    completedCount: number;
  };
  myTasks: TeamTask[];
  allTasks: TeamTask[];
  overdueTasks: TeamTask[];
  completedTasks: TeamTask[];
}

export interface UniversityReport {
  id: string;
  report_type: string;
  title: string;
  start_date: string;
  end_date: string;
  summary_data: Record<string, unknown>;
  submitted_to_admin: boolean;
  admin_notes?: string;
  created_at: string;
}

export interface UniversityAnnouncement {
  id: string;
  target_type: string;
  target_department: string;
  title: string;
  content: string;
  priority: string;
  is_pinned: boolean;
  created_at: string;
  author_name: string;
}

export interface AdminUniversityRanking {
  rank: number;
  universityId: string;
  name: string;
  slug: string;
  county: string;
  town: string;
  ambassadorName: string;
  metrics: {
    registeredStudents: number;
    activeStudents: number;
    activeHotels: number;
    totalGmvKes: number;
    totalCommissionKes: number;
    csatScore: number;
    performanceScore: number;
    growthStatus: string;
  };
}

export interface AdminComparisonData {
  totalUniversities: number;
  rankings: AdminUniversityRanking[];
}

// API Functions

export async function fetchAmbassadorMe(authFetch: AuthFetch, universityId?: string): Promise<AmbassadorMeResponse> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/me${query}`);
  return parseOrError(res, "Could not load ambassador scope.");
}

export async function fetchUniversities(authFetch: AuthFetch): Promise<UniversityItem[]> {
  const res = await authFetch("/api/ambassador/universities");
  const data = await parseOrError<{ universities: UniversityItem[] }>(res, "Could not load universities.");
  return data.universities;
}

export async function fetchAmbassadorOverview(
  authFetch: AuthFetch,
  params: { universityId?: string; range?: string; startDate?: string; endDate?: string } = {}
): Promise<AmbassadorOverviewData> {
  const sp = new URLSearchParams();
  if (params.universityId) sp.set("universityId", params.universityId);
  if (params.range) sp.set("range", params.range);
  if (params.startDate) sp.set("startDate", params.startDate);
  if (params.endDate) sp.set("endDate", params.endDate);
  const res = await authFetch(`/api/ambassador/overview?${sp.toString()}`);
  return parseOrError(res, "Could not load command centre overview.");
}

export async function fetchAmbassadorAnalytics(
  authFetch: AuthFetch,
  params: { universityId?: string; range?: string; startDate?: string; endDate?: string } = {}
): Promise<AmbassadorAnalyticsData> {
  const sp = new URLSearchParams();
  if (params.universityId) sp.set("universityId", params.universityId);
  if (params.range) sp.set("range", params.range);
  if (params.startDate) sp.set("startDate", params.startDate);
  if (params.endDate) sp.set("endDate", params.endDate);
  const res = await authFetch(`/api/ambassador/analytics?${sp.toString()}`);
  return parseOrError(res, "Could not load university analytics.");
}

export async function fetchMarketingData(authFetch: AuthFetch, universityId?: string): Promise<MarketingDepartmentData> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/marketing${query}`);
  return parseOrError(res, "Could not load marketing department data.");
}

export async function createMarketingCampaign(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    title: string;
    category: string;
    objective?: string;
    description?: string;
    targetAudience?: string;
    posterUrl?: string;
    startDate: string;
    endDate?: string;
    budgetKes: number;
  }
): Promise<{ id: string }> {
  const res = await authFetch("/api/ambassador/marketing/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not create campaign.");
}

export async function updateMarketingCampaign(
  authFetch: AuthFetch,
  id: string,
  data: Record<string, unknown>,
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/marketing/campaigns/${id}${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not update campaign.");
}

export async function submitCampaignPerformance(
  authFetch: AuthFetch,
  id: string,
  data: {
    studentReach: number;
    impressions: number;
    engagement: number;
    linkClicks: number;
    newRegistrations: number;
    notes?: string;
    reportDate?: string;
  },
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/marketing/campaigns/${id}/performance${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not submit campaign report.");
}

export async function fetchHotelDepartmentData(authFetch: AuthFetch, universityId?: string): Promise<HotelDepartmentData> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/hotels${query}`);
  return parseOrError(res, "Could not load hotel partnerships data.");
}

export async function createHotelLead(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    businessName: string;
    ownerManagerName?: string;
    contactPhone?: string;
    contactEmail?: string;
    physicalLocation?: string;
    stage?: string;
    commissionRate?: number;
    estimatedDailyMeals?: number;
    notes?: string;
  }
): Promise<{ id: string }> {
  const res = await authFetch("/api/ambassador/hotels/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not register hotel lead.");
}

export async function updateHotelLead(
  authFetch: AuthFetch,
  id: string,
  data: Record<string, unknown>,
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/hotels/leads/${id}${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not update hotel lead.");
}

export async function fetchCustomerCareData(
  authFetch: AuthFetch,
  params: { universityId?: string; status?: string; category?: string; priority?: string; search?: string } = {}
): Promise<CustomerCareDepartmentData> {
  const sp = new URLSearchParams();
  if (params.universityId) sp.set("universityId", params.universityId);
  if (params.status) sp.set("status", params.status);
  if (params.category) sp.set("category", params.category);
  if (params.priority) sp.set("priority", params.priority);
  if (params.search) sp.set("search", params.search);
  const res = await authFetch(`/api/ambassador/customer-care?${sp.toString()}`);
  return parseOrError(res, "Could not load customer care data.");
}

export async function fetchTicketDetails(
  authFetch: AuthFetch,
  ticketId: string,
  universityId?: string
): Promise<{ ticket: SupportTicket; messages: Array<{ id: string; sender_name: string; sender_type: string; message: string; is_internal_note: boolean; created_at: string }> }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/customer-care/tickets/${ticketId}${query}`);
  return parseOrError(res, "Could not load ticket details.");
}

export async function createSupportTicket(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    studentName: string;
    studentPhone?: string;
    category: string;
    priority?: string;
    description: string;
  }
): Promise<{ id: string; ticket_number: string }> {
  const res = await authFetch("/api/ambassador/customer-care/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not create support ticket.");
}

export async function addTicketMessage(
  authFetch: AuthFetch,
  ticketId: string,
  data: { message: string; isInternalNote: boolean },
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/customer-care/tickets/${ticketId}/messages${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not post message to ticket.");
}

export async function updateSupportTicket(
  authFetch: AuthFetch,
  ticketId: string,
  data: Record<string, unknown>,
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/customer-care/tickets/${ticketId}${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not update support ticket.");
}

export async function fetchTeamData(authFetch: AuthFetch, universityId?: string): Promise<TeamManagementData> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/team${query}`);
  return parseOrError(res, "Could not load team data.");
}

export async function addTeamMember(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    fullName: string;
    email: string;
    phoneNumber?: string;
    department: "leadership" | "marketing" | "hotels" | "customer_care";
    roleTitle: string;
    responsibilities?: string;
    permissions?: string[];
  }
): Promise<{ id: string }> {
  const res = await authFetch("/api/ambassador/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not add team member.");
}

export async function updateTeamMember(
  authFetch: AuthFetch,
  id: string,
  data: Record<string, unknown>,
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/team/${id}${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not update team member.");
}

export async function fetchTasksData(authFetch: AuthFetch, universityId?: string): Promise<TasksData> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/tasks${query}`);
  return parseOrError(res, "Could not load tasks.");
}

export async function createTeamTask(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    title: string;
    description?: string;
    department: "leadership" | "marketing" | "hotels" | "customer_care";
    assignedTo?: string;
    priority?: string;
    deadline?: string;
  }
): Promise<{ id: string }> {
  const res = await authFetch("/api/ambassador/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not create task.");
}

export async function updateTeamTask(
  authFetch: AuthFetch,
  id: string,
  data: Record<string, unknown>,
  universityId?: string
): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/tasks/${id}${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not update task.");
}

export async function fetchReports(authFetch: AuthFetch, universityId?: string): Promise<UniversityReport[]> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/reports${query}`);
  const data = await parseOrError<{ reports: UniversityReport[] }>(res, "Could not load reports.");
  return data.reports;
}

export async function generateReport(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    reportType: string;
    startDate: string;
    endDate: string;
  }
): Promise<{ id: string; title: string; summaryData: Record<string, unknown> }> {
  const res = await authFetch("/api/ambassador/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not generate university report.");
}

export async function submitReportToAdmin(authFetch: AuthFetch, id: string, universityId?: string): Promise<{ ok: boolean }> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/reports/${id}/submit-admin${query}`, {
    method: "POST",
  });
  return parseOrError(res, "Could not submit report to admin.");
}

export async function fetchAnnouncements(authFetch: AuthFetch, universityId?: string): Promise<UniversityAnnouncement[]> {
  const query = universityId ? `?universityId=${encodeURIComponent(universityId)}` : "";
  const res = await authFetch(`/api/ambassador/announcements${query}`);
  const data = await parseOrError<{ announcements: UniversityAnnouncement[] }>(res, "Could not load announcements.");
  return data.announcements;
}

export async function createAnnouncement(
  authFetch: AuthFetch,
  data: {
    universityId?: string;
    targetType: string;
    targetDepartment?: string;
    title: string;
    content: string;
    priority?: string;
    isPinned?: boolean;
  }
): Promise<{ id: string }> {
  const res = await authFetch("/api/ambassador/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseOrError(res, "Could not publish announcement.");
}

export async function fetchAdminUniversityComparison(authFetch: AuthFetch): Promise<AdminComparisonData> {
  const res = await authFetch("/api/ambassador/admin/comparison");
  return parseOrError(res, "Could not load multi-university rankings.");
}
