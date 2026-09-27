import React, { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { fetchActiveAnnouncements, Announcement } from "../services/announcementsApi";

function dismissedKey(userId: string) {
  return `mv_dismissed_announcements_${userId}`;
}

function readDismissed(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(dismissedKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markDismissed(userId: string, id: string) {
  try {
    const current = readDismissed(userId);
    window.localStorage.setItem(dismissedKey(userId), JSON.stringify([...current, id]));
  } catch {
    // Browser storage can throw (private mode, quota, blocked) — the
    // popup just re-shows next visit in that case, which is fine.
  }
}

/**
 * Mounted once per authenticated session (see RootGate) for every
 * role except admin — admin is the one writing these, not reading
 * them. Dismissal is tracked client-side only; "have I seen this
 * announcement" is not an authorization decision, so there's no
 * server-side read-tracking table for it.
 */
export function AnnouncementPopup() {
  const { user, authFetch } = useAuth();
  const [queue, setQueue] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchActiveAnnouncements(authFetch)
      .then((all) => {
        if (cancelled) return;
        const seen = readDismissed(user.id);
        setQueue(all.filter((a) => !seen.includes(a.id)));
      })
      .catch(() => {
        // Silent — a broadcast message failing to load shouldn't ever
        // block or error out the screen underneath it.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user || queue.length === 0) return null;

  const current = queue[0];

  const dismiss = () => {
    markDismissed(user.id, current.id);
    setQueue((prev) => prev.slice(1));
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.iconCircle}>
          <Megaphone size={20} color="#fff" />
        </div>
        <span style={styles.title}>Announcement</span>
        <p style={styles.message}>{current.message}</p>
        {queue.length > 1 && <span style={styles.counter}>{queue.length} new announcements</span>}
        <button onClick={dismiss} style={styles.dismissBtn}>
          <span style={styles.dismissText}>Got it</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(29,21,17,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 300,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    width: "100%",
    maxWidth: 380,
    padding: 24,
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text },
  message: { fontFamily: FONTS.body, fontSize: 14, lineHeight: "20px", color: COLORS.textMuted, marginTop: 8, marginBottom: 4, whiteSpace: "pre-wrap" },
  counter: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textFaint, marginTop: 4 },
  dismissBtn: { marginTop: 18, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, padding: "11px 28px" },
  dismissText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff" },
};
