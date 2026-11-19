import React from "react";
import { Shield, Building2, User, Key, CheckCircle, Info } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAmbassador } from "../../components/ambassador/AmbassadorShell";

export default function AmbassadorSettingsScreen() {
  const { user } = useAuth();
  const { currentUniversity, scope } = useAmbassador();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Branch Settings & Security</h1>
          <p style={styles.subtitle}>
            Branch operational parameters, ambassador credential status & role-based permissions
          </p>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <Building2 size={20} color="#059669" />
          <h2 style={styles.cardHeading}>University Branch Information</h2>
        </div>

        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Assigned University</span>
            <span style={styles.infoVal}>{currentUniversity?.name || "Maseno University"}</span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Branch Slug / Code</span>
            <span style={styles.infoVal}>{currentUniversity?.slug?.toUpperCase() || "MASENO"}</span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>County & Campus Town</span>
            <span style={styles.infoVal}>
              {currentUniversity?.county || "Kisumu"}, {currentUniversity?.town || "Maseno"}
            </span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Branch Operational Status</span>
            <span style={{ ...styles.infoVal, color: "#059669", fontWeight: 700 }}>Active Branch</span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <User size={20} color="#2563EB" />
          <h2 style={styles.cardHeading}>Ambassador Identity & Role Scope</h2>
        </div>

        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Full Name</span>
            <span style={styles.infoVal}>{user?.fullName || "University Ambassador"}</span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Official Email</span>
            <span style={styles.infoVal}>{user?.email}</span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Platform Role</span>
            <span style={{ ...styles.infoVal, textTransform: "capitalize" }}>
              {user?.role?.replace(/_/g, " ")}
            </span>
          </div>

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Authorization Scope</span>
            <span style={styles.infoVal}>
              {scope?.isCentralAdmin ? "Central Administration (All Universities)" : "Assigned Branch Only"}
            </span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <Shield size={20} color="#7C3AED" />
          <h2 style={styles.cardHeading}>Access Control & Security Principles</h2>
        </div>

        <div style={styles.securityList}>
          <div style={styles.secItem}>
            <CheckCircle size={16} color="#059669" />
            <div>
              <strong>Strict Backend Authorization:</strong> Cross-university data isolation is enforced at the database
              query layer. Modifying request parameters will reject with 403 Forbidden.
            </div>
          </div>

          <div style={styles.secItem}>
            <CheckCircle size={16} color="#059669" />
            <div>
              <strong>Department Permission Scoping:</strong> Marketers, hotel leads, and support agents operate inside
              their assigned functional departments.
            </div>
          </div>

          <div style={styles.secItem}>
            <CheckCircle size={16} color="#059669" />
            <div>
              <strong>Operational Auditing:</strong> Administrative actions, team invites, and stage transitions are logged
              in real-time activity logs.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 960,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  infoVal: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
  },
  securityList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontSize: 13,
    color: "#374151",
    lineHeight: 1.5,
  },
  secItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
};
