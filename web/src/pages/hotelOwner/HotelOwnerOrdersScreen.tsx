import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QrCode, ShoppingBag, SearchX, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { timeAgo } from "../../components/shared/format";
import { Modal } from "../../components/ui/Modal";
import { SkeletonRegion, SkeletonList } from "../../components/ui/Skeleton";
import {
  Banner,
  Chips,
  EmptyState,
  PageHeader,
  Panel,
  SearchBox,
  StatusPill,
  ORDER_STATUS,
  formatDateTime,
  itemsSummary,
  orderCode,
  useNotice,
  whole,
} from "../../components/hotel/hd";
import { fetchHotelDashboard, fetchHotelOrders, markOrderReady, HotelOrder } from "../../services/hotelStaffApi";

const REFRESH_MS = 30_000;
const BACKEND_LIST_CAP = 100; // getOrdersForHotel returns at most the latest 100

// "Preparing" is the friendlier label for the real 'paid' status; there is no separate backend state.
const FILTERS = [
  { value: "", label: "All" },
  { value: "paid", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "redeemed", label: "Redeemed" },
];

const EMPTY_COPY: Record<string, { title: string; text: string }> = {
  "": { title: "No orders yet", text: "Orders appear here as soon as students pay for a meal at your hotel." },
  paid: { title: "Nothing to prepare", text: "New paid orders show up here so you can start on them." },
  ready: { title: "No meals waiting for pickup", text: "Orders you mark as ready wait here until the student collects them." },
  redeemed: { title: "No redeemed orders yet", text: "Meals appear here once a student's QR code has been scanned." },
};

// The only states that move forward on the hotel's side: paid -> ready -> (QR scan) redeemed.
const PROGRESS = ["Paid", "Ready", "Redeemed"];
const PROGRESS_INDEX: Record<string, number> = { paid: 0, ready: 1, redeemed: 2 };

export default function HotelOwnerOrdersScreen() {
  const { authFetch } = useAuth();
  const { notice, notify } = useNotice();

  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<HotelOrder[]>([]);
  const [preparingCount, setPreparingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<HotelOrder | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const mine = ++requestId.current;
      if (!silent) setLoading(true);
      try {
        const [list, dash] = await Promise.all([
          fetchHotelOrders(authFetch, filter || undefined),
          fetchHotelDashboard(authFetch).catch(() => null), // only feeds the "Preparing" badge
        ]);
        if (mine !== requestId.current) return; // a newer request (tab change) superseded this one
        setOrders(list);
        if (dash) setPreparingCount(Number(dash.stats.pending_orders));
        setError(null);
        setSelected((cur) => (cur ? list.find((o) => o.id === cur.id) ?? cur : cur));
      } catch (err) {
        if (mine !== requestId.current) return;
        if (!silent) setError(err instanceof Error ? err.message : "Could not load orders.");
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    },
    [authFetch, filter]
  );

  useEffect(() => {
    load();
    const id = window.setInterval(() => {
      if (!document.hidden) load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const handleMarkReady = async (order: HotelOrder) => {
    setBusyId(order.id);
    try {
      await markOrderReady(authFetch, order.id);
      notify(`${orderCode(order.id)} is ready for pickup.`);
      setSelected(null);
      await load(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update this order.", "bad");
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        orderCode(o.id).toLowerCase().includes(q) ||
        (o.student_name ?? "").toLowerCase().includes(q) ||
        itemsSummary(o.items).toLowerCase().includes(q)
    );
  }, [orders, query]);

  const options = FILTERS.map((f) => ({
    ...f,
    count: f.value === "paid" && preparingCount !== null ? preparingCount : undefined,
  }));

  return (
    <div className="hd-page mv-page">
      <PageHeader
        eyebrow="Counter"
        title="Orders"
        subtitle="Prepare paid orders, then scan the student's QR code to hand a meal over."
        actions={
          <Link to="/hotel-owner/scanner" className="hd-btn hd-btn-primary">
            <QrCode size={18} aria-hidden="true" /> Scan QR
          </Link>
        }
      />

      <div className="hd-toolbar">
        <Chips label="Filter orders by status" options={options} value={filter} onChange={setFilter} />
        <SearchBox label="Search orders" placeholder="Search by student, meal or order code" value={query} onChange={setQuery} />
      </div>

      {error && (
        <Banner tone="bad" title="Couldn't load orders" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => load()}>Try again</button>}>
          {error}
        </Banner>
      )}

      {loading ? (
        <SkeletonRegion label="orders">
          <SkeletonList rows={4} thumb="none" />
        </SkeletonRegion>
      ) : visible.length === 0 ? (
        query.trim() ? (
          <EmptyState icon={<SearchX size={22} />} title="No matching orders">
            Nothing in this list matches “{query.trim()}”. Try a different name, meal or order code.
          </EmptyState>
        ) : (
          <EmptyState icon={<ShoppingBag size={22} />} title={EMPTY_COPY[filter].title}>
            {EMPTY_COPY[filter].text}
          </EmptyState>
        )
      ) : (
        <>
          <ul className="hd-order-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visible.map((o) => {
              const meta = ORDER_STATUS[o.status] ?? { label: o.status, tone: "muted" as const };
              return (
                <li key={o.id}>
                  <Panel as="article" className="hd-order" aria-label={`Order ${orderCode(o.id)}`}>
                    <div className="hd-order-top">
                      <div style={{ minWidth: 0 }}>
                        <span className="hd-order-code">{orderCode(o.id)}</span>
                        <div className="hd-row-meta" style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                          <User size={13} aria-hidden="true" />
                          {o.student_name || "Student"} · {timeAgo(o.created_at)}
                        </div>
                      </div>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    </div>
                    <div className="hd-order-items">{itemsSummary(o.items)}</div>
                    <div className="hd-order-foot">
                      <span className="hd-amount">{whole(o.amount)}</span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="hd-btn hd-btn-quiet hd-btn-sm" onClick={() => setSelected(o)}>
                          Details
                        </button>
                        {o.status === "paid" && (
                          <button className="hd-btn hd-btn-primary hd-btn-sm" disabled={busyId === o.id} onClick={() => handleMarkReady(o)}>
                            {busyId === o.id ? "Saving…" : "Mark ready"}
                          </button>
                        )}
                        {o.status === "ready" && (
                          <Link to="/hotel-owner/scanner" className="hd-btn hd-btn-dark hd-btn-sm">
                            <QrCode size={15} aria-hidden="true" /> Scan to redeem
                          </Link>
                        )}
                      </div>
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
          {orders.length >= BACKEND_LIST_CAP && !query && <p className="hd-muted-note">Showing the latest {BACKEND_LIST_CAP} orders.</p>}
        </>
      )}

      <Modal
        open={!!selected}
        title={selected ? `Order ${orderCode(selected.id)}` : "Order"}
        onClose={() => setSelected(null)}
        actions={
          selected && (
            <>
              {selected.status === "paid" && (
                <button className="hd-btn hd-btn-primary" disabled={busyId === selected.id} onClick={() => handleMarkReady(selected)}>
                  {busyId === selected.id ? "Saving…" : "Mark ready for pickup"}
                </button>
              )}
              {selected.status === "ready" && (
                <Link to="/hotel-owner/scanner" className="hd-btn hd-btn-primary">
                  <QrCode size={18} aria-hidden="true" /> Scan QR to redeem
                </Link>
              )}
              <button className="hd-btn hd-btn-quiet" onClick={() => setSelected(null)}>
                Close
              </button>
            </>
          )
        }
      >
        {selected && <OrderDetail order={selected} />}
      </Modal>

      {notice}
    </div>
  );
}

function OrderDetail({ order }: { order: HotelOrder }) {
  const meta = ORDER_STATUS[order.status] ?? { label: order.status, tone: "muted" as const };
  const idx = PROGRESS_INDEX[order.status];
  const hasProgress = idx !== undefined;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
        {order.student_name && <span style={{ fontSize: 13, fontWeight: 700, color: "#2c1610" }}>{order.student_name}</span>}
      </div>

      {hasProgress && (
        <ol className="hd-steps" aria-label="Order progress">
          {PROGRESS.map((label, i) => (
            <li key={label} data-done={order.status === "redeemed" || i < idx} data-current={order.status !== "redeemed" && i === idx}>
              {label}
            </li>
          ))}
        </ol>
      )}

      <ul className="hd-detail-list" aria-label="Items">
        {order.items.map((it, i) => (
          <li className="hd-detail-line" key={`${it.name}-${i}`}>
            <span>
              {it.quantity}× {it.name}
            </span>
            {typeof it.unitPrice === "number" && <span>{whole(it.unitPrice * it.quantity)}</span>}
          </li>
        ))}
        <li className="hd-detail-line" style={{ borderTop: "1px solid #ecdcc8", paddingTop: 10, fontWeight: 800 }}>
          <span>Order total</span>
          <span style={{ color: "#c93a22" }}>{whole(order.amount)}</span>
        </li>
      </ul>

      <dl className="hd-kv" style={{ marginTop: 16 }}>
        <div>
          <dt>Placed</dt>
          <dd>{formatDateTime(order.created_at)}</dd>
        </div>
        {order.redeemed_at && (
          <div>
            <dt>Redeemed</dt>
            <dd>{formatDateTime(order.redeemed_at)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
