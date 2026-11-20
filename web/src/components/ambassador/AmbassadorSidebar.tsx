import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  UserPlus,
  Megaphone,
  Building2,
  UtensilsCrossed,
  Headphones,
  Users2,
  Rocket,
  CheckSquare,
  FileText,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  GraduationCap,
  Shield,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { UniversityItem } from "../../services/ambassadorApi";
import logo from "../../assets/mealvest-logo.png";

export interface AmbassadorSidebarProps {
  currentUniversity?: UniversityItem | null;
  universities?: UniversityItem[];
  onSelectUniversity?: (uni: UniversityItem) => void;
  isCentralAdmin?: boolean;
}

const NAV_ITEMS = [
  { to: "/ambassador/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/ambassador/analytics", label: "University Analytics", icon: BarChart3 },
  { to: "/ambassador/acquisition", label: "Student Acquisition", icon: UserPlus },
  { to: "/ambassador/marketing", label: "Digital Marketing", icon: Megaphone },
  { to: "/ambassador/hotels", label: "Hotel Partnerships", icon: Building2 },
  { to: "/ambassador/hotel-performance", label: "Hotel Performance", icon: UtensilsCrossed },
  { to: "/ambassador/customer-care", label: "Customer Care", icon: Headphones },
  { to: "/ambassador/team", label: "Team Management", icon: Users2 },
  { to: "/ambassador/campaigns", label: "Campaign Management", icon: Rocket },
  { to: "/ambassador/tasks", label: "Tasks & Activities", icon: CheckSquare },
  { to: "/ambassador/reports", label: "Reports", icon: FileText },
  { to: "/ambassador/announcements", label: "Announcements", icon: Bell },
  { to: "/ambassador/settings", label: "Settings", icon: Settings },
];

export function AmbassadorSidebar({
  currentUniversity,
  universities = [],
  onSelectUniversity,
  isCentralAdmin = false,
}: AmbassadorSidebarProps) {
  const { user, logout } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < 900;
  const [collapsed, setCollapsed] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  const sidebarWidth = collapsed ? 76 : 260;

  if (isMobile) {
    return (
      <div style={styles.mobileNav}>
        {NAV_ITEMS.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              ...styles.mobileNavItem,
              color: isActive ? "#059669" : "#6B7280",
              fontWeight: isActive ? 600 : 500,
            })}
          >
            <Icon size={20} />
            <span style={styles.mobileNavLabel}>{label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <aside
      style={{
        ...styles.sidebar,
        width: sidebarWidth,
        transition: "width 0.2s ease-in-out",
      }}
    >
      {/* Brand Header */}
      <div style={styles.header}>
        <div style={styles.brandRow}>
          <img src={logo} alt="MealVest" style={styles.logo} />
          {!collapsed && (
            <div style={styles.brandInfo}>
              <span style={styles.brandTitle}>MEALVEST</span>
              <span style={styles.brandTag}>Ambassador HQ</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={styles.collapseBtn}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label="Toggle sidebar width"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* University Selector Box */}
      {!collapsed && (
        <div style={styles.uniSelectorContainer}>
          <div style={styles.uniSelectorLabel}>Assigned Institution</div>
          <div
            style={styles.uniSelectorBox}
            onClick={() => isCentralAdmin && setShowSelector(!showSelector)}
            title={isCentralAdmin ? "Switch university (Central Admin)" : "Assigned Branch"}
          >
            <GraduationCap size={18} color="#059669" style={{ flexShrink: 0 }} />
            <span style={styles.uniNameText}>{currentUniversity?.name || "Maseno University"}</span>
            {isCentralAdmin && (
              <span style={styles.adminBadge} title="Central Admin Multi-Access">
                Admin
              </span>
            )}
          </div>

          {isCentralAdmin && showSelector && universities.length > 0 && (
            <div style={styles.uniDropdown}>
              <div style={styles.dropdownHeader}>Select University:</div>
              {universities.map((uni) => (
                <button
                  key={uni.id}
                  onClick={() => {
                    onSelectUniversity?.(uni);
                    setShowSelector(false);
                  }}
                  style={{
                    ...styles.uniDropdownItem,
                    backgroundColor: currentUniversity?.id === uni.id ? "#ECFDF5" : "transparent",
                    color: currentUniversity?.id === uni.id ? "#065F46" : "#374151",
                  }}
                >
                  <GraduationCap size={15} />
                  <span>{uni.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation List */}
      <nav style={styles.navScroll}>
        <div style={styles.navGroup}>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                ...styles.navItem,
                backgroundColor: isActive ? "#ECFDF5" : "transparent",
                color: isActive ? "#047857" : "#4B5563",
                fontWeight: isActive ? 600 : 500,
                borderLeft: isActive ? "3px solid #10B981" : "3px solid transparent",
                justifyContent: collapsed ? "center" : "flex-start",
                paddingLeft: collapsed ? 0 : 16,
              })}
              title={collapsed ? label : undefined}
            >
              <Icon size={19} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={styles.navLabel}>{label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User Footer */}
      <div style={styles.footer}>
        {!collapsed && (
          <div style={styles.userRow}>
            <div style={styles.avatarCircle}>
              {(user?.fullName || "A")[0].toUpperCase()}
            </div>
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user?.fullName || "Ambassador"}</span>
              <span style={styles.userRole}>
                {user?.role === "mealvest_admin" ? "Central Admin" : "University Ambassador"}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={() => logout()}
          style={{
            ...styles.logoutBtn,
            justifyContent: collapsed ? "center" : "flex-start",
          }}
          title="Sign out"
        >
          <LogOut size={16} color="#DC2626" />
          {!collapsed && <span style={styles.logoutText}>Log out</span>}
        </button>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    backgroundColor: "#FFFFFF",
    borderRight: "1px solid #E5E7EB",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px",
    borderBottom: "1px solid #F3F4F6",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    objectFit: "contain",
  },
  brandInfo: {
    display: "flex",
    flexDirection: "column",
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#111827",
    letterSpacing: "0.05em",
  },
  brandTag: {
    fontSize: 11,
    color: "#059669",
    fontWeight: 600,
  },
  collapseBtn: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#6B7280",
  },
  uniSelectorContainer: {
    position: "relative",
    padding: "12px 14px",
    borderBottom: "1px solid #F3F4F6",
    backgroundColor: "#F9FAFB",
  },
  uniSelectorLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#6B7280",
    marginBottom: 4,
  },
  uniSelectorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    border: "1px solid #D1D5DB",
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
  },
  uniNameText: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1F2937",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  adminBadge: {
    fontSize: 10,
    fontWeight: 700,
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    padding: "2px 6px",
    borderRadius: 4,
  },
  uniDropdown: {
    position: "absolute",
    top: "100%",
    left: 14,
    right: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
    border: "1px solid #E5E7EB",
    zIndex: 100,
    maxHeight: 220,
    overflowY: "auto",
    padding: "6px 0",
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: 600,
    color: "#9CA3AF",
    padding: "6px 12px",
  },
  uniDropdownItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    border: "none",
    textAlign: "left",
    cursor: "pointer",
  },
  navScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "10px 0",
  },
  navGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: 40,
    textDecoration: "none",
    fontSize: 13,
    transition: "background-color 0.15s ease",
  },
  navLabel: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  footer: {
    padding: 12,
    borderTop: "1px solid #F3F4F6",
    backgroundColor: "#FAFAFA",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 14,
  },
  userInfo: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
  userRole: {
    fontSize: 11,
    color: "#6B7280",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    color: "#DC2626",
    fontWeight: 500,
  },
  logoutText: {
    fontSize: 13,
    color: "#DC2626",
  },
  mobileNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "#FFFFFF",
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 90,
  },
  mobileNavItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    textDecoration: "none",
    fontSize: 10,
  },
  mobileNavLabel: {
    fontSize: 10,
  },
};
