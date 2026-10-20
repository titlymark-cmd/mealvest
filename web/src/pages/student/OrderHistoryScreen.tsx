import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  RefreshCw,
  Check,
  Clock,
  BadgeCheck,
  PackageCheck,
  CircleCheck,
  Ban,
  Undo2,
  Receipt,
  ChevronRight,
  Info,
  Utensils,
  ListChecks,
  History,
} from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { EmptyState, FoodImage, StatusBadge, formatAmount, formatDay, formatDateTime, groupBy, monthLabel, BadgeTone } from "../../components/student/ui";
import { useAuth } from "../../context/AuthContext";
import { listMyOrders, Order } from "../../services/ordersApi";
import { fetchHotelMenu } from "../../services/hotelsApi";

type OrderStatus = Order["status"];
type Filter = "all" | "active" | "completed" | "cancelled";

const ACTIVE: OrderStatus[] = ["pending_payment", "paid", "ready"];

/** Every real status the backend can return, with one consistent badge. */
const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }> = {
  pending_payment: { label: "Awaiting payment", tone: "warn", Icon: Clock },
  paid: { label: "Paid", tone: "ok", Icon: BadgeCheck },
  ready: { label: "Ready to collect", tone: "ok", Icon: PackageCheck },
  redeemed: { label: "Collected", tone: "neutral", Icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "bad", Icon: Ban },
  refunded: { label: "Refunded", tone: "neutral", Icon: Undo2 },
};

/**
 * Progress only maps statuses the backend really has. There is no
 * "preparing" state, so none is shown, and nothing here claims live tracking:
 * the tracker moves when the order's status changes on the server.
 */
const STEPS = ["Placed", "Paid", "Ready", "Collected"] as const;
const STEP_INDEX: Partial<Record<OrderStatus, number>> = { pending_payment: 0, paid: 1, ready: 2, redeemed: 3 };

interface HotelInfo {
  name: string;
  images: Record<string, string | null>;
}

function orderRef(o: Order) {
  return o.id.replace(/-/g, "").slice(-6).toUpperCase();
}

function describeItems(o: Order) {
  const first = o.items[0];
  if (!first) return "Order";
  const label = first.quantity > 1 ? `${first.quantity}× ${first.name}` : first.name;
  return o.items.length > 1 ? `${label} + ${o.items.length - 1} more` : label;
}

export default function OrderHistoryScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [hotels, setHotels] = useState<Record<string, HotelInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await listMyOrders(authFetch);
        setOrders([...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        // Order rows only carry a hotel_id; the public menu endpoint (already
        // used elsewhere) gives the hotel's name and each item's image.
        // Best-effort: a failure just means plain text and a fallback tile.
        const ids = Array.from(new Set(data.map((o) => o.hotel_id)));
        const results = await Promise.allSettled(ids.map((id) => fetchHotelMenu(id)));
        const next: Record<string, HotelInfo> = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            next[ids[i]] = { name: r.value.hotel.name, images: Object.fromEntries(r.value.menu.map((m) => [m.id, m.image_url])) };
          }
        });
        setHotels(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your orders.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Pick up status changes when the student comes back to this tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const active = useMemo(() => orders.filter((o) => ACTIVE.includes(o.status)), [orders]);
  const completed = useMemo(() => orders.filter((o) => o.status === "redeemed"), [orders]);
  const cancelled = useMemo(() => orders.filter((o) => o.status === "cancelled" || o.status === "refunded"), [orders]);

  const showActive = filter === "all" || filter === "active";
  const history = useMemo(() => {
    if (filter === "active") return [];
    if (filter === "completed") return completed;
    if (filter === "cancelled") return cancelled;
    return [...completed, ...cancelled].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filter, completed, cancelled]);

  const imageFor = (o: Order) => (o.items[0] ? hotels[o.hotel_id]?.images[o.items[0].itemId] ?? null : null);
  const hotelName = (o: Order) => hotels[o.hotel_id]?.name;

  // ----- States ----------------------------------------------------------------

  if (loading) {
    return (
      <div className="mv-container sv-page" aria-busy="true" aria-label="Loading your orders">
        <div>
          <h1 className="sv-title">Your orders</h1>
          <p className="sv-lede">Loading…</p>
        </div>
        <div className="mv-skel" style={{ height: 230 }} />
        <div className="mv-skel" style={{ height: 200 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Your orders</h1>
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load your orders" body={error}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={() => load()}>
            Try again
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Your orders</h1>
        <EmptyState icon={<ShoppingBag size={30} />} title="No orders yet" body="When you order a meal, you'll follow it here from payment to pick-up.">
          <PrimaryButton type="button" showArrow={false} icon={<Utensils size={18} aria-hidden />} onPress={() => navigate("/student/menu")}>
            Browse the menu
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const filters: Array<{ key: Filter; label: string; count?: number; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }> = [
    { key: "all", label: "All", Icon: ListChecks },
    { key: "active", label: "Active", count: active.length, Icon: Clock },
    { key: "completed", label: "Completed", Icon: CircleCheck },
    { key: "cancelled", label: "Cancelled", Icon: Ban },
  ];

  const summary =
    active.length > 0
      ? `${active.length} in progress · ${orders.length} ${orders.length === 1 ? "order" : "orders"} in total`
      : `Nothing in progress · ${orders.length} ${orders.length === 1 ? "order" : "orders"} in total`;

  const noteFor = (o: Order) => {
    const place = hotelName(o) ?? "your hotel";
    if (o.status === "pending_payment") return "We're waiting for the payment to go through. Your order moves on as soon as it's paid.";
    if (o.status === "paid") return `Paid from your meal plan. Collect it at ${place} with the meal pass you were shown when you ordered.`;
    return `Your meal is ready at ${place}. Collect it with the meal pass you were shown when you ordered.`;
  };

  const monthGroups = groupBy(history, (o) => monthLabel(o.created_at));

  return (
    <div className="mv-container sv-page">
      <header className="sv-head">
        <div>
          <h1 className="sv-title">Your orders</h1>
          <p className="sv-lede">{summary}</p>
        </div>
        <button type="button" className="sv-iconbtn" onClick={() => load(true)} disabled={refreshing} aria-label={refreshing ? "Refreshing orders" : "Refresh orders"}>
          <RefreshCw size={18} aria-hidden style={refreshing ? { animation: "mv-spin 0.8s linear infinite" } : undefined} />
        </button>
      </header>

      <div className="sv-seg" data-compact="true" role="group" aria-label="Filter orders">
        {filters.map(({ key, label, count, Icon }) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            <Icon size={15} aria-hidden />
            {label}
            {count !== undefined && count > 0 && (
              <span className="sv-count" aria-label={`${count} active`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="sv-orders-cols" data-split={filter === "all" && active.length > 0 && history.length > 0}>
        {showActive && (active.length > 0 || filter === "active") && (
          <section className="sv-stack" aria-label="Orders in progress">
            {active.length === 0 ? (
              <EmptyState icon={<Clock size={30} />} title="Nothing in progress" body="You don't have an order on the way. Pick a meal and it will show up here.">
                <PrimaryButton type="button" showArrow={false} icon={<Utensils size={18} aria-hidden />} onPress={() => navigate("/student/menu")}>
                  Browse the menu
                </PrimaryButton>
              </EmptyState>
            ) : (
              <>
                {filter === "all" && (
                  <h2 className="sv-h2">
                    <Clock size={18} aria-hidden />
                    In progress
                  </h2>
                )}
                {active.map((o) => {
                  const st = STATUS[o.status];
                  const stepIdx = STEP_INDEX[o.status] ?? 0;
                  return (
                    <article key={o.id} className="sv-active" aria-label={`Order ${describeItems(o)}, ${st.label}`}>
                      <div className="sv-active-top">
                        <div className="sv-thumb">
                          <FoodImage src={imageFor(o)} size={24} fallbackClass="sv-thumb-fallback" />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 className="sv-active-name">{describeItems(o)}</h3>
                          <div className="sv-active-meta">
                            {hotelName(o) ? `${hotelName(o)} · ` : ""}
                            {formatDateTime(o.created_at)}
                          </div>
                          <div className="sv-active-meta">Ref {orderRef(o)}</div>
                        </div>
                        <div className="sv-active-total">KSh {formatAmount(o.amount)}</div>
                      </div>

                      <div>
                        <StatusBadge surface="cream" tone={st.tone} label={st.label} icon={<st.Icon size={13} aria-hidden />} />
                      </div>

                      <ol className="sv-steps" aria-label="Order progress">
                        {STEPS.map((label, i) => {
                          const state = i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
                          return (
                            <li key={label} className="sv-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                              <span className="sv-node" aria-hidden="true">
                                {state === "done" ? <Check size={16} /> : <span style={{ fontSize: 12, fontWeight: 800 }}>{i + 1}</span>}
                              </span>
                              <span>
                                {label}
                                <span className="sv-visually-hidden">{state === "done" ? " — done" : state === "current" ? " — current step" : " — not yet"}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ol>

                      <div className="sv-active-note">
                        <Info size={16} aria-hidden />
                        <span>{noteFor(o)}</span>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
          </section>
        )}

        {filter !== "active" && (
          <section className="sv-stack" aria-label="Past orders">
            {history.length === 0 ? (
              <EmptyState
                icon={filter === "cancelled" ? <Ban size={30} /> : <History size={30} />}
                title={filter === "cancelled" ? "No cancelled orders" : filter === "completed" ? "No completed orders yet" : "No past orders yet"}
                body={filter === "cancelled" ? "Orders that are cancelled or refunded will be listed here." : "Once you've collected a meal, it will be listed here."}
              />
            ) : (
              <>
                {filter === "all" && (
                  <h2 className="sv-h2">
                    <History size={18} aria-hidden />
                    Earlier
                  </h2>
                )}
                <div className="sv-group">
                  {monthGroups.map((group) => (
                    <React.Fragment key={group.key}>
                      <div className="sv-divider-label">{group.key}</div>
                      {group.items.map((o) => {
                        const st = STATUS[o.status];
                        const refunded = o.status === "cancelled" || o.status === "refunded";
                        return (
                          <div key={o.id} className="sv-row" style={{ alignItems: "flex-start" }}>
                            <div className="sv-thumb sv-thumb--sm">
                              <FoodImage src={imageFor(o)} size={18} fallbackClass="sv-thumb-fallback" />
                            </div>
                            <div className="sv-row-main">
                              <span className="sv-hist-name">{describeItems(o)}</span>
                              <span className="sv-row-sub">
                                {hotelName(o) ? `${hotelName(o)} · ` : ""}
                                {formatDay(o.created_at)} · Ref {orderRef(o)}
                              </span>
                            </div>
                            <div className="sv-row-end">
                              <span className="sv-amount" style={refunded ? { color: "var(--sv-muted)", textDecoration: "line-through", textDecorationThickness: 1 } : undefined}>
                                KSh {formatAmount(o.amount)}
                              </span>
                              <StatusBadge tone={st.tone} label={st.label} icon={<st.Icon size={13} aria-hidden />} />
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  {completed.length > 0 && filter !== "cancelled" && (
                    <button type="button" className="sv-row" onClick={() => navigate("/student/menu")}>
                      <span className="sv-row-icon" aria-hidden="true">
                        <Receipt size={18} />
                      </span>
                      <span className="sv-row-main">
                        <span className="sv-row-label">Hungry again?</span>
                        <span className="sv-row-sub">Pick your next meal from the menu</span>
                      </span>
                      <ChevronRight size={18} aria-hidden style={{ color: "var(--sv-muted)" }} />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
