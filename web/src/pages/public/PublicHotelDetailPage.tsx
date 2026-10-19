import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Info, MapPin, Phone, RefreshCw, Store, UtensilsCrossed } from "lucide-react";
import { PublicShell } from "../../components/public/PublicShell";
import { HotelImage } from "../../components/public/HotelCard";
import { RatingBadge } from "../../components/student/HotelReviews";
import { formatKsh } from "../../components/shared/format";
import { fetchHotelMenu, Hotel, MenuItem } from "../../services/hotelsApi";
import { groupMenu } from "../../services/publicHotels";

type State =
  | { kind: "loading" }
  | { kind: "ready"; hotel: Hotel; menu: MenuItem[] }
  | { kind: "unavailable" }
  | { kind: "error" };

/**
 * Public hotel page + menu. GET /api/hotels/:id/menu only answers for ACTIVE
 * hotels (404 otherwise) and only returns AVAILABLE items with public fields,
 * so a pending/rejected/removed hotel simply shows "unavailable". This page is
 * read-only: there is deliberately no order/checkout here — that needs a
 * student account and plan, and keeps its existing flow under /student.
 */
export default function PublicHotelDetailPage() {
  const { hotelId = "" } = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    fetchHotelMenu(hotelId)
      .then(({ hotel, menu }) => setState({ kind: "ready", hotel, menu }))
      .catch((err: Error & { status?: number }) => {
        // 404 = not found / not active; 400 = malformed id. Anything else is retryable.
        setState({ kind: err.status === 404 || err.status === 400 ? "unavailable" : "error" });
      });
  }, [hotelId]);
  useEffect(() => load(), [load]);

  useEffect(() => {
    document.title = state.kind === "ready" ? `${state.hotel.name} — MEALVEST` : "Hotel — MEALVEST";
  }, [state]);

  const groups = useMemo(() => (state.kind === "ready" ? groupMenu(state.menu) : []), [state]);

  const jump = (category: string) => {
    setActiveCat(category);
    document.getElementById(`mvp-cat-${encodeURIComponent(category)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PublicShell>
      <div className="mv-container">
        <Link to="/hotels" className="mvp-back">
          <ArrowLeft size={16} aria-hidden /> All hotels
        </Link>

        {state.kind === "loading" && (
          <div aria-busy="true" aria-label="Loading hotel" style={{ marginTop: 16, display: "grid", gap: 16 }}>
            <div className="mv-skel" style={{ height: 240 }} />
            <div className="mv-skel" style={{ height: 120 }} />
          </div>
        )}

        {state.kind === "error" && (
          <div className="mvp-state" role="alert">
            <div className="mvp-state-ico"><RefreshCw size={24} aria-hidden /></div>
            <h2>We couldn’t load this hotel</h2>
            <p>Check your connection and try again.</p>
            <button type="button" className="mvp-cta mvp-cta--primary" onClick={load}>Try again</button>
          </div>
        )}

        {state.kind === "unavailable" && (
          <div className="mvp-state">
            <div className="mvp-state-ico"><Store size={24} aria-hidden /></div>
            <h2>This hotel isn’t available</h2>
            <p>It may have been removed or isn’t listed on MEALVEST right now.</p>
            <Link to="/hotels" className="mvp-cta mvp-cta--primary">See all hotels</Link>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <section className="mvp-detail-head" aria-labelledby="mvp-hotel-title">
              <div className="mvp-detail-img"><HotelImage hotel={state.hotel} eager /></div>
              <div>
                <h1 id="mvp-hotel-title" className="mvp-detail-title">{state.hotel.name}</h1>
                <div style={{ marginTop: 10 }}>
                  <RatingBadge average={state.hotel.average_rating} count={state.hotel.review_count} onDark />
                </div>
                {state.hotel.description && (
                  <p className="mvp-lead" style={{ marginTop: 12 }}>{state.hotel.description}</p>
                )}
                <ul className="mvp-facts">
                  {(state.hotel.address || state.hotel.location) && (
                    <li><MapPin size={16} aria-hidden /><span>{[state.hotel.address, state.hotel.location].filter(Boolean).join(", ")}</span></li>
                  )}
                  {state.hotel.opening_hours && (
                    <li><Clock size={16} aria-hidden /><span>{state.hotel.opening_hours}</span></li>
                  )}
                  {state.hotel.contact_phone && (
                    <li><Phone size={16} aria-hidden /><span><a href={`tel:${state.hotel.contact_phone.replace(/\s+/g, "")}`}>{state.hotel.contact_phone}</a></span></li>
                  )}
                </ul>
                {state.hotel.services && state.hotel.services.length > 0 && (
                  <div className="mvp-tags" aria-label="Services">
                    {state.hotel.services.map((s) => <span className="mvp-tag" key={s}>{s}</span>)}
                  </div>
                )}
              </div>
            </section>

            <div className="mvp-notice" role="note">
              <Info size={18} aria-hidden />
              <span>
                You’re browsing this menu. To order, <Link to="/register/student" style={{ textDecoration: "underline", fontWeight: 700 }}>create a student account</Link> or{" "}
                <Link to="/login" style={{ textDecoration: "underline", fontWeight: 700 }}>log in</Link>, then fund a meal plan.
              </span>
            </div>

            <section className="mvp-menu-layout" aria-labelledby="mvp-menu-title">
              <h2 id="mvp-menu-title" className="mvp-h2" style={{ fontSize: 26 }}>Menu</h2>

              {groups.length === 0 ? (
                <div className="mvp-state" style={{ width: "100%" }}>
                  <div className="mvp-state-ico"><UtensilsCrossed size={24} aria-hidden /></div>
                  <h2>No menu items right now</h2>
                  <p>This hotel hasn’t listed any available meals yet. Check back soon.</p>
                </div>
              ) : (
                <>
                  {groups.length > 1 && (
                    <div className="mvp-catnav" role="group" aria-label="Menu categories">
                      {groups.map((g) => (
                        <button key={g.category} type="button" aria-pressed={activeCat === g.category} onClick={() => jump(g.category)}>
                          {g.category}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    {groups.map((g) => (
                      <section className="mvp-cat" key={g.category} aria-labelledby={`mvp-cath-${encodeURIComponent(g.category)}`}>
                        <h3 id={`mvp-cat-${encodeURIComponent(g.category)}`}>
                          <span id={`mvp-cath-${encodeURIComponent(g.category)}`}>{g.category}</span>
                        </h3>
                        <ul className="mvp-items">
                          {g.items.map((m) => <MenuRow key={m.id} item={m} />)}
                        </ul>
                      </section>
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="mvp-partner" aria-labelledby="mvp-partner-title">
              <div>
                <h2 id="mvp-partner-title">Run a hotel and want to partner with MEALVEST?</h2>
                <p>
                  Start your own hotel application. This begins a new registration, reviewed by MEALVEST before a hotel is listed. It doesn’t
                  claim or change this listing.
                </p>
              </div>
              <Link to="/register/hotel" className="mvp-cta mvp-cta--primary">Register a hotel</Link>
            </aside>
          </>
        )}
      </div>
    </PublicShell>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className="mvp-item">
      <div className="mvp-item-thumb">
        {item.image_url && !failed ? (
          <img src={item.image_url} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <UtensilsCrossed size={22} aria-hidden />
        )}
      </div>
      <div className="mvp-item-body">
        <strong>{item.name}</strong>
        {item.description && <p>{item.description}</p>}
      </div>
      <span className="mvp-price">{formatKsh(item.price)}</span>
    </li>
  );
}
