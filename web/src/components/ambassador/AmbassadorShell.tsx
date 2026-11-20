import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AmbassadorSidebar } from "./AmbassadorSidebar";
import { NotificationBell } from "../notifications/NotificationBell";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import {
  fetchAmbassadorMe,
  AmbassadorScope,
  UniversityItem,
} from "../../services/ambassadorApi";
import { Spinner } from "../Spinner";
import { ShieldCheck, GraduationCap, Building2 } from "lucide-react";

interface AmbassadorContextValue {
  scope: AmbassadorScope | null;
  currentUniversity: UniversityItem | null;
  universities: UniversityItem[];
  setCurrentUniversity: (uni: UniversityItem) => void;
  refreshScope: () => Promise<void>;
  loading: boolean;
}

const AmbassadorContext = createContext<AmbassadorContextValue | null>(null);

export function useAmbassador() {
  const ctx = useContext(AmbassadorContext);
  if (!ctx) {
    throw new Error("useAmbassador must be used within an AmbassadorShell");
  }
  return ctx;
}

export function AmbassadorShell({ children }: { children: React.ReactNode }) {
  const { authFetch, user } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < 900;

  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<AmbassadorScope | null>(null);
  const [universities, setUniversities] = useState<UniversityItem[]>([]);
  const [currentUniversity, setCurrentUniversity] = useState<UniversityItem | null>(null);

  const loadData = useCallback(async (selectedId?: string) => {
    try {
      setLoading(true);
      const res = await fetchAmbassadorMe(authFetch, selectedId);
      setScope(res.scope);
      setUniversities(res.universities);
      if (res.universities.length > 0) {
        const matching = res.universities.find((u) => u.id === res.scope.universityId) || res.universities[0];
        setCurrentUniversity(matching);
      }
    } catch (err) {
      console.error("[ambassador] failed to load scope:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectUniversity = (uni: UniversityItem) => {
    setCurrentUniversity(uni);
    loadData(uni.id);
  };

  const contextValue: AmbassadorContextValue = {
    scope,
    currentUniversity,
    universities,
    setCurrentUniversity: handleSelectUniversity,
    refreshScope: () => loadData(currentUniversity?.id),
    loading,
  };

  if (loading && !scope) {
    return (
      <div style={styles.loadingContainer}>
        <Spinner size="large" color="#059669" />
        <span style={styles.loadingText}>Loading University Command Centre...</span>
      </div>
    );
  }

  const isCentralAdmin = user?.role === "mealvest_admin";

  return (
    <AmbassadorContext.Provider value={contextValue}>
      <div style={styles.layout}>
        <AmbassadorSidebar
          currentUniversity={currentUniversity}
          universities={universities}
          onSelectUniversity={handleSelectUniversity}
          isCentralAdmin={isCentralAdmin}
        />

        {/* Top Header Bar */}
        <header
          style={{
            ...styles.topBar,
            left: isMobile ? 0 : 260,
          }}
        >
          <div style={styles.topBarLeft}>
            <div style={styles.branchPill}>
              <GraduationCap size={16} color="#059669" />
              <span style={styles.branchName}>
                {currentUniversity?.name || "Maseno University Branch"}
              </span>
            </div>
            {scope?.department && (
              <span style={styles.deptBadge}>
                {scope.department.toUpperCase()} TEAM
              </span>
            )}
          </div>

          <div style={styles.topBarRight}>
            {isCentralAdmin && (
              <Link
                to="/admin/universities"
                style={styles.adminComparisonLink}
                title="View National Comparison of All Universities"
              >
                <Building2 size={16} />
                <span>All Universities</span>
              </Link>
            )}

            <Link
              to="/ambassador/settings"
              style={styles.iconButton}
              title="Branch Security & Settings"
              aria-label="Settings"
            >
              <ShieldCheck size={18} color="#4B5563" />
            </Link>

            <NotificationBell />
          </div>
        </header>

        {/* Content Pane */}
        <main
          style={{
            ...styles.mainContent,
            marginLeft: isMobile ? 0 : 260,
            paddingBottom: isMobile ? 80 : 32,
          }}
        >
          {children}
        </main>
      </div>
    </AmbassadorContext.Provider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    width: "100%",
    height: "100%",
    minHeight: "100vh",
    backgroundColor: "#F8FAFC",
    color: "#111827",
    display: "flex",
    position: "relative",
  },
  loadingContainer: {
    width: "100%",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#4B5563",
    fontWeight: 500,
  },
  topBar: {
    position: "fixed",
    top: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid #E5E7EB",
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
  },
  topBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  branchPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    padding: "6px 12px",
    borderRadius: 20,
    border: "1px solid #A7F3D0",
  },
  branchName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#065F46",
  },
  deptBadge: {
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: "#EFF6FF",
    color: "#1D4ED8",
    padding: "4px 8px",
    borderRadius: 6,
    letterSpacing: "0.04em",
  },
  topBarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  adminComparisonLink: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1F2937",
    color: "#FFFFFF",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #E5E7EB",
    cursor: "pointer",
    textDecoration: "none",
  },
  mainContent: {
    flex: 1,
    marginTop: 60,
    padding: "24px",
    overflowY: "auto",
    maxWidth: "100%",
  },
};
