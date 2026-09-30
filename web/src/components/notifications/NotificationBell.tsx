import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bell, Check } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from "../../services/notificationsApi";
import { onForegroundPush } from "../../services/pushNotifications";

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/**
 * Bell + unread badge + dropdown panel — the in-app notification
 * center. Self-contained (fetches its own data, manages its own open
 * state) so any dashboard shell can drop it in without wiring.
 * Deep-links use react-router's normal `navigate`-adjacent pattern via
 * a plain location change, since a notification click here is already
 * inside the app (not the service worker's cross-context click
 * handler, which uses the Clients API instead).
 */
export function NotificationBell() {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(() => {
    fetchUnreadCount(authFetch)
      .then(setUnreadCount)
      .catch(() => {});
  }, [authFetch]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 60000);
    let unsubscribe: (() => void) | undefined;
    onForegroundPush(refreshCount).then((fn) => {
      unsubscribe = fn;
    });
    return () => {
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [refreshCount]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      fetchNotifications(authFetch)
        .then(setItems)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.read) {
      await markNotificationRead(authFetch, item.id).catch(() => {});
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      refreshCount();
    }
    if (item.deep_link) window.location.href = item.deep_link;
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(authFetch).catch(() => {});
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnreadCount(0);
  };

  return (
    <div ref={containerRef} style={styles.wrap}>
      <button onClick={toggleOpen} style={styles.bellBtn} aria-label="Notifications">
        <Bell size={18} color={COLORS.textOnDark} />
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={styles.markAllBtn}>
                <Check size={12} color={COLORS.primary} />
                <span style={styles.markAllText}>Mark all as read</span>
              </button>
            )}
          </div>

          <div style={styles.panelBody}>
            {loading && <p style={styles.emptyText}>Loading…</p>}
            {!loading && items.length === 0 && <p style={styles.emptyText}>No notifications yet.</p>}
            {!loading &&
              items.map((item) => (
                <button key={item.id} onClick={() => handleItemClick(item)} style={styles.itemRow}>
                  {!item.read && <span style={styles.unreadDot} />}
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={{ ...styles.itemTitle, fontWeight: item.read ? 500 : 700 }}>{item.title}</span>
                    <span style={styles.itemBody}>{item.body}</span>
                    <span style={styles.itemTime}>{timeAgo(item.created_at)}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: "relative" },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(252,244,234,0.06)",
    border: `1px solid ${COLORS.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.danger,
    color: "#fff",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    fontSize: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
  },
  panel: {
    position: "absolute",
    top: 46,
    right: 0,
    width: 340,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: 440,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    border: `1px solid ${COLORS.borderSoft}`,
    boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: `1px solid ${COLORS.borderSoft}`,
  },
  panelTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 14, color: COLORS.text },
  markAllBtn: { display: "flex", flexDirection: "row", alignItems: "center", gap: 4 },
  markAllText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary },
  panelBody: { overflowY: "auto", flex: 1 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "24px 16px" },
  itemRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    padding: "12px 14px",
    borderBottom: `1px solid ${COLORS.borderSoft}`,
  },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 5, flexShrink: 0 },
  itemTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text },
  itemBody: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  itemTime: { display: "block", fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, marginTop: 4 },
};
