import React, { useState } from "react";
import { MapPin, Plus, X, ImagePlus } from "lucide-react";
import { ImageUploadField } from "../../../components/ImageUploadField";
import {
  CompletenessItem,
  FieldKey,
  FIELD_IDS,
  HotelRecord,
  LIMITS,
  Tone,
  accountStatusMeta,
  humanize,
  tagKey,
} from "./profileModel";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function Pill({ tone, children, onCream }: { tone: Tone; children: React.ReactNode; onCream?: boolean }) {
  return (
    <span className={`hp-pill${onCream ? " hp-pill--cream" : ""}`} data-tone={tone}>
      {children}
    </span>
  );
}

export function SectionHead({ icon, title, sub, id }: { icon: React.ReactNode; title: string; sub: string; id: string }) {
  return (
    <div className="hp-sec-head">
      <span className="hp-sec-icon" aria-hidden>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <h3 className="hp-sec-title" id={id}>
          {title}
        </h3>
        <p className="hp-sec-sub">{sub}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

interface ShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  counter?: { value: number; max: number };
  children: React.ReactNode;
}

/** aria-describedby for a control: its hint/error message and its character counter, when present. */
function describedBy(id: string, hasMessage: boolean, hasCounter: boolean): string | undefined {
  const ids = [hasMessage ? `${id}-msg` : "", hasCounter ? `${id}-count` : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function Shell({ id, label, hint, error, counter, children }: ShellProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="hp-label">
        <label htmlFor={id}>{label}</label>
        {counter && (
          <span className="hp-count" id={`${id}-count`} data-over={counter.value > counter.max || undefined}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="hp-error" id={`${id}-msg`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hp-hint" id={`${id}-msg`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputExtras = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "className" | "style">;

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  counter,
  ...rest
}: Omit<ShellProps, "children"> & { value: string; onChange: (v: string) => void } & InputExtras) {
  return (
    <Shell id={id} label={label} hint={hint} error={error} counter={counter}>
      <input
        id={id}
        className="hp-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error || hint), Boolean(counter))}
        {...rest}
      />
    </Shell>
  );
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  counter,
  placeholder,
}: Omit<ShellProps, "children"> & { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <Shell id={id} label={label} hint={hint} error={error} counter={counter}>
      <textarea
        id={id}
        className="hp-control"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error || hint), Boolean(counter))}
      />
    </Shell>
  );
}

/**
 * Services as chips. Enter or comma adds; leaving the field with text in it
 * adds that text too, so typed-but-uncommitted text is never silently lost on save.
 */
export function TagEditor({
  id,
  label,
  tags,
  onChange,
  hint,
  error,
}: {
  id: string;
  label: string;
  tags: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const full = tags.length >= LIMITS.services;

  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setDraft("");
      return;
    }
    const next = [...tags];
    const skipped: string[] = [];
    for (const p of parts) {
      if (next.length >= LIMITS.services) {
        setNote(`You can list up to ${LIMITS.services} services.`);
        break;
      }
      if (next.some((t) => tagKey(t) === tagKey(p))) skipped.push(p);
      else next.push(p);
    }
    setNote(skipped.length ? `“${skipped[0]}” is already in your list.` : "");
    setDraft("");
    if (next.length !== tags.length) onChange(next);
  };

  return (
    <Shell
      id={id}
      label={label}
      hint={hint}
      error={error}
      counter={{ value: tags.length, max: LIMITS.services }}
    >
      {tags.length > 0 && (
        <ul className="hp-tags" aria-label="Listed services">
          {tags.map((t, i) => (
            <li className="hp-tag" key={`${tagKey(t)}-${i}`}>
              <span>{t}</span>
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                <X size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="hp-tag-row">
        <input
          id={id}
          className="hp-control"
          value={draft}
          maxLength={LIMITS.serviceLength}
          disabled={full}
          placeholder={full ? "Service limit reached" : "e.g. Dine-in, Takeaway"}
          onChange={(e) => {
            setDraft(e.target.value);
            if (note) setNote("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            }
          }}
          onBlur={() => commit(draft)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(error || hint), true)}
          autoComplete="off"
        />
        <button type="button" className="hp-btn" aria-label="Add service" disabled={full || !draft.trim()} onClick={() => commit(draft)}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
      <p className="hp-hint" role="status" style={{ minHeight: note ? undefined : 0, margin: note ? "8px 0 0" : 0 }}>
        {note}
      </p>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Read-only rows (cream card)
// ---------------------------------------------------------------------------

export function ReadRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hp-ro-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Renders a row only when it has a value — empty registration fields don't produce blank lines. */
export function MaybeRow({ label, value }: { label: string; value: string | null | undefined }) {
  const v = (value ?? "").trim();
  return v ? <ReadRow label={label}>{v}</ReadRow> : null;
}

// ---------------------------------------------------------------------------
// Identity hero
// ---------------------------------------------------------------------------

export function HotelHero({
  hotel,
  authFetch,
  imageUrl,
  coverUnsaved,
  onImageChange,
  imageError,
  strength,
  onJump,
}: {
  hotel: HotelRecord;
  authFetch: AuthFetch;
  imageUrl: string;
  coverUnsaved: boolean;
  onImageChange: (url: string) => void;
  imageError?: string;
  strength: { items: CompletenessItem[]; done: number; total: number };
  onJump: (field: FieldKey | "cover") => void;
}) {
  const status = accountStatusMeta(hotel.status);
  const place = (hotel.location || "").trim();
  const missing = strength.items.filter((i) => !i.done);
  const shownUrl = imageUrl.trim();

  return (
    <section className="hp-hero" aria-labelledby="hp-hotel-name">
      <div className="hp-cover">
        {shownUrl ? (
          <img src={shownUrl} alt={`${hotel.name} cover`} />
        ) : (
          <div className="hp-cover-fallback">
            <span className="hp-monogram" aria-hidden>
              {hotel.name.trim().charAt(0).toUpperCase() || "M"}
            </span>
            <p>No cover photo yet — students see this card on the hotel list.</p>
          </div>
        )}
        {coverUnsaved && <span className="hp-cover-flag">New cover — save to publish</span>}
      </div>

      <div className="hp-identity">
        <div className="hp-id-text">
          <span className="hp-eyebrow">Your hotel</span>
          <h2 className="hp-name" id="hp-hotel-name">
            {hotel.name}
          </h2>
          <div className="hp-meta">
            <Pill tone={status.tone}>{status.label}</Pill>
            {place && (
              <span className="hp-meta-item">
                <MapPin size={15} aria-hidden /> {place}
              </span>
            )}
            {hotel.business_type && <span className="hp-meta-item">{humanize(hotel.business_type)}</span>}
          </div>
        </div>
        <div className="hp-cover-action">
          <ImageUploadField
            authFetch={authFetch}
            value={imageUrl}
            onChange={onImageChange}
            label="Upload cover photo"
            hidePreview
            compact
            tone="dark"
          />
        </div>
      </div>

      <details className="hp-adv" open={Boolean(imageError) || undefined}>
        <summary>Use an image link instead</summary>
        <div className="hp-adv-body">
          <TextField
            id={FIELD_IDS.imageUrl}
            label="Cover image link"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://…"
            value={imageUrl}
            onChange={onImageChange}
            error={imageError}
            hint="Only photos uploaded through MEALVEST, or links from approved image hosts, are accepted."
          />
        </div>
      </details>

      <div className="hp-strength">
        <div className="hp-strength-head">
          <span>What students see right now</span>
          <small>
            {strength.done} of {strength.total} details
          </small>
        </div>
        <ul className="hp-meter" aria-hidden>
          {strength.items.map((i) => (
            <li key={i.key} data-on={i.done} />
          ))}
        </ul>
        {missing.length > 0 ? (
          <ul className="hp-todos" aria-label="Details to add">
            {missing.map((i) => (
              <li key={i.key}>
                <button type="button" className="hp-todo" onClick={() => onJump(i.field)}>
                  {i.field === "cover" ? <ImagePlus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                  {i.cta}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-hint" style={{ marginTop: 12 }}>
            Your listing is complete.
          </p>
        )}
      </div>
    </section>
  );
}
