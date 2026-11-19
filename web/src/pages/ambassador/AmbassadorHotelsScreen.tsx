import React, { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Plus,
  Phone,
  Mail,
  MapPin,
  Star,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchHotelDepartmentData,
  createHotelLead,
  updateHotelLead,
  HotelDepartmentData,
  HotelLead,
  HotelPartnerProfile,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

const PIPELINE_ORDER = [
  "identified",
  "contacted",
  "interested",
  "negotiating",
  "agreement_pending",
  "onboarded",
  "active",
  "rejected_inactive",
];

const STAGE_LABELS: Record<string, string> = {
  identified: "Identified",
  contacted: "Contacted",
  interested: "Interested",
  negotiating: "Negotiating",
  agreement_pending: "Agreement Pending",
  onboarded: "Onboarded",
  active: "Active Partner",
  rejected_inactive: "Closed / Rejected",
};

export default function AmbassadorHotelsScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HotelDepartmentData | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "partners">("pipeline");

  // New Lead Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [commissionRate, setCommissionRate] = useState(10);
  const [dailyMeals, setDailyMeals] = useState(100);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadHotels = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchHotelDepartmentData(authFetch, currentUniversity.id);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadHotels();
  }, [loadHotels]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !businessName.trim()) return;
    try {
      setSubmitting(true);
      await createHotelLead(authFetch, {
        universityId: currentUniversity.id,
        businessName: businessName.trim(),
        ownerManagerName: ownerName.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        physicalLocation: location.trim() || undefined,
        commissionRate: Number(commissionRate),
        estimatedDailyMeals: Number(dailyMeals),
        notes: notes.trim() || undefined,
        stage: "identified",
      });
      setShowAddModal(false);
      setBusinessName("");
      setOwnerName("");
      setPhone("");
      setLocation("");
      setNotes("");
      await loadHotels();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to register hotel lead.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStage = async (leadId: string, currentStage: string, direction: "next" | "prev") => {
    const curIdx = PIPELINE_ORDER.indexOf(currentStage);
    if (curIdx === -1) return;
    const targetIdx = direction === "next" ? curIdx + 1 : curIdx - 1;
    if (targetIdx < 0 || targetIdx >= PIPELINE_ORDER.length) return;
    const newStage = PIPELINE_ORDER[targetIdx];

    try {
      await updateHotelLead(authFetch, leadId, { stage: newStage }, currentUniversity?.id);
      await loadHotels();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update lead stage.");
    }
  };

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading hotel partnerships...</span>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, pipeline, partners } = data;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Hotel Partnerships Department</h1>
          <p style={styles.subtitle}>
            Recruitment pipeline Kanban, commercial agreements, menus & partner performance
          </p>
        </div>

        <div style={styles.headerActions}>
          <div style={styles.tabToggle}>
            <button
              onClick={() => setActiveTab("pipeline")}
              style={{
                ...styles.tabBtn,
                backgroundColor: activeTab === "pipeline" ? "#111827" : "transparent",
                color: activeTab === "pipeline" ? "#FFFFFF" : "#4B5563",
              }}
            >
              Recruitment Pipeline
            </button>
            <button
              onClick={() => setActiveTab("partners")}
              style={{
                ...styles.tabBtn,
                backgroundColor: activeTab === "partners" ? "#111827" : "transparent",
                color: activeTab === "partners" ? "#FFFFFF" : "#4B5563",
              }}
            >
              Active Partners ({partners.length})
            </button>
          </div>

          <button onClick={() => setShowAddModal(true)} style={styles.addBtn}>
            <Plus size={16} />
            <span>Add Hotel Lead</span>
          </button>
        </div>
      </div>

      {/* Hotel KPIs */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Hotels Identified</span>
          <span style={styles.kpiVal}>{kpis.totalHotelsIdentified}</span>
          <span style={styles.kpiSub}>In recruitment pipeline</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Hotels Contacted</span>
          <span style={styles.kpiVal}>{kpis.hotelsContacted}</span>
          <span style={styles.kpiSub}>Pitch delivered</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Hotels Interested</span>
          <span style={styles.kpiVal}>{kpis.hotelsInterested}</span>
          <span style={styles.kpiSub}>Active discussions</span>
        </div>
        <div style={{ ...styles.kpiCard, borderLeft: "4px solid #10B981" }}>
          <span style={styles.kpiLabel}>Hotels Onboarded</span>
          <span style={{ ...styles.kpiVal, color: "#059669" }}>{kpis.hotelsOnboarded}</span>
          <span style={styles.kpiSub}>Signed & verified</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>With Menus Uploaded</span>
          <span style={styles.kpiVal}>{kpis.hotelsWithMenus}</span>
          <span style={styles.kpiSub}>Student-orderable</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Receiving Orders</span>
          <span style={styles.kpiVal}>{kpis.hotelsReceivingOrders}</span>
          <span style={styles.kpiSub}>Active daily sales</span>
        </div>
      </div>

      {/* Main View: Pipeline Kanban or Partners Table */}
      {activeTab === "pipeline" ? (
        <div style={styles.kanbanContainer}>
          <div style={styles.kanbanBoard}>
            {pipeline.map((col) => (
              <div key={col.stage} style={styles.kanbanCol}>
                <div style={styles.colHeader}>
                  <span style={styles.colTitle}>{STAGE_LABELS[col.stage] || col.stage}</span>
                  <span style={styles.colCount}>{col.leads.length}</span>
                </div>

                <div style={styles.colCards}>
                  {col.leads.length === 0 ? (
                    <div style={styles.emptyColCard}>Empty stage</div>
                  ) : (
                    col.leads.map((lead) => (
                      <div key={lead.id} style={styles.leadCard}>
                        <div style={styles.leadCardHeader}>
                          <h4 style={styles.leadName}>{lead.businessName}</h4>
                          <span style={styles.commissionBadge}>{lead.commissionRate}% fee</span>
                        </div>

                        {lead.ownerManagerName && (
                          <span style={styles.leadDetail}>Contact: {lead.ownerManagerName}</span>
                        )}
                        {lead.contactPhone && (
                          <span style={styles.leadDetail}>
                            <Phone size={11} style={{ marginRight: 4 }} />
                            {lead.contactPhone}
                          </span>
                        )}
                        {lead.physicalLocation && (
                          <span style={styles.leadDetail}>
                            <MapPin size={11} style={{ marginRight: 4 }} />
                            {lead.physicalLocation}
                          </span>
                        )}

                        <div style={styles.cardActions}>
                          <button
                            onClick={() => handleAdvanceStage(lead.id, col.stage, "prev")}
                            disabled={col.stage === "identified"}
                            style={{
                              ...styles.arrowBtn,
                              opacity: col.stage === "identified" ? 0.3 : 1,
                            }}
                            title="Move back"
                          >
                            <ChevronLeft size={14} />
                          </button>

                          <button
                            onClick={() => handleAdvanceStage(lead.id, col.stage, "next")}
                            disabled={col.stage === "rejected_inactive"}
                            style={{
                              ...styles.arrowBtn,
                              opacity: col.stage === "rejected_inactive" ? 0.3 : 1,
                            }}
                            title="Advance stage"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Active Partners List & Leaderboard */
        <div style={styles.partnersCard}>
          <h2 style={styles.cardTitle}>Active Hotel Partners ({partners.length})</h2>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Business Name</th>
                  <th style={styles.th}>Location</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Menu Items</th>
                  <th style={styles.th}>Orders</th>
                  <th style={styles.th}>Total GMV</th>
                  <th style={styles.th}>MealVest Fee (10%)</th>
                  <th style={styles.th}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {partners.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#9CA3AF" }}>
                      No active hotels onboarded for this university yet.
                    </td>
                  </tr>
                ) : (
                  partners.map((p) => (
                    <tr key={p.id} style={styles.tr}>
                      <td style={styles.td}>
                        <strong>{p.name}</strong>
                      </td>
                      <td style={styles.td}>{p.location || "Campus vicinity"}</td>
                      <td style={styles.td}>{p.contactPhone || "—"}</td>
                      <td style={styles.td}>
                        <span style={styles.activePill}>{p.status}</span>
                      </td>
                      <td style={styles.td}>{p.menuCount} items</td>
                      <td style={styles.td}>{p.ordersCount}</td>
                      <td style={styles.td}>KSh {p.gmvKes.toLocaleString()}</td>
                      <td style={{ ...styles.td, color: "#059669", fontWeight: 700 }}>
                        KSh {p.commissionKes.toLocaleString()}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.ratingRow}>
                          <Star size={13} fill="#F59E0B" color="#F59E0B" />
                          <span>{p.rating}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Lead */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Register Prospective Hotel Lead</h3>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Hotel / Food Kiosk Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mama Mboga Kitchen & Cafe"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Owner / Manager Name</label>
                  <input
                    type="text"
                    placeholder="e.g. James Mwangi"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="07..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Physical Location</label>
                <input
                  type="text"
                  placeholder="e.g. Opposite Gate B, Maseno University"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Commission Rate (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="20"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(Number(e.target.value))}
                    style={styles.input}
                  />
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Est. Daily Student Meals</label>
                  <input
                    type="number"
                    min="10"
                    value={dailyMeals}
                    onChange={(e) => setDailyMeals(Number(e.target.value))}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Initial Conversation Notes</label>
                <textarea
                  rows={3}
                  placeholder="Owner is interested in lunch meals; scheduled follow-up on Wednesday..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowAddModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Adding..." : "Add to Pipeline"}
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
    maxWidth: 1400,
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
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  tabToggle: {
    display: "flex",
    backgroundColor: "#F3F4F6",
    padding: 3,
    borderRadius: 8,
    gap: 2,
  },
  tabBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#059669",
    color: "#FFFFFF",
    border: "none",
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
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
  kanbanContainer: {
    overflowX: "auto",
    paddingBottom: 16,
  },
  kanbanBoard: {
    display: "flex",
    gap: 16,
    minWidth: 1200,
  },
  kanbanCol: {
    flex: "1 0 240px",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 700,
  },
  colHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottom: "1px solid #E5E7EB",
  },
  colTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1F2937",
  },
  colCount: {
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: "#E5E7EB",
    color: "#4B5563",
    padding: "2px 6px",
    borderRadius: 10,
  },
  colCards: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
  },
  emptyColCard: {
    padding: 20,
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    border: "1px dashed #E5E7EB",
  },
  leadCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  leadCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  leadName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  commissionBadge: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: "#ECFDF5",
    color: "#059669",
    padding: "2px 5px",
    borderRadius: 4,
  },
  leadDetail: {
    fontSize: 11,
    color: "#6B7280",
    display: "flex",
    alignItems: "center",
  },
  cardActions: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1px solid #F3F4F6",
  },
  arrowBtn: {
    backgroundColor: "#F3F4F6",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#374151",
  },
  partnersCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    border: "1px solid #E5E7EB",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 16px 0",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    textAlign: "left",
  },
  th: {
    padding: "10px 12px",
    backgroundColor: "#F9FAFB",
    color: "#6B7280",
    fontWeight: 600,
    borderBottom: "1px solid #E5E7EB",
  },
  tr: {
    borderBottom: "1px solid #F3F4F6",
  },
  td: {
    padding: "12px",
    color: "#374151",
  },
  activePill: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: "#ECFDF5",
    color: "#059669",
    padding: "2px 8px",
    borderRadius: 6,
    textTransform: "capitalize",
  },
  ratingRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontWeight: 700,
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
    maxWidth: 500,
    padding: 24,
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
