import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Coffee,
  Cookie,
  GlassWater,
  Info,
  MapPin,
  MessageSquare,
  Moon,
  Phone,
  RefreshCw,
  Store,
  Sun,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import { fetchHotelMenu, Hotel, MenuItem } from "../../services/hotelsApi";
import { HotelReviews } from "../../components/student/HotelReviews";
import { EmptyState, FoodImage, formatKsh } from "../../components/student/ui";
import { HotelImage, RatingLine } from "../../components/student/HotelMedia";
import { PrimaryButton } from "../../components/PrimaryButton";
import "../../styles/onboarding.css";

// "dinner" is relabeled "Supper" for display only — the real category
// value stored on each menu item is still "dinner", this is cosmetic.
const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Supper", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

type TabKey = "menu" | "info" | "reviews";

/** Known categories first (in meal order), then anything else the API sends, so nothing is silently dropped. */
function buildSections(menu: MenuItem[]) {
  const keys = [...Object.keys(CATEGORY_META), ...Array.from(new Set(menu.map((m) => m.category))).filter((k) => !(k in CATEGORY_META))];
  return keys
    .map((key) => {
      const meta = CATEGORY_META[key] || { label: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Other", Icon: UtensilsCrossed };
      return { key, label: meta.label, Icon: meta.Icon, data: menu.filter((m) => m.category === key) };
    })
    .filter((s) => s.data.length > 0);
}

/**
 * Onboarding stage 2: evaluate a hotel — its menu, details and reviews —
 * before committing to a plan. Navigation contracts preserved:
 *   Request  -> /student/meal-pass {hotelId, hotelName, itemId, itemName, itemPrice}
 *   Continue -> /student/budget-onboarding {hotelId, hotelName}
 */
export default function HotelMenuScreen() {
  const { hotelId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fallbackHotelName: string | undefined = (location.state as any)?.hotelName;

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [tab, setTab] = useState<TabKey>("menu");
  const [reviewsOpened, setReviewsOpened] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({ menu: null, info: null, reviews: null });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchHotelMenu(hotelId)
      .then((data) => {
        setHotel(data.hotel);
        setMenu(data.menu);
      })
      .catch((err) => setError({ message: err.message || "Could not load this hotel.", notFound: err.status === 404 }))
      .finally(() => setLoading(false));
  }, [hotelId]);

  useEffect(() => {
    load();
  }, [load]);

  // The app scrolls inside one shared container, so arriving from the hotel
  // list (possibly scrolled down) would otherwise land mid-way down this page.
  useEffect(() => {
    document.getElementById("root")?.scrollTo?.({ top: 0 });
    window.scrollTo?.(0, 0);
  }, [hotelId]);

  const hotelName = hotel?.name || fallbackHotelName;
  const sections = useMemo(() => buildSections(menu), [menu]);
  const shown = category === "all" ? sections : sections.filter((s) => s.key === category);

  const backToHotels = () => navigate("/student", { state: { selectedHotelId: hotelId } });

  const requestMeal = (item: MenuItem) => {
    // Goes straight to the real order+payment+QR flow. If the
    // student has no active budget yet, MealPassScreen surfaces that
    // clearly (BUDGET_NOT_FOUND from the backend) with a path into
    // BudgetOnboarding — but the default path for a student who's
    // already funded is now the real one, not a detour through setup
    // every time.
    navigate("/student/meal-pass", {
      state: { hotelId, hotelName, itemId: item.id, itemName: item.name, itemPrice: item.price },
    });
  };

  const selectTab = (next: TabKey) => {
    setTab(next);
    if (next === "reviews") setReviewsOpened(true);
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const order: TabKey[] = ["menu", "info", "reviews"];
    const i = order.indexOf(tab);
    let next: TabKey | null = null;
    if (e.key === "ArrowRight") next = order[(i + 1) % order.length];
    else if (e.key === "ArrowLeft") next = order[(i + order.length - 1) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (next) {
      e.preventDefault();
      selectTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  // ---- Loading / error -------------------------------------------------
  if (loading) {
    return (
      <div className="ob-bg">
        <div className="ob-wrap" aria-busy="true" role="status">
          <span className="ob-sr">Loading hotel…</span>
          <div className="mv-skel" style={{ height: 44, width: 150, borderRadius: 999 }} />
          <div className="mv-skel" style={{ height: 220, borderRadius: 28 }} />
          <div className="mv-skel" style={{ height: 36, width: "60%", borderRadius: 10 }} />
          <div className="mv-skel" style={{ height: 54, borderRadius: 999 }} />
          <div className="mv-skel" style={{ height: 120, borderRadius: 22 }} />
          <div className="mv-skel" style={{ height: 120, borderRadius: 22 }} />
        </div>
      </div>
    );
  }

  if (error || !hotel) {
    const notFound = error?.notFound;
    return (
      <div className="ob-bg">
        <div className="ob-wrap">
          <button type="button" className="ob-back" onClick={() => navigate("/student")}>
            <ArrowLeft size={18} aria-hidden="true" /> Back to hotels
          </button>
          <EmptyState
            icon={notFound ? <Store size={26} /> : <WifiOff size={26} />}
            title={notFound ? "This hotel isn't available" : "Couldn't load this hotel"}
            body={error?.message || "Something went wrong."}
            role="alert"
          >
            {!notFound && (
              <PrimaryButton onPress={load} icon={<RefreshCw size={18} aria-hidden="true" />} showArrow={false}>
                Try again
              </PrimaryButton>
            )}
            <PrimaryButton variant="secondary" onPress={() => navigate("/student")} showArrow={false}>
              Choose another hotel
            </PrimaryButton>
          </EmptyState>
        </div>
      </div>
    );
  }

  // ---- Info tab data (only fields the API returned) ----------------------
  const phone = hotel.helpline || hotel.contact_phone || null;
  const showAltPhone = hotel.helpline && hotel.contact_phone && hotel.helpline !== hotel.contact_phone;
  const address = hotel.address || hotel.location || null;
  const services = (hotel.services || []).filter(Boolean);
  const hasCoords = typeof hotel.latitude === "number" && typeof hotel.longitude === "number";
  const hasInfo = !!(hotel.description || hotel.opening_hours || address || phone || services.length || hasCoords);

  const tabs: { key: TabKey; label: string; Icon: any; count?: number }[] = [
    { key: "menu", label: "Menu", Icon: UtensilsCrossed, count: menu.length || undefined },
    { key: "info", label: "Info", Icon: Info },
    { key: "reviews", label: "Reviews", Icon: MessageSquare, count: hotel.review_count || undefined },
  ];

  return (
    <div className="ob-bg">
      <div className="ob-wrap">
        <button type="button" className="ob-back ob-rise" onClick={backToHotels}>
          <ArrowLeft size={18} aria-hidden="true" /> Back to hotels
        </button>

        <div className="ob-hero ob-rise">
          <HotelImage src={hotel.image_url} size={56} />
        </div>

        <header className="ob-title-block ob-rise">
          <h1 className="ob-title">{hotelName}</h1>
          <div className="ob-pillrow">
            {hotel.location && (
              <span>
                <MapPin size={15} aria-hidden="true" />
                {hotel.location}
              </span>
            )}
            {hotel.opening_hours && (
              <span>
                <Clock size={15} aria-hidden="true" />
                {hotel.opening_hours}
              </span>
            )}
            <RatingLine average={hotel.average_rating} count={hotel.review_count} surface="dark" />
          </div>
        </header>

        <div className="ob-tabs ob-rise" role="tablist" aria-label="Hotel sections" onKeyDown={onTabKey}>
          {tabs.map(({ key, label, Icon, count }) => (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={`ob-tab-${key}`}
              className="ob-tab"
              aria-selected={tab === key}
              aria-controls={`ob-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => selectTab(key)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
              {count ? (
                <span className="ob-n" aria-label={`${count} ${key === "reviews" ? "reviews" : "items"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ---------------- Menu ---------------- */}
        {tab === "menu" && (
          <div className="ob-panel" role="tabpanel" id="ob-panel-menu" aria-labelledby="ob-tab-menu" tabIndex={0} key="menu">
            {sections.length === 0 ? (
              <EmptyState
                icon={<UtensilsCrossed size={26} />}
                title="No menu items yet"
                body="This hotel hasn't published its menu yet. You can still continue and set up your plan."
              />
            ) : (
              <>
                {sections.length > 1 && (
                  <div className="ob-chips" role="group" aria-label="Filter menu by category">
                    <button type="button" className="ob-chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
                      All
                    </button>
                    {sections.map((s) => (
                      <button key={s.key} type="button" className="ob-chip" aria-pressed={category === s.key} onClick={() => setCategory(s.key)}>
                        <s.Icon size={16} aria-hidden="true" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                {shown.map((s) => (
                  <section key={s.key} className="ob-menu-section" aria-labelledby={`ob-cat-${s.key}`}>
                    <h2 className="ob-seclabel" id={`ob-cat-${s.key}`}>
                      <s.Icon size={16} aria-hidden="true" /> {s.label}
                    </h2>
                    <ul className="ob-menu-grid">
                      {s.data.map((item) => (
                        <li key={item.id} className="ob-item">
                          <div className="ob-item-top">
                            <div className="ob-item-media">
                              <FoodImage src={item.image_url} size={26} fallbackClass="ob-item-fallback" />
                            </div>
                            <div className="ob-item-text">
                              <h3 className="ob-item-name">{item.name}</h3>
                              {item.description && <p className="ob-item-desc">{item.description}</p>}
                            </div>
                          </div>
                          <div className="ob-item-foot">
                            <span className="ob-price">{formatKsh(item.price)}</span>
                            <button type="button" className="ob-request" onClick={() => requestMeal(item)} aria-label={`Request ${item.name}`}>
                              Request
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </div>
        )}

        {/* ---------------- Info ---------------- */}
        {tab === "info" && (
          <div className="ob-panel" role="tabpanel" id="ob-panel-info" aria-labelledby="ob-tab-info" tabIndex={0} key="info">
            {!hasInfo ? (
              <EmptyState icon={<Info size={26} />} title="No extra details yet" body="This hotel hasn't added more information yet." />
            ) : (
              <>
                {hotel.description && <p className="ob-about">{hotel.description}</p>}
                <dl className="ob-facts" style={{ margin: 0 }}>
                  {hotel.opening_hours && (
                    <div className="ob-fact">
                      <span className="ob-fact-icon" aria-hidden="true">
                        <Clock size={20} />
                      </span>
                      <div>
                        <dt>Opening hours</dt>
                        <dd>{hotel.opening_hours}</dd>
                      </div>
                    </div>
                  )}
                  {address && (
                    <div className="ob-fact">
                      <span className="ob-fact-icon" aria-hidden="true">
                        <MapPin size={20} />
                      </span>
                      <div>
                        <dt>Location</dt>
                        <dd>
                          {address}
                          {hasCoords && (
                            <>
                              <br />
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View on Google Maps
                              </a>
                            </>
                          )}
                        </dd>
                      </div>
                    </div>
                  )}
                  {phone && (
                    <div className="ob-fact">
                      <span className="ob-fact-icon" aria-hidden="true">
                        <Phone size={20} />
                      </span>
                      <div>
                        <dt>{hotel.helpline ? "Helpline" : "Phone"}</dt>
                        <dd>
                          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
                          {showAltPhone && (
                            <>
                              <br />
                              <a href={`tel:${hotel.contact_phone!.replace(/[^\d+]/g, "")}`}>{hotel.contact_phone}</a>
                            </>
                          )}
                        </dd>
                      </div>
                    </div>
                  )}
                  {services.length > 0 && (
                    <div className="ob-fact">
                      <span className="ob-fact-icon" aria-hidden="true">
                        <Store size={20} />
                      </span>
                      <div>
                        <dt>Services</dt>
                        <dd>
                          <span className="ob-tags">
                            {services.map((s) => (
                              <span key={s} className="ob-tag">
                                {s}
                              </span>
                            ))}
                          </span>
                        </dd>
                      </div>
                    </div>
                  )}
                </dl>
              </>
            )}
          </div>
        )}

        {/* ---------------- Reviews (mounted on first open, kept mounted after) ---------------- */}
        {reviewsOpened && (
          <div
            className="ob-panel"
            role="tabpanel"
            id="ob-panel-reviews"
            aria-labelledby="ob-tab-reviews"
            tabIndex={0}
            hidden={tab !== "reviews"}
            style={tab !== "reviews" ? { display: "none" } : undefined}
          >
            <HotelReviews hotelId={hotelId} hotelName={hotelName} />
          </div>
        )}

        <div className="ob-continue">
          <PrimaryButton
            onPress={() => navigate("/student/budget-onboarding", { state: { hotelId, hotelName } })}
            icon={<UtensilsCrossed size={18} aria-hidden="true" />}
          >
            This looks good — continue
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
