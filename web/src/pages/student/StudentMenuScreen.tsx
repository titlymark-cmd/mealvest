import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, Sun, Moon, Cookie, GlassWater, UtensilsCrossed, Store, Search, X, RefreshCw, SearchX, Wallet, MapPin, CircleSlash } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Chip } from "../../components/ui/Chip";
import { EmptyState, FoodImage, StatusBadge, formatAmount } from "../../components/student/ui";
import { useAuth } from "../../context/AuthContext";
import { getActiveBudget } from "../../services/budgetApi";
import { fetchHotelMenu, Hotel, MenuItem } from "../../services/hotelsApi";
import { HotelReviews } from "../../components/student/HotelReviews";

const CATEGORY_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }> }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Supper", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

type LoadState =
  | { kind: "loading" }
  | { kind: "no-plan"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

/**
 * The student's OWN assigned hotel's menu, reached from the dashboard nav or
 * "Order today's meal". Ordering is unchanged: "Order" navigates to
 * /student/meal-pass with the same router state as before, and that screen
 * runs the real createOrder -> payOrder -> QR pipeline.
 *
 * Discovery is built only from fields the API really returns (name,
 * description, price, category, availability, image). There is no "featured"
 * or dietary data in the backend, so neither is invented; the first tile of
 * each section simply leads on wide screens for visual rhythm.
 */
export default function StudentMenuScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [spendableToday, setSpendableToday] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const budget = await getActiveBudget(authFetch);
      if (!budget) {
        setState({ kind: "no-plan", message: "You don't have an active meal plan yet." });
        return;
      }
      if (!budget.hotel_id) {
        setState({ kind: "no-plan", message: "Your plan isn't linked to a hotel yet — contact Customer Care for help." });
        return;
      }
      const dailyCredit = Number(budget.daily_allowance);
      const banked = Number(budget.banked_amount);
      const spentToday = Number(budget.spent_today);
      setSpendableToday(Math.max(0, dailyCredit + banked - spentToday));

      const data = await fetchHotelMenu(budget.hotel_id);
      setHotel(data.hotel);
      setMenu(data.menu);
      setState({ kind: "ready" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load your hotel's menu." });
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const requestMeal = (item: MenuItem) => {
    navigate("/student/meal-pass", {
      state: { hotelId: hotel?.id, hotelName: hotel?.name, itemId: item.id, itemName: item.name, itemPrice: item.price },
    });
  };

  const categories = useMemo(
    () => Object.keys(CATEGORY_META).filter((key) => menu.some((m) => m.category === key)),
    [menu]
  );
  const hasUnavailable = useMemo(() => menu.some((m) => !m.available), [menu]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (onlyAvailable && !m.available) return false;
      if (q && !`${m.name} ${m.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menu, query, category, onlyAvailable]);

  const sections = useMemo(
    () =>
      Object.keys(CATEGORY_META)
        .map((key) => ({ key, ...CATEGORY_META[key], data: filtered.filter((m) => m.category === key) }))
        .filter((s) => s.data.length > 0),
    [filtered]
  );

  const filtersActive = query.trim() !== "" || category !== "all" || onlyAvailable;
  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setOnlyAvailable(false);
  };

  // ----- Non-ready states ---------------------------------------------------

  if (state.kind === "loading") {
    return (
      <div className="mv-container sv-page" aria-busy="true" aria-label="Loading the menu">
        <div>
          <h1 className="sv-title">Find your next meal</h1>
          <p className="sv-lede">Getting today's menu…</p>
        </div>
        <div className="mv-skel" style={{ height: 54, borderRadius: 999 }} />
        <div className="sv-menu-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mv-skel sv-skel-meal" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "no-plan") {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Find your next meal</h1>
        <EmptyState icon={<UtensilsCrossed size={30} />} title="No meal plan yet" body={state.message}>
          <PrimaryButton type="button" onPress={() => navigate("/student")} showArrow={false}>
            Choose a hotel
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Find your next meal</h1>
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load the menu" body={state.message}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
            Try again
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  // ----- Ready -----------------------------------------------------------------

  const renderMeal = (item: MenuItem, lead: boolean) => {
    const price = Number(item.price);
    const exceeds = spendableToday !== null && price > spendableToday;
    const unavailable = !item.available;
    const blocked = exceeds || unavailable;
    return (
      <li key={item.id} style={{ listStyle: "none", display: "contents" }}>
        <article className={`sv-meal${lead ? " sv-meal--lead" : ""}`} data-unavailable={unavailable || undefined}>
          <div className="sv-meal-media">
            <FoodImage src={item.image_url} alt={item.name} size={30} fallbackClass="sv-meal-fallback" priority={lead} />
          </div>
          <div className="sv-meal-body">
            <h3 className="sv-meal-name">{item.name}</h3>
            {item.description && <p className="sv-meal-desc">{item.description}</p>}
            {unavailable && (
              <span style={{ alignSelf: "flex-start" }}>
                <StatusBadge tone="bad" label="Unavailable" icon={<CircleSlash size={13} aria-hidden />} />
              </span>
            )}
            {!unavailable && exceeds && <span className="sv-meal-note">More than your balance left today</span>}
            <div className="sv-meal-foot">
              <span className="sv-price">
                <small>KSh</small>
                {formatAmount(price)}
              </span>
              <button
                type="button"
                className="sv-btn"
                data-variant="primary"
                disabled={blocked}
                onClick={() => requestMeal(item)}
                aria-label={blocked ? `${item.name} can't be ordered right now` : `Order ${item.name}`}
              >
                Order
              </button>
            </div>
          </div>
        </article>
      </li>
    );
  };

  return (
    <div className="mv-container sv-page">
      <header className="sv-menu-top">
        <div>
          <h1 className="sv-title">Find your next meal</h1>
          <p className="sv-lede">
            Today's menu at {hotel?.name}. Pick something you like and your meal pass is ready in a few taps.
          </p>
        </div>

        <div className="sv-hotelstrip">
          <span className="sv-pill-inset">
            <Store size={15} aria-hidden />
            {hotel?.name}
          </span>
          {hotel?.location && (
            <span className="sv-pill-inset sv-pill-loc">
              <MapPin size={15} aria-hidden />
              {hotel.location}
            </span>
          )}
          {spendableToday !== null && (
            <span className="sv-pill-inset">
              <Wallet size={15} aria-hidden />
              <b>KSh {formatAmount(spendableToday)}</b> left today
            </span>
          )}
        </div>

        <div className="sv-search" role="search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            className="mv-input-plain"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals and drinks"
            aria-label="Search the menu"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="sv-iconbtn" onClick={() => setQuery("")} aria-label="Clear search" style={{ width: 40, height: 40 }}>
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        {menu.length > 0 && (categories.length > 1 || hasUnavailable) && (
          <div className="sv-scroller" role="group" aria-label="Filter the menu">
            <Chip label="All" active={category === "all"} onPress={() => setCategory("all")} />
            {categories.map((key) => (
              <Chip key={key} label={CATEGORY_META[key].label} active={category === key} onPress={() => setCategory(key)} />
            ))}
            {hasUnavailable && <Chip label="Available now" active={onlyAvailable} onPress={() => setOnlyAvailable((v) => !v)} />}
          </div>
        )}
      </header>

      {menu.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed size={30} />} title="The menu is still empty" body={`${hotel?.name ?? "Your hotel"} hasn't added any meals yet. Check back soon.`} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<SearchX size={30} />} title="No meals match that" body="Try a different word, or clear your filters to see everything.">
          {filtersActive && (
            <PrimaryButton type="button" variant="secondary" showArrow={false} onPress={clearFilters}>
              Clear filters
            </PrimaryButton>
          )}
        </EmptyState>
      ) : (
        <>
          <p className="sv-meta" role="status" aria-live="polite" style={{ margin: "-8px 0 -8px 4px" }}>
            {filtered.length} {filtered.length === 1 ? "meal" : "meals"}
            {filtersActive ? " found" : ""}
          </p>
          {sections.map((section) => (
            <section key={section.key} aria-labelledby={`menu-${section.key}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="sv-h2" id={`menu-${section.key}`}>
                <section.Icon size={18} aria-hidden />
                {section.label}
              </h2>
              <ul className="sv-menu-grid" style={{ margin: 0, padding: 0 }}>
                {section.data.map((item, i) => renderMeal(item, i === 0 && section.data.length >= 3))}
              </ul>
            </section>
          ))}
        </>
      )}

      {hotel && <HotelReviews hotelId={hotel.id} hotelName={hotel.name} />}
    </div>
  );
}
