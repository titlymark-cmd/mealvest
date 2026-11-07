import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Camera, MapPin, Star, Store, Trophy, Users, Vote, CheckCircle2, ImageIcon, RefreshCw,
} from "lucide-react";
import { PublicShell } from "../../components/public/PublicShell";
import heroBg from "../../assets/hotel-vote-hero.webp";
import { useWindowSize } from "../../hooks/useWindowSize";
import {
  castVote, loadVotableHotels, loadVoteStats, VotableHotel, VoteStats,
} from "../../services/votingApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CAROUSEL = 8;

/** Resize a chosen image to a small square-ish avatar data URL (keeps the DB row tiny). */
function fileToAvatarDataUrl(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not process this image."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image."));
    };
    img.src = url;
  });
}

function StarRow({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="mvv-lb-stars" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={13} aria-hidden fill={n <= rounded ? "#ffcf5c" : "none"} color="#ffcf5c" />
      ))}
      <span style={{ marginLeft: 2 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export default function VotingPage() {
  const { width } = useWindowSize();
  const [hotels, setHotels] = useState<VotableHotel[] | null>(null);
  const [votesPublic, setVotesPublic] = useState(true);
  const [stats, setStats] = useState<VoteStats | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [selected, setSelected] = useState<VotableHotel | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Vote for your hotel — MEALVEST";
  }, []);

  const load = useCallback(() => {
    setLoadError(false);
    setHotels(null);
    Promise.all([loadVotableHotels(), loadVoteStats().catch(() => null)])
      .then(([list, s]) => {
        setHotels(list.hotels);
        setVotesPublic(list.votesPublic);
        if (s) setStats(s);
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => load(), [load]);

  const carouselHotels = useMemo(() => (hotels ?? []).slice(0, MAX_CAROUSEL), [hotels]);

  // Ring geometry: radius large enough that N cards never overlap.
  const cardW = width < 600 ? 160 : 190;
  const n = carouselHotels.length;
  const radius = n > 1 ? Math.round(Math.max(width < 600 ? 170 : 210, cardW / 2 / Math.tan(Math.PI / n))) : 0;

  const choose = (h: VotableHotel) => {
    setSelected(h);
    setDone(false);
    setError("");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setAvatar(await fileToAvatarDataUrl(f));
    } catch {
      setError("That image could not be used. Try another one.");
    }
  };

  const canSubmit =
    !!selected && name.trim().length > 1 && phone.trim().length >= 7 && EMAIL_RE.test(email.trim()) && !submitting;

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await castVote({
        hotelId: selected.id,
        voterName: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        profilePicture: avatar || null,
      });
      setDone(true);
      load(); // refresh counts + leaderboard
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your vote could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  };

  const leaderboard = hotels ?? [];

  return (
    <PublicShell>
      <div className="mv-container">
        {/* ---------- Hero with rotating carousel ---------- */}
        <section className="mvv-hero" aria-labelledby="mvv-title">
          <div className="mvv-hero-bg" style={{ backgroundImage: `url(${heroBg})` }} aria-hidden />
          <span className="mvv-hero-badge"><Vote size={14} aria-hidden /> Hotel voting</span>
          <h1 id="mvv-title">Vote your favourite hotel onto MEALVEST</h1>
          <p className="mvv-hero-lead">
            Tap a hotel to vote. Add your name, phone, email and a photo — when your hotel reaches enough votes and
            partners with MEALVEST, you’ll be the first to know.
          </p>

          {hotels === null && !loadError && (
            <p className="mvv-hint" aria-busy="true">Loading hotels…</p>
          )}
          {loadError && (
            <div style={{ marginTop: 18 }}>
              <button type="button" className="mvp-cta mvp-cta--primary" onClick={load}>
                <RefreshCw size={16} aria-hidden /> Try again
              </button>
            </div>
          )}
          {hotels && carouselHotels.length === 0 && !loadError && (
            <p className="mvv-hint">No hotels are open for voting yet. Check back soon.</p>
          )}

          {carouselHotels.length > 0 && (
            <>
              <div className="mvv-stage" aria-label="Rotating hotels — tap one to vote">
                <div className="mvv-carousel">
                  {carouselHotels.map((h, i) => {
                    const angle = (360 / n) * i;
                    const rating = h.average_rating != null ? Number(h.average_rating) : 0;
                    return (
                      <button
                        type="button"
                        key={h.id}
                        className={`mvv-card${selected?.id === h.id ? " is-selected" : ""}`}
                        style={{ transform: `rotateY(${angle}deg) translateZ(${radius}px)` }}
                        onClick={() => choose(h)}
                        aria-label={`Vote for ${h.name}`}
                      >
                        {h.image_url ? (
                          <img className="mvv-card-img" src={h.image_url} alt="" loading="lazy" />
                        ) : (
                          <span className="mvv-card-img mvv-card-img--placeholder"><Store size={26} aria-hidden /></span>
                        )}
                        <span className="mvv-card-name">{h.name}</span>
                        <span className="mvv-card-loc"><MapPin size={12} aria-hidden /> {h.location || "—"}</span>
                        <span className="mvv-card-meta">
                          <span className="mvv-card-votes">
                            {h.vote_count != null ? `${h.vote_count} vote${h.vote_count === 1 ? "" : "s"}` : "Votes hidden"}
                          </span>
                          {rating > 0 && <span className="mvv-card-stars"><Star size={12} fill="#c98a00" aria-hidden /> {rating.toFixed(1)}</span>}
                        </span>
                        <span className="mvv-card-vote">Vote</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mvv-hint">Tap a card to pick your hotel — the ring pauses when you hover.</p>
            </>
          )}
        </section>

        {/* ---------- Vote form ---------- */}
        <div className="mvv-formwrap" ref={formRef}>
          <h2>Cast your vote</h2>
          <p className="mvv-sub">Just your name, phone, email and a photo. One vote per phone number.</p>

          {selected ? (
            <div className="mvv-chosen">
              <Vote size={18} aria-hidden />
              <span>Voting for <strong>{selected.name}</strong>{selected.location ? ` · ${selected.location}` : ""}</span>
            </div>
          ) : (
            <div className="mvv-chosen" style={{ background: "rgba(255,225,199,0.06)", borderColor: "rgba(255,225,199,0.18)" }}>
              <Store size={18} aria-hidden />
              <span>Pick a hotel from the ring above to vote for it.</span>
            </div>
          )}

          {error && <div className="mvv-alert mvv-alert--err" role="alert">{error}</div>}

          {done ? (
            <div className="mvv-alert mvv-alert--ok" role="status">
              <CheckCircle2 size={18} aria-hidden style={{ verticalAlign: "-3px", marginRight: 6 }} />
              Vote recorded! Your profile is pending until the hotel partners. We’ll reach you on the phone and email you gave.
              <div style={{ marginTop: 12 }}>
                <Link to="/register/student" className="mvp-cta mvp-cta--primary mvp-cta--sm">
                  Create a student account <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mvv-field">
                <label htmlFor="mvv-name">Full name</label>
                <input id="mvv-name" className="mvv-input" type="text" placeholder="e.g. Amina Otieno"
                  value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div className="mvv-field">
                <label htmlFor="mvv-phone">Phone number</label>
                <input id="mvv-phone" className="mvv-input" type="tel" placeholder="+2547XXXXXXXX"
                  value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
              </div>
              <div className="mvv-field">
                <label htmlFor="mvv-email">Email</label>
                <input id="mvv-email" className="mvv-input" type="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
              </div>
              <div className="mvv-field">
                <label>Profile photo (optional)</label>
                <div className="mvv-avatarrow">
                  {avatar
                    ? <img className="mvv-avatar" src={avatar} alt="Your profile preview" />
                    : <span className="mvv-avatar mvv-avatar--empty"><Camera size={22} aria-hidden /></span>}
                  <label className="mvv-filebtn">
                    <ImageIcon size={16} aria-hidden /> {avatar ? "Change photo" : "Add photo"}
                    <input type="file" accept="image/*" onChange={onFile} />
                  </label>
                </div>
              </div>
              <button type="button" className="mvv-submit" disabled={!canSubmit} onClick={submit}>
                {submitting ? "Recording your vote…" : selected ? `Vote for ${selected.name}` : "Pick a hotel to vote"}
              </button>
            </>
          )}
        </div>

        {/* ---------- Leaderboard ---------- */}
        <section className="mvv-lb" aria-labelledby="mvv-lb-title">
          <div className="mvv-lb-head">
            <span className="mvp-eyebrow"><Trophy size={14} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} /> Leaderboard</span>
            <h2 id="mvv-lb-title">Hotel standings</h2>
            <p>Ranked by votes, then star rating. Partnered hotels are already live on MEALVEST.</p>
          </div>

          <div className="mvv-stats">
            <div className="mvv-stat">
              <div className="mvv-stat-num">{votesPublic ? (stats?.total_votes ?? "—") : "—"}</div>
              <div className="mvv-stat-label"><Vote size={12} aria-hidden /> Total votes</div>
            </div>
            <div className="mvv-stat">
              <div className="mvv-stat-num">{leaderboard.length}</div>
              <div className="mvv-stat-label"><Store size={12} aria-hidden /> Hotels listed</div>
            </div>
            <div className="mvv-stat">
              <div className="mvv-stat-num">{votesPublic ? (stats?.hotels_with_votes ?? "—") : "—"}</div>
              <div className="mvv-stat-label"><Users size={12} aria-hidden /> With votes</div>
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="mvp-state">
              <div className="mvp-state-ico"><Store size={24} aria-hidden /></div>
              <h2>No hotels yet</h2>
              <p>Hotels appear here as soon as voting opens.</p>
            </div>
          ) : (
            <div className="mvv-lb-list">
              {leaderboard.map((h, i) => {
                const rating = h.average_rating != null ? Number(h.average_rating) : 0;
                return (
                  <div className="mvv-lb-row" key={h.id}>
                    <div className="mvv-lb-rank">{i + 1}</div>
                    {h.image_url
                      ? <img className="mvv-lb-banner" src={h.image_url} alt="" loading="lazy" />
                      : <span className="mvv-lb-banner mvv-lb-banner--empty"><Store size={18} aria-hidden /></span>}
                    <div>
                      <div className="mvv-lb-name">
                        {h.name}
                        {h.status === "active" && <span className="mvv-tag-partner">PARTNER</span>}
                      </div>
                      <div className="mvv-lb-sub">
                        <span><MapPin size={12} aria-hidden style={{ verticalAlign: "-2px" }} /> {h.location || "Location pending"}</span>
                        {rating > 0 && <StarRow rating={rating} />}
                        {h.review_count > 0 && <span>{h.review_count} review{h.review_count === 1 ? "" : "s"}</span>}
                      </div>
                    </div>
                    <div className="mvv-lb-votes">
                      {h.vote_count != null ? (
                        <>
                          <b>{h.vote_count}</b>
                          <span>vote{h.vote_count === 1 ? "" : "s"}</span>
                        </>
                      ) : (
                        <span>Hidden</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PublicShell>
  );
}
