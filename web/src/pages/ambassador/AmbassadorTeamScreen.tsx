import React, { useEffect, useState, useCallback } from "react";
import {
  Users2,
  UserPlus,
  Shield,
  Award,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  ChevronDown,
  X,
  Briefcase,
  Layers,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchTeamData,
  addTeamMember,
  updateTeamMember,
  TeamManagementData,
  TeamMember,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorTeamScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<TeamManagementData | null>(null);

  // Add Member Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState<"marketing" | "hotels" | "customer_care">("marketing");
  const [roleTitle, setRoleTitle] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchTeamData(authFetch, currentUniversity.id);
      setTeamData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !name.trim() || !email.trim() || !roleTitle.trim()) return;
    try {
      setSubmitting(true);
      await addTeamMember(authFetch, {
        universityId: currentUniversity.id,
        fullName: name.trim(),
        email: email.trim(),
        phoneNumber: phone.trim() || undefined,
        department,
        roleTitle: roleTitle.trim(),
        responsibilities: responsibilities.trim() || undefined,
      });
      setShowAddModal(false);
      setName("");
      setEmail("");
      setPhone("");
      setRoleTitle("");
      setResponsibilities("");
      await loadTeam();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to add team member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const nextStatus = member.status === "active" ? "suspended" : "active";
    if (!window.confirm(`Are you sure you want to ${nextStatus === "suspended" ? "suspend" : "activate"} ${member.fullName}?`)) {
      return;
    }
    try {
      await updateTeamMember(
        authFetch,
        member.id,
        { status: nextStatus },
        currentUniversity?.id
      );
      await loadTeam();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update member status.");
    }
  };

  if (loading && !teamData) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading team hierarchy...</span>
      </div>
    );
  }

  if (!teamData) return null;

  const { ambassador, departments, allMembers } = teamData;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Team Management & Organization</h1>
          <p style={styles.subtitle}>
            Branch leadership, 4 operational departments, role assignments & performance scores
          </p>
        </div>

        <button onClick={() => setShowAddModal(true)} style={styles.addBtn}>
          <UserPlus size={16} />
          <span>Add Team Member</span>
        </button>
      </div>

      {/* Organizational Hierarchy Chart (Spec Section 9) */}
      <div style={styles.orgChartCard}>
        <div style={styles.orgChartHeader}>
          <Layers size={18} color="#059669" />
          <h2 style={styles.cardHeading}>Campus Branch Organizational Hierarchy</h2>
        </div>

        {/* Level 1: University Ambassador */}
        <div style={styles.orgAmbassadorLevel}>
          <div style={styles.ambassadorCard}>
            <div style={styles.ambAvatar}>
              {(ambassador?.full_name || "A")[0].toUpperCase()}
            </div>
            <div>
              <span style={styles.ambTitle}>Branch Team Leader</span>
              <h3 style={styles.ambName}>{ambassador?.full_name || "University Ambassador"}</h3>
              <span style={styles.ambContact}>{ambassador?.email}</span>
            </div>
          </div>
        </div>

        {/* Connecting Line */}
        <div style={styles.orgLineDown} />

        {/* Level 2: 3 Subordinate Functional Departments */}
        <div style={styles.orgDeptsRow}>
          {departments
            .filter((d) => d.id !== "leadership")
            .map((dept) => (
              <div key={dept.id} style={styles.orgDeptColumn}>
                <div style={styles.orgDeptHeader}>
                  <h4 style={styles.orgDeptTitle}>{dept.name}</h4>
                  <span style={styles.orgDeptCount}>{dept.members.length} members</span>
                </div>
                <div style={styles.orgDeptMemberList}>
                  {dept.members.length === 0 ? (
                    <div style={styles.emptyMemberSlot}>No members assigned</div>
                  ) : (
                    dept.members.map((m) => (
                      <div key={m.id} style={styles.orgMemberChip}>
                        <div style={styles.miniAvatar}>{m.fullName[0]}</div>
                        <div style={styles.chipInfo}>
                          <span style={styles.chipName}>{m.fullName}</span>
                          <span style={styles.chipRole}>{m.roleTitle}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Full Team Roster by Department */}
      <div style={styles.rosterSection}>
        <h2 style={styles.cardHeading}>Department Roster & Member Details ({allMembers.length})</h2>

        <div style={styles.memberGrid}>
          {allMembers.map((member) => (
            <div
              key={member.id}
              style={{
                ...styles.memberCard,
                opacity: member.status === "suspended" ? 0.6 : 1,
              }}
            >
              <div style={styles.memberCardTop}>
                <div style={styles.memberAvatar}>
                  {member.fullName[0].toUpperCase()}
                </div>
                <div style={styles.memberMainInfo}>
                  <h3 style={styles.memberName}>{member.fullName}</h3>
                  <span style={styles.memberRoleBadge}>{member.roleTitle}</span>
                  <span style={styles.memberDeptName}>{member.department.replace(/_/g, " ").toUpperCase()}</span>
                </div>
                <div style={styles.scorePill}>
                  <span style={styles.scoreNumber}>{member.performanceScore}</span>
                  <span style={styles.scoreText}>Score</span>
                </div>
              </div>

              {member.responsibilities && (
                <p style={styles.memberResp}>{member.responsibilities}</p>
              )}

              <div style={styles.memberContactRow}>
                <div style={styles.contactItem}>
                  <Mail size={12} color="#6B7280" />
                  <span>{member.email}</span>
                </div>
                {member.phone && (
                  <div style={styles.contactItem}>
                    <Phone size={12} color="#6B7280" />
                    <span>{member.phone}</span>
                  </div>
                )}
              </div>

              <div style={styles.memberCardFooter}>
                <span
                  style={{
                    ...styles.statusTag,
                    backgroundColor: member.status === "active" ? "#ECFDF5" : "#FEF2F2",
                    color: member.status === "active" ? "#059669" : "#DC2626",
                  }}
                >
                  {member.status}
                </span>

                <button
                  onClick={() => handleToggleStatus(member)}
                  style={{
                    ...styles.toggleBtn,
                    color: member.status === "active" ? "#DC2626" : "#059669",
                  }}
                >
                  {member.status === "active" ? "Suspend Account" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Add Team Member */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add University Team Member</h3>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMember} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dennis Kipchumba"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="dennis@..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as any)}
                    style={styles.select}
                  >
                    <option value="marketing">Digital Marketing</option>
                    <option value="hotels">Hotel Partnerships</option>
                    <option value="customer_care">Customer Care</option>
                  </select>
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Role Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Social Media Lead"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Assigned Responsibilities</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Runs campus TikTok updates and coordinates WhatsApp class groups..."
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowAddModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Adding..." : "Confirm & Add"}
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
  addBtn: {
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
  orgChartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  orgChartHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    width: "100%",
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  orgAmbassadorLevel: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
  },
  ambassadorCard: {
    backgroundColor: "#ECFDF5",
    border: "2px solid #10B981",
    borderRadius: 12,
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
  },
  ambAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#059669",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 800,
  },
  ambTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#059669",
    textTransform: "uppercase",
  },
  ambName: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111827",
    margin: "2px 0",
  },
  ambContact: {
    fontSize: 12,
    color: "#4B5563",
  },
  orgLineDown: {
    width: 2,
    height: 30,
    backgroundColor: "#D1D5DB",
    margin: "8px 0",
  },
  orgDeptsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    width: "100%",
  },
  orgDeptColumn: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    border: "1px solid #E5E7EB",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  orgDeptHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #E5E7EB",
    paddingBottom: 8,
  },
  orgDeptTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1F2937",
    margin: 0,
  },
  orgDeptCount: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6B7280",
  },
  orgDeptMemberList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  emptyMemberSlot: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    padding: 12,
  },
  orgMemberChip: {
    backgroundColor: "#FFFFFF",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    color: "#374151",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  chipInfo: {
    display: "flex",
    flexDirection: "column",
  },
  chipName: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
  },
  chipRole: {
    fontSize: 10,
    color: "#6B7280",
  },
  rosterSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  memberGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
  },
  memberCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  memberCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    color: "#1F2937",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  memberMainInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  memberRoleBadge: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: 600,
  },
  memberDeptName: {
    fontSize: 9,
    color: "#059669",
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  scorePill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111827",
  },
  scoreText: {
    fontSize: 9,
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  memberResp: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 1.4,
    margin: 0,
  },
  memberContactRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 8,
    borderTop: "1px solid #F3F4F6",
  },
  contactItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "#6B7280",
  },
  memberCardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTop: "1px solid #F3F4F6",
  },
  statusTag: {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "uppercase",
  },
  toggleBtn: {
    background: "transparent",
    border: "none",
    fontSize: 12,
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
