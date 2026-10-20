import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, CalendarCheck, GraduationCap, PiggyBank, QrCode, RefreshCw, ScanLine, Store, TrendingUp,
  UtensilsCrossed, Wallet, ClipboardList, ShieldCheck, Users,
} from "lucide-react";
import { PublicShell } from "../../components/public/PublicShell";
import { HeroPhoto } from "../../components/public/HeroPhoto";
import { DemoShowcase } from "../../components/public/DemoShowcase";
import { HotelCard } from "../../components/public/HotelCard";
import { Hotel, MenuItem } from "../../services/hotelsApi";
import { loadHotelMenuPreview, loadPublicHotels, pickFeatured } from "../../services/publicHotels";

const STEPS = [
  { icon: Store, title: "Discover participating hotels", body: "Browse the hotels that have joined MEALVEST, with their location and ratings." },
  { icon: UtensilsCrossed, title: "Explore the menu", body: "See each hotel’s available meals and prices before you commit to anything." },
  { icon: Wallet, title: "Choose and fund a meal plan", body: "Pick a plan and pay for it in the app. MEALVEST turns it into a daily amount to eat on." },
  { icon: CalendarCheck, title: "Keep your budget in view", body: "Your home screen shows what you can spend today, and you can add a Meal Boost to your plan if you need more." },
  { icon: QrCode, title: "Redeem with a QR meal pass", body: "Order a meal, then show your QR meal pass at the hotel to redeem it." },
];

export default function LandingPage() {
  useEffect(() => {
    document.title = "MEALVEST — your food money, already planned";
  }, []);

  return (
    <PublicShell>
      <Hero />
      <DemoShowcase />
      <HowItWorks />
      <ParticipatingHotels />
      <WhyMealvest />
    </PublicShell>
  );
}

function Hero() {
  return (
    <section className="mv-container mvp-hero" aria-labelledby="mvp-hero-title">
      <div>
        <h1 id="mvp-hero-title" className="mvp-h1">
          Your food money, <em>already planned.</em>
        </h1>
        <p className="mvp-hero-lead">
          Choose a participating hotel, fund a meal plan, and MEALVEST turns it into a daily amount you can eat on. You redeem each meal with a QR
          meal pass.
        </p>
        <div className="mvp-hero-ctas">
          <Link to="/register/student" className="mvp-cta mvp-cta--primary">
            Create student account <ArrowRight size={18} aria-hidden />
          </Link>
          <Link to="/hotels" className="mvp-cta mvp-cta--secondary">
            Explore hotels
          </Link>
        </div>
        <p className="mvp-hero-aside">
          Run a hotel? <Link to="/register/hotel">Register your hotel</Link>
        </p>
      </div>

      <div className="mvp-heroart">
        <div className="mvp-heroart-plate">
          <HeroPhoto />
        </div>
        <span className="mvp-chip mvp-chip--dark">
          <span className="mvp-chip-ico"><CalendarCheck size={16} aria-hidden /></span>
          A daily amount to eat on
        </span>
        <span className="mvp-chip mvp-chip--cream">
          <span className="mvp-chip-ico"><QrCode size={16} aria-hidden /></span>
          Redeem with a QR meal pass
        </span>
      </div>
    </section>
  );
}

/** Section A — a vertical stepper (numbered rail), sticky intro on wide screens. */
function HowItWorks() {
  return (
    <section className="mvp-section mvp-desktop-only" aria-labelledby="mvp-how-title">
      <div className="mv-container mvp-how">
        <div className="mvp-how-intro">
          <span className="mvp-eyebrow">How it works</span>
          <h2 id="mvp-how-title" className="mvp-h2">From menu to meal in five steps</h2>
          <p className="mvp-lead">This is the journey a student follows in the app today, from finding a hotel to redeeming a meal.</p>
          <div className="mvp-hero-ctas" style={{ marginTop: 24 }}>
            <Link to="/register/student" className="mvp-cta mvp-cta--primary">Create student account</Link>
            <Link to="/hotels" className="mvp-cta mvp-cta--secondary">Browse hotels</Link>
          </div>
        </div>

        <ol className="mvp-steps">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li className="mvp-step" key={title}>
              <span className="mvp-step-num" aria-hidden>{i + 1}</span>
              <div className="mvp-step-card">
                <h3><Icon size={18} aria-hidden /> {title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Section B — real hotels from the public API; menu preview for the featured few. */
function ParticipatingHotels() {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [error, setError] = useState(false);
  const [previews, setPreviews] = useState<Record<string, MenuItem[]>>({});

  const load = useCallback((force = false) => {
    setError(false);
    setHotels(null);
    loadPublicHotels(force).then(setHotels).catch(() => setError(true));
  }, []);
  useEffect(() => load(), [load]);

  const featured = useMemo(() => (hotels ? pickFeatured(hotels) : []), [hotels]);

  useEffect(() => {
    let cancelled = false;
    featured.forEach((h) => {
      loadHotelMenuPreview(h.id)
        .then((items) => !cancelled && setPreviews((p) => ({ ...p, [h.id]: items })))
        .catch(() => {
          /* a missing preview just means a card without one — never fake data */
        });
    });
    return () => {
      cancelled = true;
    };
  }, [featured]);

  return (
    <section className="mvp-section" aria-labelledby="mvp-hotels-title">
      <div className="mv-container">
        <div className="mvp-shelf-head">
          <div>
            <span className="mvp-eyebrow">Participating hotels</span>
            <h2 id="mvp-hotels-title" className="mvp-h2">Where you can eat</h2>
          </div>
          <Link to="/hotels" className="mvp-cta mvp-cta--secondary mvp-cta--sm">
            View all hotels <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        {hotels === null && !error && (
          <div className="mvp-shelf" aria-busy="true" aria-label="Loading hotels">
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
            <h2>No hotels yet</h2>
            <p>Hotels appear here once they have joined and been approved. Run one? You can apply today.</p>
            <Link to="/register/hotel" className="mvp-cta mvp-cta--primary">Register a hotel</Link>
          </div>
        )}

        {hotels && hotels.length > 0 && (
          <div className="mvp-shelf">
            {featured.map((h) => <HotelCard key={h.id} hotel={h} preview={previews[h.id]} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/** Section C — two asymmetric panels: students (peach, raised) and hotels (coffee, inset). */
function WhyMealvest() {
  return (
    <section className="mvp-section" aria-labelledby="mvp-why-title">
      <div className="mv-container">
        <span className="mvp-eyebrow">Why MEALVEST</span>
        <h2 id="mvp-why-title" className="mvp-h2" style={{ marginBottom: 26, maxWidth: 640 }}>
          Clearer spending for students. A steady network for hotels.
        </h2>

        <div className="mvp-why">
          <div className="mvp-panel mvp-panel--student">
            <GraduationCap size={30} aria-hidden color="#E5482E" />
            <h3>For students</h3>
            <p>Know what you can spend on food each day, and eat at hotels that take part.</p>
            <ul className="mvp-benefits">
              <Benefit icon={TrendingUp}>A plan is spread into a daily amount, so your money is paced across the whole plan.</Benefit>
              <Benefit icon={PiggyBank}>On plans that allow it, an unspent daily amount can carry over.</Benefit>
              <Benefit icon={Wallet}>Need more? Add a Meal Boost to your current plan.</Benefit>
              <Benefit icon={QrCode}>Redeem meals with a QR meal pass and review your orders in the app.</Benefit>
            </ul>
            <div className="mvp-panel-actions">
              <Link to="/register/student" className="mvp-cta mvp-cta--primary">Create student account</Link>
              <Link to="/login" className="mvp-cta mvp-cta--ghost">Login</Link>
            </div>
          </div>

          <div className="mvp-panel mvp-panel--hotel">
            <Building2 size={30} aria-hidden color="#F5A623" />
            <h3>For hotels</h3>
            <p>Join the MEALVEST network and manage student meals from one place.</p>
            <ul className="mvp-benefits">
              <Benefit icon={ScanLine}>Scan and redeem student QR meal passes.</Benefit>
              <Benefit icon={ClipboardList}>Manage your menu and see your orders.</Benefit>
              <Benefit icon={Users}>Give your staff their own accounts.</Benefit>
              <Benefit icon={ShieldCheck}>Applications are reviewed before a hotel is listed, and payouts are verified first.</Benefit>
            </ul>
            <Link to="/register/hotel" className="mvp-cta mvp-cta--secondary">Register a hotel</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefit({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>; children: React.ReactNode }) {
  return (
    <li>
      <span className="mvp-ico"><Icon size={17} aria-hidden /></span>
      <span>{children}</span>
    </li>
  );
}