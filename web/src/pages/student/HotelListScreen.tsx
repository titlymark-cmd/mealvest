import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Check, MapPin, RefreshCw, Search, SearchX, Store, WifiOff, LogOut, X } from "lucide-react";
import { fetchHotels, Hotel } from "../../services/hotelsApi";
import { filterHotels } from "../../services/publicHotels";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/student/ui";
import { HotelImage, RatingLine } from "../../components/student/HotelMedia";
import { PrimaryButton } from "../../components/PrimaryButton";
import "../../styles/onboarding.css";

/**
 * Onboarding stage 1: choose a hotel.
 * Contract preserved from the previous screen: tapping a hotel opens
 * /student/hotels/:id/menu with { hotelName } in router state. When the
 * student comes back from that hotel, `selectedHotelId` in router state marks
 * the hotel they were just looking at so the choice stays visible.
 */
export default function HotelListScreen() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedHotelId: string | undefined = (location.state as any)?.selectedHotelId;

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchHotels()
      .then(setHotels)
      .catch((err) => setError(err.message || "Could not load hotels."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => filterHotels(hotels, query), [hotels, query]);

  return (
    <div className="ob-bg">
      <div className="ob-wrap">
        <header className="ob-head ob-rise">
          <div>
            <h1 className="sv-title">Choose a hotel</h1>
            <p className="sv-lede">Hotels registered with MEALVEST. Open one to see its menu and reviews.</p>
          </div>
          <button type="button" className="mv-iconbtn" onClick={() => logout()} aria-label="Sign out" title="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="ob-toolbar ob-rise">
          <label className="sv-search">
            <Search size={18} aria-hidden="true" />
            <span className="ob-sr">Search hotels by name or location</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or location"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          {!loading && !error && hotels.length > 0 && (
            <p className="ob-count" role="status">
              {visible.length} {visible.length === 1 ? "hotel" : "hotels"}
              {query.trim() ? " match your search" : " available"}
            </p>
          )}
        </div>

        {loading ? (
          <div className="ob-grid" aria-busy="true" role="status">
            <span className="ob-sr">Loading hotels…</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ob-skel-card" aria-hidden="true">
                <div className="mv-skel" />
                <div className="ob-skel-lines">
                  <div className="mv-skel" style={{ width: "70%" }} />
                  <div className="mv-skel" style={{ width: "45%" }} />
                  <div className="mv-skel" style={{ width: "90%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState icon={<WifiOff size={26} />} title="Couldn't load hotels" body={error} role="alert">
            <PrimaryButton onPress={load} icon={<RefreshCw size={18} aria-hidden="true" />} showArrow={false}>
              Try again
            </PrimaryButton>
          </EmptyState>
        ) : hotels.length === 0 ? (
          <EmptyState icon={<Store size={26} />} title="No hotels yet" body="No hotels are registered right now. Please check back soon." />
        ) : visible.length === 0 ? (
          <EmptyState icon={<SearchX size={26} />} title="No hotels match your search" body="Try a different name or location.">
            <PrimaryButton variant="secondary" onPress={() => setQuery("")} icon={<X size={18} aria-hidden="true" />} showArrow={false}>
              Clear search
            </PrimaryButton>
          </EmptyState>
        ) : (
          <ul className="ob-grid">
            {visible.map((hotel) => {
              const selected = hotel.id === selectedHotelId;
              const hasCoords = typeof hotel.latitude === "number" && typeof hotel.longitude === "number";
              return (
                <li key={hotel.id} style={{ display: "flex", minWidth: 0 }}>
                  <article className="ob-hotel ob-rise" data-selected={selected} style={{ width: "100%" }}>
                    <button
                      type="button"
                      className="ob-hotel-main"
                      onClick={() => navigate(`/student/hotels/${hotel.id}/menu`, { state: { hotelName: hotel.name } })}
                      aria-label={`${hotel.name}. View menu and reviews.${selected ? " Last viewed." : ""}`}
                    >
                      <span className="ob-media">
                        <HotelImage src={hotel.image_url} />
                        {selected && (
                          <span className="ob-flag">
                            <Check size={14} aria-hidden="true" /> Last viewed
                          </span>
                        )}
                      </span>
                      <span className="ob-hotel-body">
                        <span className="ob-hotel-name">{hotel.name}</span>
                        {hotel.location && (
                          <span className="ob-meta">
                            <MapPin size={14} aria-hidden="true" />
                            <span>{hotel.location}</span>
                          </span>
                        )}
                        <RatingLine average={hotel.average_rating} count={hotel.review_count} />
                        {hotel.description && <span className="ob-clamp">{hotel.description}</span>}
                        <span className="ob-hotel-cta">
                          <span>View menu &amp; reviews</span>
                          <i aria-hidden="true">
                            <ChevronRight size={18} />
                          </i>
                        </span>
                      </span>
                    </button>
                    {hasCoords && (
                      <a
                        className="ob-maplink"
                        href={`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${hotel.name} on Google Maps (opens in a new tab)`}
                      >
                        <MapPin size={14} aria-hidden="true" />
                        View on Google Maps
                      </a>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
