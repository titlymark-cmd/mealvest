import React, { useEffect, useState, useCallback } from "react";
import {
  Headphones,
  Search,
  Filter,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  Lock,
  ArrowUpRight,
  X,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchCustomerCareData,
  fetchTicketDetails,
  createSupportTicket,
  addTicketMessage,
  updateSupportTicket,
  CustomerCareDepartmentData,
  SupportTicket,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

const CATEGORIES: Record<string, string> = {
  login_problems: "Login Problems",
  payment_issues: "Payment Issues",
  meal_plan_issues: "Meal Plan Issues",
  hotel_complaints: "Hotel Complaints",
  qr_meal_pass_issues: "QR Meal-Pass Issues",
  refund_or_transaction: "Refund / Inquiries",
  account_issues: "Account Issues",
  general_inquiries: "General Inquiries",
};

export default function AmbassadorCustomerCareScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CustomerCareDepartmentData | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Selected Ticket Drawer
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<Array<{
    id: string;
    sender_name: string;
    sender_type: string;
    message: string;
    is_internal_note: boolean;
    created_at: string;
  }>>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  // New Ticket Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newCategory, setNewCategory] = useState("meal_plan_issues");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDescription, setNewDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchCustomerCareData(authFetch, {
        universityId: currentUniversity.id,
        search: search || undefined,
        status: selectedStatus || undefined,
        category: selectedCategory || undefined,
      });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity, search, selectedStatus, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openTicketDrawer = async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    try {
      setDrawerLoading(true);
      const res = await fetchTicketDetails(authFetch, ticket.id, currentUniversity?.id);
      setTicketMessages(res.messages);
    } catch (e) {
      console.error(e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    try {
      await addTicketMessage(
        authFetch,
        activeTicket.id,
        {
          message: replyText.trim(),
          isInternalNote,
        },
        currentUniversity?.id
      );
      setReplyText("");
      // Refresh messages
      const res = await fetchTicketDetails(authFetch, activeTicket.id, currentUniversity?.id);
      setTicketMessages(res.messages);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to post message.");
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!activeTicket) return;
    try {
      await updateSupportTicket(authFetch, activeTicket.id, { status }, currentUniversity?.id);
      setActiveTicket({ ...activeTicket, status });
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const handleEscalateToAdmin = async () => {
    if (!activeTicket) return;
    const reason = prompt("Enter reason for central admin escalation:");
    if (!reason) return;
    try {
      await updateSupportTicket(
        authFetch,
        activeTicket.id,
        {
          status: "escalated",
          escalatedToAdmin: true,
          escalationReason: reason,
        },
        currentUniversity?.id
      );
      setActiveTicket({ ...activeTicket, status: "escalated", escalatedToAdmin: true });
      await loadData();
      alert("Ticket successfully escalated to Central MealVest Administration.");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to escalate ticket.");
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !newStudentName.trim() || !newDescription.trim()) return;
    try {
      setSubmitting(true);
      await createSupportTicket(authFetch, {
        universityId: currentUniversity.id,
        studentName: newStudentName.trim(),
        studentPhone: newStudentPhone.trim() || undefined,
        category: newCategory,
        priority: newPriority,
        description: newDescription.trim(),
      });
      setShowCreateModal(false);
      setNewStudentName("");
      setNewStudentPhone("");
      setNewDescription("");
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading support centre...</span>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, tickets } = data;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Customer Care & Support Department</h1>
          <p style={styles.subtitle}>
            Student support tickets, issue resolution, CSAT monitoring & central admin escalation
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} style={styles.createBtn}>
          <Plus size={16} />
          <span>New Support Ticket</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Total Tickets</span>
          <span style={styles.kpiVal}>{kpis.totalTickets}</span>
          <span style={styles.kpiSub}>All student cases</span>
        </div>
        <div style={{ ...styles.kpiCard, borderLeft: "4px solid #EF4444" }}>
          <span style={styles.kpiLabel}>Open Tickets</span>
          <span style={{ ...styles.kpiVal, color: "#EF4444" }}>{kpis.openTickets}</span>
          <span style={styles.kpiSub}>Awaiting first response</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>In Progress</span>
          <span style={styles.kpiVal}>{kpis.pendingTickets}</span>
          <span style={styles.kpiSub}>Being investigated</span>
        </div>
        <div style={{ ...styles.kpiCard, borderLeft: "4px solid #10B981" }}>
          <span style={styles.kpiLabel}>Resolved Cases</span>
          <span style={{ ...styles.kpiVal, color: "#059669" }}>{kpis.resolvedTickets}</span>
          <span style={styles.kpiSub}>Successfully closed</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>Escalated to Admin</span>
          <span style={styles.kpiVal}>{kpis.escalatedTickets}</span>
          <span style={styles.kpiSub}>National oversight</span>
        </div>
        <div style={styles.kpiCard}>
          <span style={styles.kpiLabel}>CSAT Score</span>
          <span style={{ ...styles.kpiVal, color: "#7C3AED" }}>{kpis.csatScore}%</span>
          <span style={styles.kpiSub}>Student satisfaction</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={styles.filterBar}>
        <div style={styles.searchBox}>
          <Search size={16} color="#9CA3AF" />
          <input
            type="text"
            placeholder="Search by student name, phone or ticket number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORIES).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Tickets List */}
      <div style={styles.card}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ticket #</th>
                <th style={styles.th}>Student Name</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Priority</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Agent</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#9CA3AF" }}>
                    No support tickets match the current filters.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.ticketPill}>{t.ticketNumber}</span>
                    </td>
                    <td style={styles.td}>
                      <strong>{t.studentName}</strong>
                      {t.studentPhone && <div style={styles.subtext}>{t.studentPhone}</div>}
                    </td>
                    <td style={styles.td}>{CATEGORIES[t.category] || t.category}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.priorityBadge,
                          backgroundColor:
                            t.priority === "urgent" || t.priority === "high" ? "#FEF2F2" : "#F3F4F6",
                          color: t.priority === "urgent" || t.priority === "high" ? "#DC2626" : "#4B5563",
                        }}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          backgroundColor:
                            t.status === "open"
                              ? "#FEF2F2"
                              : t.status === "resolved"
                              ? "#ECFDF5"
                              : t.status === "escalated"
                              ? "#FEF3C7"
                              : "#EFF6FF",
                          color:
                            t.status === "open"
                              ? "#DC2626"
                              : t.status === "resolved"
                              ? "#059669"
                              : t.status === "escalated"
                              ? "#92400E"
                              : "#1D4ED8",
                        }}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={styles.td}>{t.assignedToName || "Unassigned"}</td>
                    <td style={styles.td}>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td style={styles.td}>
                      <button onClick={() => openTicketDrawer(t)} style={styles.viewBtn}>
                        Open Case
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Detail Drawer */}
      {activeTicket && (
        <div style={styles.drawerOverlay} onClick={() => setActiveTicket(null)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <div>
                <span style={styles.ticketPill}>{activeTicket.ticketNumber}</span>
                <h3 style={styles.drawerTitle}>{activeTicket.studentName}</h3>
                <span style={styles.drawerSub}>Category: {CATEGORIES[activeTicket.category] || activeTicket.category}</span>
              </div>
              <button onClick={() => setActiveTicket(null)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {/* Ticket Management Actions */}
            <div style={styles.statusActionRow}>
              <button
                onClick={() => handleUpdateStatus("in_progress")}
                style={{ ...styles.actionPill, backgroundColor: "#EFF6FF", color: "#1D4ED8" }}
              >
                Mark In Progress
              </button>
              <button
                onClick={() => handleUpdateStatus("resolved")}
                style={{ ...styles.actionPill, backgroundColor: "#ECFDF5", color: "#059669" }}
              >
                Resolve Ticket
              </button>
              <button
                onClick={handleEscalateToAdmin}
                style={{ ...styles.actionPill, backgroundColor: "#FEF3C7", color: "#92400E" }}
              >
                <ShieldAlert size={14} />
                <span>Escalate to Admin</span>
              </button>
            </div>

            <div style={styles.ticketDescBox}>
              <div style={styles.descLabel}>Student Issue Description:</div>
              <p style={styles.descText}>{activeTicket.description}</p>
            </div>

            {/* Conversation & Internal Notes Thread */}
            <div style={styles.threadContainer}>
              <div style={styles.threadHeader}>
                <MessageSquare size={16} />
                <span>Responses & Internal Team Notes</span>
              </div>

              <div style={styles.threadMessages}>
                {drawerLoading ? (
                  <Spinner size="small" color="#059669" />
                ) : ticketMessages.length === 0 ? (
                  <div style={styles.emptyMessages}>No messages logged yet. Post an update below.</div>
                ) : (
                  ticketMessages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        ...styles.messageBox,
                        backgroundColor: m.is_internal_note ? "#FFFBEB" : "#F9FAFB",
                        borderColor: m.is_internal_note ? "#FDE68A" : "#E5E7EB",
                      }}
                    >
                      <div style={styles.messageSenderRow}>
                        <strong>{m.sender_name}</strong>
                        {m.is_internal_note && <span style={styles.internalBadge}>Internal Note</span>}
                        <span style={styles.msgTime}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p style={styles.messageText}>{m.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reply Input Form */}
            <form onSubmit={handleSendMessage} style={styles.replyForm}>
              <div style={styles.replyOptionRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
                  <span>Log as Internal Team Note (Hidden from student)</span>
                </label>
              </div>

              <div style={styles.replyInputRow}>
                <textarea
                  rows={2}
                  required
                  placeholder={isInternalNote ? "Add internal note for campus team..." : "Write a response to student..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={styles.replyInput}
                />
                <button type="submit" style={styles.sendBtn}>
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Ticket */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Create Student Support Ticket</h3>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Student Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samuel Kipchumba"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="07..."
                    value={newStudentPhone}
                    onChange={(e) => setNewStudentPhone(e.target.value)}
                    style={styles.input}
                  />
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    style={styles.select}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Issue Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={styles.select}
                >
                  {Object.entries(CATEGORIES).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Complaint / Inquiry Description *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe the student's problem in detail..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Creating..." : "Open Ticket"}
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
    gap: 6,
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
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    borderRadius: 8,
  },
  searchInput: {
    border: "none",
    outline: "none",
    padding: "9px 0",
    fontSize: 13,
    width: "100%",
  },
  filterSelect: {
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 13,
    outline: "none",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    border: "1px solid #E5E7EB",
    overflow: "hidden",
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
    padding: "12px",
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
  ticketPill: {
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: "#F3F4F6",
    color: "#374151",
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
  },
  subtext: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "uppercase",
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
    textTransform: "capitalize",
  },
  viewBtn: {
    backgroundColor: "#F3F4F6",
    border: "1px solid #E5E7EB",
    padding: "5px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "#1F2937",
    cursor: "pointer",
  },
  drawerOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 100,
    display: "flex",
    justifyContent: "flex-end",
  },
  drawerContent: {
    width: "100%",
    maxWidth: 540,
    height: "100%",
    backgroundColor: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
    padding: 24,
    boxShadow: "-10px 0 25px rgba(0,0,0,0.1)",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    borderBottom: "1px solid #E5E7EB",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#111827",
    margin: "6px 0 2px 0",
  },
  drawerSub: {
    fontSize: 12,
    color: "#6B7280",
  },
  statusActionRow: {
    display: "flex",
    gap: 8,
    padding: "12px 0",
    borderBottom: "1px solid #F3F4F6",
  },
  actionPill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  ticketDescBox: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    border: "1px solid #E5E7EB",
  },
  descLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  descText: {
    fontSize: 13,
    color: "#374151",
    margin: "4px 0 0 0",
    lineHeight: 1.5,
  },
  threadContainer: {
    flex: 1,
    overflowY: "auto",
    marginTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  threadHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#1F2937",
  },
  threadMessages: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  messageBox: {
    padding: 12,
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  messageSenderRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  },
  internalBadge: {
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "#FDE68A",
    color: "#92400E",
    padding: "1px 5px",
    borderRadius: 4,
  },
  msgTime: {
    fontSize: 10,
    color: "#9CA3AF",
    marginLeft: "auto",
  },
  messageText: {
    fontSize: 13,
    color: "#374151",
    margin: 0,
    lineHeight: 1.4,
  },
  emptyMessages: {
    padding: 24,
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 12,
  },
  replyForm: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  replyOptionRow: {
    display: "flex",
    alignItems: "center",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#4B5563",
    cursor: "pointer",
  },
  replyInputRow: {
    display: "flex",
    gap: 8,
  },
  replyInput: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    fontSize: 13,
    outline: "none",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    border: "none",
    backgroundColor: "#059669",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
