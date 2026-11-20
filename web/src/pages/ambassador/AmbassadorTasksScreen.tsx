import React, { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  User,
  Filter,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";
import {
  fetchTasksData,
  createTeamTask,
  updateTeamTask,
  TasksData,
  TeamTask,
} from "../../services/ambassadorApi";
import { Spinner } from "../../components/Spinner";

export default function AmbassadorTasksScreen() {
  const { authFetch } = useAuth();
  const { currentUniversity } = useAmbassador();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TasksData | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "my" | "overdue" | "completed">("all");

  // Create Task Modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState<"leadership" | "marketing" | "hotels" | "customer_care">("marketing");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!currentUniversity) return;
    try {
      setLoading(true);
      const res = await fetchTasksData(authFetch, currentUniversity.id);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [authFetch, currentUniversity]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUniversity || !title.trim()) return;
    try {
      setSubmitting(true);
      await createTeamTask(authFetch, {
        universityId: currentUniversity.id,
        title: title.trim(),
        description: description.trim() || undefined,
        department,
        priority,
        deadline: deadline || undefined,
      });
      setShowModal(false);
      setTitle("");
      setDescription("");
      setDeadline("");
      await loadTasks();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (task: TeamTask, status: string) => {
    try {
      await updateTeamTask(authFetch, task.id, { status }, currentUniversity?.id);
      await loadTasks();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update task.");
    }
  };

  if (loading && !data) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={{ fontSize: 14, color: "#4B5563" }}>Loading tasks & activities...</span>
      </div>
    );
  }

  if (!data) return null;

  const { summary, allTasks, myTasks, overdueTasks, completedTasks } = data;

  let displayedTasks = allTasks;
  if (activeFilter === "my") displayedTasks = myTasks;
  else if (activeFilter === "overdue") displayedTasks = overdueTasks;
  else if (activeFilter === "completed") displayedTasks = completedTasks;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Tasks & Activities</h1>
          <p style={styles.subtitle}>
            Branch operational assignments, deadlines, progress tracking & completion evidence
          </p>
        </div>

        <button onClick={() => setShowModal(true)} style={styles.createBtn}>
          <Plus size={16} />
          <span>Assign Task</span>
        </button>
      </div>

      {/* Summary KPI Badges */}
      <div style={styles.summaryBar}>
        <button
          onClick={() => setActiveFilter("all")}
          style={{
            ...styles.summaryPill,
            backgroundColor: activeFilter === "all" ? "#111827" : "#FFFFFF",
            color: activeFilter === "all" ? "#FFFFFF" : "#374151",
          }}
        >
          <span>All Tasks ({summary.total})</span>
        </button>

        <button
          onClick={() => setActiveFilter("my")}
          style={{
            ...styles.summaryPill,
            backgroundColor: activeFilter === "my" ? "#111827" : "#FFFFFF",
            color: activeFilter === "my" ? "#FFFFFF" : "#374151",
          }}
        >
          <span>My Tasks ({summary.myCount})</span>
        </button>

        <button
          onClick={() => setActiveFilter("overdue")}
          style={{
            ...styles.summaryPill,
            backgroundColor: activeFilter === "overdue" ? "#111827" : "#FFFFFF",
            color: activeFilter === "overdue" ? "#FFFFFF" : "#374151",
          }}
        >
          <span style={{ color: activeFilter === "overdue" ? "#FFFFFF" : "#DC2626" }}>
            Overdue ({summary.overdueCount})
          </span>
        </button>

        <button
          onClick={() => setActiveFilter("completed")}
          style={{
            ...styles.summaryPill,
            backgroundColor: activeFilter === "completed" ? "#111827" : "#FFFFFF",
            color: activeFilter === "completed" ? "#FFFFFF" : "#374151",
          }}
        >
          <span style={{ color: activeFilter === "completed" ? "#FFFFFF" : "#059669" }}>
            Completed ({summary.completedCount})
          </span>
        </button>
      </div>

      {/* Tasks List */}
      <div style={styles.taskList}>
        {displayedTasks.length === 0 ? (
          <div style={styles.emptyCard}>
            <CheckCircle2 size={32} color="#9CA3AF" />
            <p>No tasks found under the selected view.</p>
          </div>
        ) : (
          displayedTasks.map((t) => (
            <div key={t.id} style={styles.taskCard}>
              <div style={styles.taskCardMain}>
                <div style={styles.taskTop}>
                  <span style={styles.deptBadge}>{t.department.toUpperCase()}</span>
                  <span
                    style={{
                      ...styles.priorityBadge,
                      backgroundColor: t.priority === "urgent" || t.priority === "high" ? "#FEF2F2" : "#F3F4F6",
                      color: t.priority === "urgent" || t.priority === "high" ? "#DC2626" : "#4B5563",
                    }}
                  >
                    {t.priority}
                  </span>
                  {t.deadline && (
                    <span style={styles.taskDeadline}>
                      <Clock size={12} style={{ marginRight: 4 }} />
                      Due {new Date(t.deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <h3 style={styles.taskTitle}>{t.title}</h3>
                {t.description && <p style={styles.taskDesc}>{t.description}</p>}

                {t.assignedToName && (
                  <span style={styles.assignee}>Assigned to: {t.assignedToName}</span>
                )}
              </div>

              <div style={styles.taskActions}>
                <select
                  value={t.status}
                  onChange={(e) => handleUpdateStatus(t, e.target.value)}
                  style={{
                    ...styles.statusSelect,
                    backgroundColor: t.status === "completed" ? "#ECFDF5" : "#F9FAFB",
                    color: t.status === "completed" ? "#059669" : "#374151",
                  }}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="under_review">Under Review</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Create Task */}
      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Assign Operational Task</h3>
              <button onClick={() => setShowModal(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={styles.form}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distribute 200 QR promo flyers at Mess Hall"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={styles.input}
                />
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
                    <option value="leadership">Leadership</option>
                  </select>
                </div>

                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
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
                <label style={styles.label}>Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Task Instructions & Completion Evidence Required</label>
                <textarea
                  rows={3}
                  placeholder="Detail what done looks like (e.g. upload photo of banner set up)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ ...styles.input, resize: "vertical" }}
                />
              </div>

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Assigning..." : "Assign Task"}
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
    gap: 20,
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
  summaryBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryPill: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  taskCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    border: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  taskCardMain: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
  },
  taskTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  deptBadge: {
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "#F3F4F6",
    color: "#4B5563",
    padding: "2px 6px",
    borderRadius: 4,
  },
  priorityBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    textTransform: "uppercase",
  },
  taskDeadline: {
    fontSize: 11,
    color: "#9CA3AF",
    display: "flex",
    alignItems: "center",
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    margin: "4px 0 0 0",
  },
  taskDesc: {
    fontSize: 12,
    color: "#4B5563",
    margin: 0,
    lineHeight: 1.4,
  },
  assignee: {
    fontSize: 11,
    color: "#059669",
    fontWeight: 600,
    marginTop: 4,
  },
  taskActions: {
    display: "flex",
    alignItems: "center",
  },
  statusSelect: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #D1D5DB",
    fontSize: 12,
    fontWeight: 600,
    outline: "none",
    cursor: "pointer",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 32,
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
