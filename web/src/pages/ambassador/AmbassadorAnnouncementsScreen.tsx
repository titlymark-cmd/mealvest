import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Plus,
  Pin,
  AlertCircle,
  Clock,
  Send,
  X,
  Megaphone,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchAnnouncements,
  createAnnouncement,
  UniversityAnnouncement,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorAnnouncementsScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<UniversityAnnouncement[]>([]);

  // Create Modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState<"university" | "team" | "operational">("university");
  const [targetDepartment, setTargetDepartment] = useState("all");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchAnnouncements(authFetch, currentUniversity.id);
      setAnnouncements(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !title.trim() || !content.trim()) return;
    try {
      setSubmitting(true);
      await createAnnouncement(authFetch, {
        universityId: currentUniversity.id,
        targetType,
        targetDepartment,
        title: title.trim(),
        content: content.trim(),
        priority,
        isPinned,
      });
      setShowModal(false);
      setTitle("");
      setContent("");
      setIsPinned(false);
      await loadAnnouncements();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to publish notice.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && announcements.length === 0) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading communication centre...</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Communication & Announcements</h1>
          <p style={styles.subtitle}>
            Central MealVest circulars, campus operational directives & internal team notices
          </p>
        </div>

        <button onClick={() => setShowModal(true)} style={styles.createBtn}>
          <Plus size={16} />
          <span>Publish Notice</span>
        </button>
      </div>

      <div style={styles.announcementsList}>
        {announcements.length === 0 ? (
          <div style={styles.emptyCard}>
            <Bell size={32} color="#9CA3AF" />
            <p>No announcements published for {currentUniversity?.name} yet.</p>
          </div>
        ) : (
          announcements.map((a) => (
            <div
              key={a.id}
              style={{
                ...styles.announcementCard,
                borderColor: a.is_pinned ? "#10B981" : "#E5E7EB",
                backgroundColor: a.priority === "urgent" ? "#FFFBEB" : "#FFFFFF",
              }}
            >
              <div style={styles.announcementTop}>
                <div style={styles.tagRow}>
                  {a.is_pinned && (
                    <span style={styles.pinnedBadge}>
                      <Pin size={11} />
                      <span>PINNED</span>
                    </span>
                  )}
                  <span
                    style={{
                      ...styles.priorityTag,
                      backgroundColor:
                        a.priority === "urgent" ? "#FEF2F2" : a.priority === "important" ? "#FFF7ED" : "#F3F4F6",
                      color:
                        a.priority === "urgent" ? "#DC2626" : a.priority === "important" ? "#C2410C" : "#4B5563",
                    }}
                  >
                    {a.priority.toUpperCase()}
                  </span>
                  <span style={styles.targetBadge}>
                    {a.target_type === "central" ? "CENTRAL DIRECTIVE" : a.target_department.toUpperCase()}
                  </span>
                </div>

                <span style={styles.announcementTime}>
                  {new Date(a.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <h3 style={styles.announcementTitle}>{a.title}</h3>
              <p style={styles.announcementContent}>{a.content}</p>

              <div style={styles.announcementFooter}>
                <span style={styles.authorText}>Author: {a.author_name}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Publish Notice */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Publish University Notice</h3>
              <button onClick={() => setShowModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Notice Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mandatory Ambassador Team Alignment Meeting"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldRow}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Target Department</label>
                  <select
                    value={targetDepartment}
                    onChange={(e) => setTargetDepartment(e.target.value)}
                    style={styles.select}
                  >
                    <option value="all">All Departments</option>
                    <option value="marketing">Digital Marketing</option>
                    <option value="hotels">Hotel Partnerships</option>
                    <option value="customer_care">Customer Care</option>
                  </select>
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    style={styles.select}
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Notice Content *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type operational notice message..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.checkboxRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                  />
                  <span>Pin this announcement to top of dashboard</span>
                </label>
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Publishing..." : "Publish Notice"}
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
    maxWidth: 1000,
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
  announcementsList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  announcementCard: {
    borderRadius: 12,
    padding: 20,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  announcementTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  pinnedBadge: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    fontWeight: 800,
    backgroundColor: "#ECFDF5",
    color: "#059669",
    padding: "2px 6px",
    borderRadius: 4,
  },
  priorityTag: {
    fontSize: 9,
    fontWeight: 800,
    padding: "2px 6px",
    borderRadius: 4,
  },
  targetBadge: {
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "#F3F4F6",
    color: "#4B5563",
    padding: "2px 6px",
    borderRadius: 4,
  },
  announcementTime: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  announcementContent: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 1.5,
    margin: 0,
  },
  announcementFooter: {
    paddingTop: 8,
    borderTop: "1px solid #F3F4F6",
    display: "flex",
    justifyContent: "space-between",
  },
  authorText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: 500,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 40,
    textAlign: "center",
    color: "#9CA3AF",
    border: "1px dashed #D1D5DB",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
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
  checkboxRow: {
    display: "flex",
    alignItems: "center",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
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
