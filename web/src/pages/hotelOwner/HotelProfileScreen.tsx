import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Landmark, Lock, LocateFixed, MapPin, Phone, Wallet } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelLocationUpdate, updateHotelProfile } from "../../services/hotelStaffApi";
import { getCurrentLocation } from "../../services/locationService";
import {
  AreaField,
  HotelHero,
  MaybeRow,
  Pill,
  ReadRow,
  SectionHead,
  TagEditor,
  TextField,
} from "./profile/ProfileParts";
import {
  FIELD_IDS,
  FIELD_ORDER,
  FieldKey,
  HotelRecord,
  LIMITS,
  PAYMENT_METHOD_LABEL,
  ProfileForm,
  buildUpdate,
  changedFields,
  formFromHotel,
  formatDate,
  formatKsh,
  humanize,
  listingCompleteness,
  paymentSummary,
  registeredArea,
  settlementVerificationMeta,
  validate,
} from "./profile/profileModel";
import "./profile/hotelProfile.css";

/** Folds the PATCH response (the 10 columns it returns) back into the loaded hotel record. */
function mergeUpdate(hotel: HotelRecord, u: HotelLocationUpdate): HotelRecord {
  return {
    ...hotel,
    image_url: u.image_url,
    description: u.description,
    address: u.address,
    helpline: u.helpline,
    opening_hours: u.opening_hours,
    services: u.services,
    latitude: u.latitude,
    longitude: u.longitude,
  };
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Hotel owner's Profile.
 *
 * Editing model: the page IS the form (no separate edit mode). Fields are
 * always editable recessed wells; a sticky bar appears the moment anything
 * differs from what's saved, offering Discard / Save. Only changed fields
 * are sent to PATCH /api/hotel/location, and only changed fields are
 * validated, so an old value on file can never block an unrelated edit.
 *
 * Read-only by design (no owner write path exists on the backend): hotel
 * name, registration/agreement terms and settlement details — these live in
 * the cream "On file" card. MEALVEST's commission is intentionally never
 * shown to hotels (see hotel.controller.ts).
 */
export default function HotelProfileScreen() {
  const { authFetch } = useAuth();

  const [hotel, setHotel] = useState<HotelRecord | null>(null);
  const [base, setBase] = useState<ProfileForm | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchHotelDashboard(authFetch);
      const f = formFromHotel(data.hotel);
      setHotel(data.hotel);
      setBase(f);
      setForm(f);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useMemo(() => (base && form ? changedFields(base, form) : []), [base, form]);
  const errors = useMemo(() => (base && form ? validate(base, form) : {}), [base, form]);
  const dirty = changed.length > 0;
  const errorFor = (k: FieldKey) => (attempted || touched[k] ? errors[k] : undefined);
  const touch = (k: FieldKey) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  // Edits are ignored while a save is in flight so the post-save baseline can't clobber newer typing.
  const patch = useCallback(
    (p: Partial<ProfileForm>) => {
      if (saving) return;
      setForm((f) => (f ? { ...f, ...p } : f));
      setJustSaved(false);
      setSaveError(null);
    },
    [saving]
  );

  // Guard tab close / refresh while edits are unsaved.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // "Saved" confirmation fades after a few seconds (or the moment the owner edits again).
  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 5000);
    return () => window.clearTimeout(t);
  }, [justSaved]);

  const focusField = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView?.({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    (el as HTMLElement).focus({ preventScroll: true });
  };

  const jump = (field: FieldKey | "cover") => {
    if (field === "cover") {
      const btn = document.querySelector<HTMLElement>(".hp-cover-action button");
      btn?.scrollIntoView?.({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      btn?.focus({ preventScroll: true });
      return;
    }
    focusField(FIELD_IDS[field]);
  };

  const handleSave = async () => {
    if (!base || !form || !hotel || saving) return;
    setAttempted(true);
    const errs = validate(base, form);
    const firstBad = FIELD_ORDER.find((k) => errs[k]);
    if (firstBad) {
      const n = Object.keys(errs).length;
      setSaveError(`Fix ${n} ${n === 1 ? "field" : "fields"} before saving.`);
      // The cover link input lives in a closed <details>; open it so the focus target is visible.
      if (firstBad === "imageUrl") (document.querySelector(".hp-adv") as HTMLDetailsElement | null)?.setAttribute("open", "");
      focusField(FIELD_IDS[firstBad]);
      return;
    }
    const body = buildUpdate(base, form);
    if (Object.keys(body).length === 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateHotelProfile(authFetch, body);
      const merged = mergeUpdate(hotel, updated);
      const fresh = formFromHotel(merged);
      setHotel(merged);
      setBase(fresh);
      setForm(fresh);
      setAttempted(false);
      setTouched({});
      setLocNote("");
      setJustSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!base || saving) return;
    setForm(base);
    setAttempted(false);
    setTouched({});
    setSaveError(null);
    setLocNote("");
  };

  const handleLocate = async () => {
    setLocating(true);
    setLocNote("");
    const r = await getCurrentLocation();
    setLocating(false);
    if (r.coords) {
      patch({ latitude: r.coords.latitude.toFixed(6), longitude: r.coords.longitude.toFixed(6) });
      setTouched((t) => ({ ...t, latitude: true, longitude: true }));
      setLocNote("Used this device's current location — make sure you're at your hotel before saving.");
    } else {
      setLocNote(r.message);
    }
  };

  const strength = useMemo(() => (hotel ? listingCompleteness(hotel) : null), [hotel]);

  const barVisible = dirty || saving || justSaved || Boolean(saveError);
  const liveText = saving ? "Saving your changes." : justSaved ? "Changes saved." : "";

  return (
    <div className="hp-page">
      <header className="hp-head">
        <h1 className="hp-title">Profile</h1>
        <p className="hp-subtitle">How your hotel appears to students, and the records MEALVEST holds for you.</p>
      </header>

      <div className="hp-sr-only" role="status" aria-live="polite">
        {liveText}
      </div>

      {loading && (
        <div aria-busy="true" aria-label="Loading your profile">
          <div className="mv-skel" style={{ height: 380, marginBottom: 20 }} />
          <div className="mv-skel" style={{ height: 320 }} />
        </div>
      )}

      {!loading && loadError && (
        <div className="hp-state" role="alert">
          <span>{loadError}</span>
          <button type="button" className="hp-btn" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && hotel && base && form && strength && (
        <>
          <HotelHero
            hotel={hotel}
            authFetch={authFetch}
            imageUrl={form.imageUrl}
            coverUnsaved={changed.includes("imageUrl") && !errors.imageUrl}
            onImageChange={(url) => {
              patch({ imageUrl: url });
              setTouched((t) => ({ ...t, imageUrl: true }));
            }}
            imageError={errorFor("imageUrl")}
            strength={strength}
            onJump={jump}
          />

          <div className="hp-grid">
            <form className="hp-panel" aria-label="Edit hotel profile" noValidate onSubmit={(e) => e.preventDefault()}>
              <section className="hp-section" aria-labelledby="hp-sec-listing">
                <SectionHead
                  id="hp-sec-listing"
                  icon={<FileText size={20} />}
                  title="Public listing"
                  sub="What students read about your hotel."
                />
                <div className="hp-fields">
                  <AreaField
                    id={FIELD_IDS.description}
                    label="About your hotel"
                    value={form.description}
                    onChange={(v) => patch({ description: v })}
                    onBlur={touch("description")}
                    counter={{ value: form.description.trim().length, max: LIMITS.description }}
                    placeholder="What you serve, what makes it good, who it's for…"
                    error={errorFor("description")}
                  />
                  <TagEditor
                    id={FIELD_IDS.services}
                    label="Services"
                    tags={form.services}
                    onChange={(next) => patch({ services: next })}
                    hint="Press Enter or comma after each one — e.g. Dine-in, Takeaway, Vegetarian options."
                    error={errorFor("services")}
                  />
                </div>
              </section>

              <section className="hp-section" aria-labelledby="hp-sec-contact">
                <SectionHead
                  id="hp-sec-contact"
                  icon={<Phone size={20} />}
                  title="Contact & hours"
                  sub="How students reach you and when you're open."
                />
                <div className="hp-fields hp-fields--2">
                  <TextField
                    id={FIELD_IDS.helpline}
                    label="Helpline"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.helpline}
                    onChange={(v) => patch({ helpline: v })}
                    onBlur={touch("helpline")}
                    placeholder="0712 345 678"
                    hint="Separate from the contact phone on your registration."
                    error={errorFor("helpline")}
                  />
                  <TextField
                    id={FIELD_IDS.openingHours}
                    label="Opening hours"
                    value={form.openingHours}
                    onChange={(v) => patch({ openingHours: v })}
                    onBlur={touch("openingHours")}
                    counter={{ value: form.openingHours.trim().length, max: LIMITS.openingHours }}
                    placeholder="Mon–Sat, 7:00 AM – 9:00 PM"
                    error={errorFor("openingHours")}
                  />
                  {(hotel.closing_hours || (hotel.days_open && hotel.days_open.length > 0)) && (
                    <p className="hp-hint hp-span-2" style={{ margin: 0 }}>
                      Registered schedule:{" "}
                      {[
                        hotel.closing_hours ? `closes ${hotel.closing_hours}` : "",
                        hotel.days_open && hotel.days_open.length > 0 ? `open ${hotel.days_open.join(", ")}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      .
                    </p>
                  )}
                </div>
              </section>

              <section className="hp-section" aria-labelledby="hp-sec-location">
                <SectionHead
                  id="hp-sec-location"
                  icon={<MapPin size={20} />}
                  title="Location"
                  sub="Where students find you, and how nearby search places you."
                />
                <div className="hp-fields hp-fields--2">
                  <div className="hp-span-2">
                    <TextField
                      id={FIELD_IDS.address}
                      label="Street address"
                      autoComplete="street-address"
                      value={form.address}
                      onChange={(v) => patch({ address: v })}
                      onBlur={touch("address")}
                      counter={{ value: form.address.trim().length, max: LIMITS.address }}
                      placeholder="Building, street, landmark"
                      error={errorFor("address")}
                    />
                  </div>
                  <TextField
                    id={FIELD_IDS.latitude}
                    label="Latitude"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.latitude}
                    onChange={(v) => patch({ latitude: v })}
                    onBlur={touch("latitude")}
                    placeholder="-0.091702"
                    error={errorFor("latitude")}
                  />
                  <TextField
                    id={FIELD_IDS.longitude}
                    label="Longitude"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.longitude}
                    onChange={(v) => patch({ longitude: v })}
                    onBlur={touch("longitude")}
                    placeholder="34.767956"
                    error={errorFor("longitude")}
                  />
                  <div className="hp-span-2">
                    <div className="hp-coords-actions">
                      <button type="button" className="hp-btn" onClick={handleLocate} disabled={locating || saving}>
                        <LocateFixed size={17} aria-hidden />
                        {locating ? "Locating…" : "Use this device's location"}
                      </button>
                    </div>
                    <p className="hp-hint" role="status" style={{ margin: locNote ? "10px 0 0" : 0 }}>
                      {locNote}
                    </p>
                  </div>
                  <div className="hp-span-2">
                    {hotel.latitude != null && hotel.longitude != null ? (
                      <div className="hp-pin">
                        <CheckCircle2 size={17} color="#6cc152" aria-hidden />
                        <span>Your map pin is set, so students can find you in nearby-hotel search.</span>
                      </div>
                    ) : (
                      <div className="hp-pin">
                        <AlertCircle size={17} color="#F5A623" aria-hidden />
                        <span>No map pin yet. Hotels without coordinates are left out of nearby-hotel search.</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </form>

            <aside className="hp-aside" aria-labelledby="hp-onfile-title">
              <div className="hp-onfile">
                <div className="hp-onfile-head">
                  <span className="hp-onfile-icon" aria-hidden>
                    <Lock size={19} />
                  </span>
                  <div>
                    <h3 className="hp-onfile-title" id="hp-onfile-title">
                      On file with MEALVEST
                    </h3>
                    <p className="hp-onfile-sub">Set during registration. Contact MEALVEST support to change anything here.</p>
                  </div>
                </div>

                <section className="hp-ro-group" aria-label="Business">
                  <h4 className="hp-ro-title">
                    <span>Business</span>
                  </h4>
                  <dl className="hp-ro-list">
                    <ReadRow label="Hotel name">{hotel.name}</ReadRow>
                    <MaybeRow label="Type" value={hotel.business_type ? humanize(hotel.business_type) : ""} />
                    <MaybeRow label="Location" value={hotel.location} />
                    <MaybeRow label="Area" value={registeredArea(hotel)} />
                    <MaybeRow label="Phone" value={hotel.contact_phone} />
                    <MaybeRow label="WhatsApp" value={hotel.whatsapp_number} />
                    <MaybeRow label="Email" value={hotel.contact_email} />
                  </dl>
                </section>

                <section className="hp-ro-group" aria-label="Agreement">
                  <h4 className="hp-ro-title">
                    <span>Agreement</span>
                    <Landmark size={14} aria-hidden />
                  </h4>
                  <dl className="hp-ro-list">
                    <ReadRow label="Registration fee">{formatKsh(hotel.registration_fee)}</ReadRow>
                    <MaybeRow label="Contract starts" value={formatDate(hotel.contract_start_date)} />
                    <MaybeRow label="Contract ends" value={formatDate(hotel.contract_end_date)} />
                    <MaybeRow label="Settlement" value={hotel.settlement_schedule} />
                  </dl>
                </section>

                <SettlementGroup hotel={hotel} />
              </div>
            </aside>
          </div>

          <div className="hp-savebar-wrap">
            {barVisible && (
              <div className="hp-savebar">
                <div
                  className="hp-savebar-msg"
                  data-tone={saveError ? "error" : justSaved && !dirty ? "success" : undefined}
                  role={saveError ? "alert" : undefined}
                >
                  {saveError ? (
                    <>
                      <AlertCircle size={18} aria-hidden style={{ flex: "0 0 auto" }} />
                      <span>{saveError}</span>
                    </>
                  ) : saving ? (
                    <span>Saving your changes…</span>
                  ) : dirty ? (
                    <span>
                      {changed.length} unsaved {changed.length === 1 ? "change" : "changes"}
                    </span>
                  ) : (
                    <>
                      <CheckCircle2 size={18} aria-hidden style={{ flex: "0 0 auto" }} />
                      <span>Saved — students now see your updated profile.</span>
                    </>
                  )}
                </div>
                {(dirty || saving) && (
                  <div className="hp-savebar-actions">
                    <PrimaryButton
                      variant="secondary"
                      type="button"
                      showArrow={false}
                      onPress={handleDiscard}
                      disabled={saving}
                      style={{ width: "auto", minHeight: 46, padding: "0 20px" }}
                    >
                      Discard
                    </PrimaryButton>
                    <PrimaryButton
                      type="button"
                      showArrow={false}
                      onPress={handleSave}
                      loading={saving}
                      disabled={!dirty}
                      style={{ width: "auto", minHeight: 46, padding: "0 24px" }}
                    >
                      Save changes
                    </PrimaryButton>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SettlementGroup({ hotel }: { hotel: HotelRecord }) {
  const method = hotel.payment_method || "";
  const lines = paymentSummary(method, hotel.payment_details ?? null);
  const verification = settlementVerificationMeta(hotel.payment_verification_status);
  return (
    <section className="hp-ro-group" aria-label="Settlement">
      <h4 className="hp-ro-title">
        <span>Settlement</span>
        <Wallet size={14} aria-hidden />
      </h4>
      <dl className="hp-ro-list">
        <ReadRow label="Method">{PAYMENT_METHOD_LABEL[method] || "Not set"}</ReadRow>
        {lines.map((l) => (
          <ReadRow key={l.label} label={l.label}>
            {l.value}
          </ReadRow>
        ))}
        {verification && (
          <ReadRow label="Status">
            <Pill tone={verification.tone} onCream>
              {verification.label}
            </Pill>
          </ReadRow>
        )}
      </dl>
      <p className="hp-note">
        To change your settlement details, contact MEALVEST support — this keeps a verified audit trail for every change, per
        MEALVEST's financial security policy.
      </p>
    </section>
  );
}
