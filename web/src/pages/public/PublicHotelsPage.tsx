import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search, Store, X } from "lucide-react";
import { PublicShell } from "../../components/public/PublicShell";
import { HotelCard } from "../../components/public/HotelCard";
import { Hotel } from "../../services/hotelsApi";
import { filterHotels, loadPublicHotels } from "../../services/publicHotels";

/**
 * Public hotel discovery. Data: GET /api/hotels, which already returns only
 * ACTIVE hotels (pending/rejected/suspended are never sent) and no private
 * fields. The backend has no search parameter, and the dataset is a list of
 * partner hotels, so name/location/description filtering is done client-side.
 */
export default function PublicHotelsPage() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "Participating hotels — MEALVEST";
  }, []);

  const load = useCallback((force = false) => {
    setError(false);
    setHotels(null);
    loadPublicHotels(force).then(setHotels).catch(() => setError(true));
  }, []);
  useEffect(() => load(), [load]);

  const shown = useMemo(() => (hotels ? filterHotels(hotels, query) : []), [hotels, query]);
  const searching = query.trim().length > 0;

  return (
    <PublicShell>
      <div className="mv-container">
        <header className="mvp-pagehead">
          <span className="mvp-eyebrow">Hotels</span>
          <h1 className="mvp-h2" style={{ fontSize: "clamp(30px, 6vw, 46px)" }}>Hotels on MEALVEST</h1>
          <p className="mvp-lead">Browse the participating hotels and see what’s on their menus. Menus are for browsing: to order you’ll need a student account and a plan.</p>

          {hotels && hotels.length > 0 && (
            <div className="mvp-search" role="search">
              <Search size={18} className="mvp-search-ico" aria-hidden />
              <label htmlFor="mvp-hotel-search" className="mvp-visually-hidden">Search hotels by name or location</label>
              <input
                id="mvp-hotel-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Search by name or location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {searching && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={18} aria-hidden />
                </button>
              )}
            </div>
          )}
          {hotels && hotels.length > 0 && (
            <p className="mvp-count" role="status" aria-live="polite">
              {searching ? `${shown.length} of ${hotels.length} hotel${hotels.length === 1 ? "" : "s"}` : `${hotels.length} hotel${hotels.length === 1 ? "" : "s"}`}
            </p>
          )}
        </header>

        {hotels === null && !error && (
          <div className="mvp-hotels-grid" aria-busy="true" aria-label="Loading hotels">
            {[0, 1, 2].map((i) => <div key={i} className="mv-skel mvp-skel-card" />)}
          </div>
        )}

        {error && (
          <div className="mvp-state" role="alert">
            <div className="mvp-state-ico"><RefreshCw size={24} aria-hidden /></div>
            <h2>We couldn’t load the hotels</h2>
            <p>Check your connection and try again.</p>
            <button type="button" className="mvp-cta mvp-cta--primary" onClick={() => load(true)}>Try again</button>
          </div>
        )}

        {hotels && hotels.length === 0 && (
          <div className="mvp-state">
            <div className="mvp-state-ico"><Store size={24} aria-hidden /></div>
            <h2>No participating hotels yet</h2>
            <p>Hotels appear here once they have joined MEALVEST and been approved. Run a hotel? You can apply now.</p>
            <Link to="/register/hotel" className="mvp-cta mvp-cta--primary">Register a hotel</Link>
          </div>
        )}

        {hotels && hotels.length > 0 && shown.length === 0 && (
          <div className="mvp-state">
            <div className="mvp-state-ico"><Search size={24} aria-hidden /></div>
            <h2>No hotels match “{query.trim()}”</h2>
            <p>Try a different name or location.</p>
            <button type="button" className="mvp-cta mvp-cta--secondary" onClick={() => setQuery("")}>Clear search</button>
          </div>
        )}

        {shown.length > 0 && (
          <div className="mvp-hotels-grid" style={{ paddingBottom: 24 }}>
            {shown.map((h) => <HotelCard key={h.id} hotel={h} />)}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
