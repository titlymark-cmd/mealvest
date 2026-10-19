import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { Hotel, MenuItem } from "../../services/hotelsApi";
import { formatKsh } from "../shared/format";
import { RatingBadge } from "../student/HotelReviews";

/** Hotel photo with a consistent fallback (initial on a peach tile) for missing OR failing images. */
export function HotelImage({ hotel, eager }: { hotel: Pick<Hotel, "name" | "image_url">; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(hotel.image_url) && !failed;
  return (
    <div className="mvp-himg">
      {showImg ? (
        <img src={hotel.image_url as string} alt="" loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />
      ) : (
        <div className="mvp-himg-fallback" aria-hidden>
          <b>{hotel.name.trim().charAt(0).toUpperCase() || "H"}</b>
        </div>
      )}
    </div>
  );
}

/**
 * Public hotel card. The title is the (single) link and stretches over the
 * whole card, so the card is one big target with one tab stop. Only fields
 * that exist are rendered: no empty rows or "N/A" placeholders.
 */
export function HotelCard({ hotel, preview }: { hotel: Hotel; preview?: MenuItem[] }) {
  return (
    <article className="mvp-hcard">
      <HotelImage hotel={hotel} />
      <div className="mvp-hbody">
        <h3>
          <Link to={`/hotels/${hotel.id}`} className="mvp-hlink">
            {hotel.name}
          </Link>
        </h3>
        {hotel.location && (
          <div className="mvp-hmeta">
            <MapPin size={14} aria-hidden />
            <span>{hotel.location}</span>
          </div>
        )}
        <RatingBadge average={hotel.average_rating} count={hotel.review_count} />
        {hotel.description && <p className="mvp-hdesc">{hotel.description}</p>}
        {preview && preview.length > 0 && (
          <ul className="mvp-hpreview" aria-label={`Menu preview for ${hotel.name}`}>
            {preview.map((m) => (
              <li key={m.id}>
                <span>{m.name}</span>
                <span>{formatKsh(m.price)}</span>
              </li>
            ))}
          </ul>
        )}
        <span className="mvp-hgo" aria-hidden>
          View menu <ArrowRight size={15} />
        </span>
      </div>
    </article>
  );
}
