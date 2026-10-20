import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, BellOff, CheckCheck, RefreshCw } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { EmptyState, groupBy } from "../../components/student/ui";
import { announceNotificationsChanged, dayGroup, notificationIcon, timeAgo } from "../../components/notifications/notificationMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, NotificationItem } from "../../services/notificationsApi";

const PAGE_SIZE = 30;

/**
 * Dedicated notifications page. Phones are sent here by the bell (the
 * dropdown can't fit beside the nav chrome); desktop keeps its dropdown. The
 * page works at any width, so a resized window never lands in a dead state.
 *
 * Everything runs through the existing notification API (list, unread count,
 * mark one read, mark all read). Read state is whatever the server says.
 */
export default function StudentNotificationsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const refreshUnread = useCallback(() => {
    fetchUnreadCount(authFetch)
      .then(setUnread)
      .catch(() => {});
  }, [authFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const first = await fetchNotifications(authFetch, PAGE_SIZE, 0);
      setItems(first);
      setHasMore(first.length === PAGE_SIZE);
      refreshUnread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your notifications.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, refreshUnread]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    setActionError(null);
    try {
      const next = await fetchNotifications(authFetch, PAGE_SIZE, items.length);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...next.filter((i) => !seen.has(i.id))];
      });
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  };

  const goBack = () => {
    // history.state.idx > 0 means there is an in-app page to return to.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/student/home");
  };

  const open = async (item: NotificationItem) => {
    setActionError(null);
    if (!item.read) {
      try {
        await markNotificationRead(authFetch, item.id);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
        refreshUnread();
        announceNotificationsChanged();
      } catch {
        // Same as the dropdown: a failed mark-as-read never blocks the action.
      }
    }
    const link = item.deep_link;
    if (!link) return;
    // In-app destinations navigate without a reload (which would re-lock a
    // PWA); anything else keeps the existing full-page behaviour.
    if (link.startsWith("/") && !link.startsWith("//")) navigate(link);
    else window.location.href = link;
  };

  const markAll = async () => {
    setMarkingAll(true);
    setActionError(null);
    try {
      await markAllNotificationsRead(authFetch);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
      announceNotificationsChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not mark everything as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const groups = groupBy(items, (i) => dayGroup(i.created_at));

  return (
    <div className="mv-container sv-page" style={{ maxWidth: 720 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="sv-notif-head">
          <button type="button" className="sv-iconbtn" onClick={goBack} aria-label="Go back">
            <ArrowLeft size={20} aria-hidden />
          </button>
          <h1>Notifications</h1>
        </div>
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className="sv-meta" role="status" aria-live="polite" style={{ fontSize: 13 }}>
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </span>
            {unread > 0 && (
              <button type="button" className="sv-btn" onClick={markAll} disabled={markingAll}>
                <CheckCheck size={16} aria-hidden />
                {markingAll ? "Marking…" : "Mark all as read"}
              </button>
            )}
          </div>
        )}
      </header>

      {loading && (
        <div aria-busy="true" aria-label="Loading notifications" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mv-skel" style={{ height: 84 }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load your notifications" body={error}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
            Try again
          </PrimaryButton>
        </EmptyState>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState icon={<BellOff size={30} />} title="No notifications yet" body="Updates about your orders, payments and plan will show up here." />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {actionError && (
            <div className="sv-toast" data-tone="bad" role="alert">
              {actionError}
            </div>
          )}
          <div className="sv-group">
            {groups.map((g) => (
              <React.Fragment key={g.key}>
                <div className="sv-divider-label">{g.key}</div>
                {g.items.map((item) => {
                  const Icon = notificationIcon(item.type);
                  return (
                    <button key={item.id} type="button" className="sv-notif-item" data-read={item.read} onClick={() => open(item)}>
                      <span className="sv-notif-icon" aria-hidden="true">
                        <Icon size={19} />
                      </span>
                      <span className="sv-notif-body">
                        <span className="sv-notif-title">
                          {!item.read && <span className="sv-visually-hidden">Unread: </span>}
                          {item.title}
                        </span>
                        <span className="sv-notif-text">{item.body}</span>
                        <span className="sv-notif-time">
                          <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
                        </span>
                      </span>
                      {!item.read && <span className="sv-unread-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {hasMore && (
            <button type="button" className="sv-btn" onClick={loadMore} disabled={loadingMore} style={{ alignSelf: "center" }}>
              <Bell size={16} aria-hidden />
              {loadingMore ? "Loading…" : "Show older notifications"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
