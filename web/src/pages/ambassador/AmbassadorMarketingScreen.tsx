import React, { useEffect, useState, useCallback } from "react";
import {
  Megaphone,
  Plus,
  Users,
  Eye,
  MousePointer,
  Award,
  Calendar,
  DollarSign,
  TrendingUp,
  X,
  FileCheck,
  Share2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchMarketingData,
  createMarketingCampaign,
  submitCampaignPerformance,
  MarketingDepartmentData,
  MarketingCampaign,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorMarketingScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MarketingDepartmentData | null>(null);

  // Campaign Creation Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("whatsapp");
  const [newObjective, setNewObjective] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTargetAudience, setNewTargetAudience] = useState("Undergraduate students");
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEndDate, setNewEndDate] = useState("");
  const [newBudget, setNewBudget] = useState(5000);
  const [submitting, setSubmitting] = useState(false);

  // Performance Report Modal
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [reportReach, setReportReach] = useState(500);
  const [reportClicks, setReportClicks] = useState(120);
  const [reportRegistrations, setReportRegistrations] = useState(45);
  const [reportNotes, setReportNotes] = useState("");

  const loadMarketing = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchMarketingData(authFetch, currentUniversity.id);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadMarketing();
  }, [loadMarketing]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !newTitle.trim()) return;
    try {
      setSubmitting(true);
      await createMarketingCampaign(authFetch, {
        universityId: currentUniversity.id,
        title: newTitle.trim(),
        category: newCategory,
        objective: newObjective.trim(),
        description: newDescription.trim(),
        targetAudience: newTargetAudience.trim(),
        startDate: newStartDate,
        endDate: newEndDate || undefined,
        budgetKes: Number(newBudget),
      });
      setShowCreateModal(false);
      setNewTitle("");
      await loadMarketing();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPerformance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    try {
      setSubmitting(true);
      await submitCampaignPerformance(authFetch, selectedCampaign.id, {
        studentReach: Number(reportReach),
        impressions: Number(reportReach) * 2,
        engagement: Math.round(Number(reportReach) * 0.4),
        linkClicks: Number(reportClicks),
        newRegistrations: Number(reportRegistrations),
        notes: reportNotes.trim(),
      });
      setSelectedCampaign(null);
      await loadMarketing();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit performance report.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading marketing department...</span>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, campaigns, marketersLeaderboard } = data;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Digital Marketing Department</h1>
          <p style={styles.subtitle}>
            Student acquisition campaigns, publicity, campus activations & marketer leaderboard
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
          <Plus size={16} />
          <span>Launch Campaign</span>
        </button>
      </div>

      {/* Marketing KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Total Campaigns</span>
          <span style={styles.kpiVal}>{kpis.totalCampaigns}</span>
          <span style={styles.kpiSub}>Active & archived</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Student Reach</span>
          <span style={styles.kpiVal}>{kpis.totalStudentReach.toLocaleString()}</span>
          <span style={styles.kpiSub}>Estimated student views</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Link Clicks</span>
          <span style={styles.kpiVal}>{kpis.totalLinkClicks.toLocaleString()}</span>
          <span style={styles.kpiSub}>Inbound landing clicks</span>
        </div>
        <div style={{ ...styles.kpiCard, borderLeft: "4px solid #10B981" }}>
          <span style={styles.kpiLabel}>New Registrations</span>
          <span style={{ ...styles.kpiVal, color: "#059669" }}>
            {kpis.totalRegistrationsAttributed.toLocaleString()}
          </span>
          <span style={styles.kpiSub}>Attributed to marketing</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Campaign Conversion</span>
          <span style={styles.kpiVal}>{kpis.conversionRate}</span>
          <span style={styles.kpiSub}>Clicks to signup ratio</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Cost Per Acquisition</span>
          <span style={styles.kpiVal}>KSh {kpis.costPerAcquisitionKes}</span>
          <span style={styles.kpiSub}>Ad spend per new student</span>
        </div>
      </div>

      {/* Main Content Columns: Campaigns & Marketer Leaderboard */}
      <div style={styles.mainGrid}>
        {/* Left Column: Campaigns List */}
        <div style={styles.campaignsColumn}>
          <div style={styles.columnHeader}>
            <h2 style={styles.columnTitle}>Marketing Campaigns ({campaigns.length})</h2>
          </div>

          <div style={styles.campaignList}>
            {campaigns.length === 0 ? (
              <div style={styles.emptyCard}>
                <Megaphone size={32} color="#9CA3AF" />
                <p>No marketing campaigns launched yet.</p>
                <button onClick={() => setShowCreateModal(true)} style={styles.outlineBtn}>
                  Create First Campaign
                </button>
              </div>
            ) : (
              campaigns.map((c) => (
                <div key={c.id} style={styles.campaignCard}>
                  <div style={styles.campHeader}>
                    <div style={styles.campCategoryBadge}>{c.category.replace(/_/g, " ").toUpperCase()}</div>
                    <span
                      style={{
                        ...styles.statusBadge,
                        backgroundColor: c.status === "active" ? "#ECFDF5" : "#F3F4F6",
                        color: c.status === "active" ? "#059669" : "#4B5563",
                      }}
                    >
                      {c.status}
                    </span>
                  </div>

                  <h3 style={styles.campTitle}>{c.title}</h3>
                  {c.objective && <p style={styles.campObj}>Objective: {c.objective}</p>}

                  <div style={styles.campMetrics}>
                    <div style={styles.campMetricItem}>
                      <span style={styles.campMetricVal}>{c.metrics.reach.toLocaleString()}</span>
                      <span style={styles.campMetricLbl}>Reach</span>
                    </div>
                    <div style={styles.campMetricItem}>
                      <span style={styles.campMetricVal}>{c.metrics.clicks.toLocaleString()}</span>
                      <span style={styles.campMetricLbl}>Clicks</span>
                    </div>
                    <div style={styles.campMetricItem}>
                      <span style={{ ...styles.campMetricVal, color: "#059669" }}>
                        {c.metrics.registrations.toLocaleString()}
                      </span>
                      <span style={styles.campMetricLbl}>Signups</span>
                    </div>
                    <div style={styles.campMetricItem}>
                      <span style={styles.campMetricVal}>KSh {c.budgetKes.toLocaleString()}</span>
                      <span style={styles.campMetricLbl}>Budget</span>
                    </div>
                  </div>

                  <div style={styles.campFooter}>
                    <span style={styles.campDates}>
                      <Calendar size={13} style={{ marginRight: 4 }} />
                      Starts {c.startDate} {c.endDate ? `· Ends ${c.endDate}` : ""}
                    </span>

                    <button onClick={() => setSelectedCampaign(c)} style={styles.reportBtn}>
                      <FileCheck size={14} />
                      <span>Log Report</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Marketers Leaderboard (Spec Section 6) */}
        <div style={styles.leaderboardColumn}>
          <div style={styles.columnHeader}>
            <Award size={18} color="#D97706" />
            <h2 style={styles.columnTitle}>Marketer Leaderboard</h2>
          </div>

          <div style={styles.leaderboardList}>
            {marketersLeaderboard.length === 0 ? (
              <div style={styles.emptyCard}>
                <p>No digital marketers assigned to this university yet.</p>
              </div>
            ) : (
              marketersLeaderboard.map((m, idx) => (
                <div key={m.id} style={styles.leaderboardItem}>
                  <div
                    style={{
                      ...styles.rankCircle,
                      backgroundColor: idx === 0 ? "#FEF3C7" : idx === 1 ? "#F3F4F6" : "#FFF7ED",
                      color: idx === 0 ? "#92400E" : "#374151",
                    }}
                  >
                    #{idx + 1}
                  </div>

                  <div style={styles.marketerInfo}>
                    <span style={styles.marketerName}>{m.fullName}</span>
                    <span style={styles.marketerRole}>{m.roleTitle}</span>
                    <span style={styles.marketerStats}>
                      {m.studentsAcquired} students acquired · {m.campaignsHandled} campaigns
                    </span>
                  </div>

                  <div style={styles.scoreBadge}>
                    <span style={styles.scoreVal}>{m.performanceScore}</span>
                    <span style={styles.scoreLbl}>Score</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create Campaign */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Launch Marketing Campaign</h3>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Campaign Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fresher Orientation WhatsApp Blitz"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Channel Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={styles.select}
                  >
                    <option value="whatsapp">WhatsApp Marketing</option>
                    <option value="tiktok">TikTok Marketing</option>
                    <option value="instagram">Instagram Marketing</option>
                    <option value="facebook">Facebook Marketing</option>
                    <option value="campus_activations">Campus Activations</option>
                    <option value="class_rep_outreach">Class Rep Outreach</option>
                    <option value="student_referrals">Student Referrals</option>
                    <option value="other">Other Promotion</option>
                  </select>
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Budget (KSh)</label>
                  <input
                    type="number"
                    min="0"
                    value={newBudget}
                    onChange={(e) => setNewBudget(Number(e.target.value))}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Campaign Objective</label>
                <input
                  type="text"
                  placeholder="e.g. Reach 1,000 students and acquire 200 signups"
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Start Date</label>
                  <input
                    type="date"
                    required
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>End Date (Optional)</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Launching..." : "Launch Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Performance Report */}
      {selectedCampaign && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Log Performance: {selectedCampaign.title}</h3>
              <button onClick={() => setSelectedCampaign(null)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPerformance} style={styles.form}>
              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Student Reach</label>
                  <input
                    type="number"
                    min="0"
                    value={reportReach}
                    onChange={(e) => setReportReach(Number(e.target.value))}
                    style={styles.input}
                  />
                </div>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Link Clicks</label>
                  <input
                    type="number"
                    min="0"
                    value={reportClicks}
                    onChange={(e) => setReportClicks(Number(e.target.value))}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>New Registrations Attributed</label>
                <input
                  type="number"
                  min="0"
                  value={reportRegistrations}
                  onChange={(e) => setReportRegistrations(Number(e.target.value))}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Notes & Observations</label>
                <textarea
                  rows={3}
                  placeholder="Notes on student reception, posters distributed..."
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setSelectedCampaign(null)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Saving..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  loadingContainer: {
    height: 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    margin: "4px 0 0 0",
  },
  createBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    color: "#FFFFFF",
    border: "none",
    padding: "8px 16px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  kpiCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  kpiVal: {
    fontSize: 22,
    fontWeight: 800,
    color: "#111827",
  },
  kpiSub: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 24,
  },
  campaignsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  campaignList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  campaignCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  campHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  campCategoryBadge: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: "#F3F4F6",
    color: "#374151",
    padding: "3px 8px",
    borderRadius: 4,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 6,
    textTransform: "capitalize",
  },
  campTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  campObj: {
    fontSize: 12,
    color: "#4B5563",
    margin: 0,
  },
  campMetrics: {
    display: "flex",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: "10px 14px",
    justifyContent: "space-between",
  },
  campMetricItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  campMetricVal: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
  },
  campMetricLbl: {
    fontSize: 10,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  campFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTop: "1px solid #F3F4F6",
  },
  campDates: {
    fontSize: 11,
    color: "#9CA3AF",
    display: "flex",
    alignItems: "center",
  },
  reportBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    border: "1px solid #E5E7EB",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
  },
  leaderboardColumn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #E5E7EB",
    height: "fit-content",
  },
  leaderboardList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 16,
  },
  leaderboardItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    border: "1px solid #F3F4F6",
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 12,
    flexShrink: 0,
  },
  marketerInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  },
  marketerName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111827",
  },
  marketerRole: {
    fontSize: 11,
    color: "#6B7280",
  },
  marketerStats: {
    fontSize: 11,
    color: "#059669",
    fontWeight: 600,
    marginTop: 2,
  },
  scoreBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  scoreVal: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111827",
  },
  scoreLbl: {
    fontSize: 9,
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  emptyCard: {
    padding: 32,
    textAlign: "center",
    color: "#9CA3AF",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    border: "1px dashed #D1D5DB",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  outlineBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #10B981",
    color: "#059669",
    backgroundColor: "transparent",
    fontWeight: 600,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modalBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    width: "100%",
    maxWidth: 520,
    padding: 24,
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: "#111827",
    margin: 0,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#6B7280",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldRow: {
    display: "flex",
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    outline: "none",
  },
  select: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    backgroundColor: "#FFFFFF",
    outline: "none",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    backgroundColor: "#FFFFFF",
    color: "#374151",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#059669",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
