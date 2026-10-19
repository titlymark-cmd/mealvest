import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Store, UserRound, Landmark, KeyRound, ListChecks, Trash2 } from "lucide-react";
import { COLORS, FONTS, NEU, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError, SettlementInput } from "../services/authApi";
import { WizardFrame } from "../components/ui/WizardFrame";
import { Field } from "../components/ui/Field";
import { PasswordField } from "../components/ui/PasswordField";
import { Chip } from "../components/ui/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { Errors, hasErrors, validators } from "../utils/validators";
import { clearDraft, loadDraft, saveDraft } from "../utils/formDraft";

const DRAFT_KEY = "mealvest_draft_hotel_v1";
const STEPS = ["Before you start", "Your business", "Owner & contact", "How you get paid", "Secure your account", "Review"];

const BUSINESS_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafeteria", label: "Cafeteria" },
  { value: "canteen", label: "Canteen" },
  { value: "food_kiosk", label: "Food Kiosk" },
  { value: "cafe", label: "Café" },
];

type Method = SettlementInput["method"];
interface PField {
  key: string;
  label: string;
  inputMode?: "numeric" | "tel";
  minLen?: number;
  optional?: boolean;
  phone?: boolean;
}

// Field sets mirror server/src/schemas/settlementMethodSchema.ts exactly.
const METHODS: { value: Method; label: string; fields: PField[]; note?: string }[] = [
  { value: "mpesa_till", label: "M-Pesa Till", fields: [{ key: "tillNumber", label: "Till number", inputMode: "numeric" }, { key: "tillName", label: "Name registered on the till" }] },
  {
    value: "paybill",
    label: "Paybill",
    fields: [{ key: "paybillNumber", label: "Paybill number", inputMode: "numeric" }, { key: "accountNumber", label: "Account number" }, { key: "paybillBusinessName", label: "Business name registered on the paybill" }],
  },
  {
    value: "send_money",
    label: "Send Money",
    fields: [{ key: "phoneNumber", label: "M-Pesa phone number to receive payments", inputMode: "tel", phone: true }, { key: "accountHolderName", label: "Name on that M-Pesa account" }],
    note: "This number must belong to you or an authorized person at your business — we'll confirm this before activating payouts.",
  },
  {
    value: "pochi_la_biashara",
    label: "Pochi la Biashara",
    fields: [{ key: "pochiPhoneNumber", label: "Pochi la Biashara phone number", inputMode: "tel", phone: true }, { key: "businessAccountName", label: "Business account name" }, { key: "registeredName", label: "Registered name" }],
  },
  {
    value: "bank",
    label: "Bank Account",
    fields: [{ key: "bankName", label: "Bank name" }, { key: "accountName", label: "Account name" }, { key: "accountNumber", label: "Account number", inputMode: "numeric" }, { key: "branch", label: "Branch (optional)", optional: true }],
  },
];

interface DraftData {
  hotelName: string;
  businessType: string;
  location: string;
  contactFullName: string;
  email: string;
  phoneNumber: string;
  method: Method;
}

/**
 * Hotel registration as guided onboarding. Same single registerHotel()
 * request and payload as before — the steps only organise the fields.
 *
 * Resume: a local, per-device draft of the NON-sensitive fields (business,
 * owner, contact, chosen payout method). Passwords, PINs and payout
 * identifiers are never persisted, so those are re-entered on resume.
 */
export function HotelSignupWizard({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { registerHotel } = useAuth();
  const draft = useMemo(() => loadDraft<DraftData>(DRAFT_KEY), []);
  const d = draft?.data;

  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [hotelName, setHotelName] = useState(d?.hotelName ?? "");
  const [businessType, setBusinessType] = useState(d?.businessType ?? "hotel");
  const [location, setLocation] = useState(d?.location ?? "");
  const [contactFullName, setContactFullName] = useState(d?.contactFullName ?? "");
  const [email, setEmail] = useState(d?.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(d?.phoneNumber ?? "");
  const [method, setMethod] = useState<Method>(d?.method ?? "mpesa_till");
  const [payout, setPayout] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(Boolean(draft && draft.data.hotelName));

  useEffect(() => {
    if (hotelName || contactFullName || email || phoneNumber) {
      saveDraft<DraftData>(DRAFT_KEY, step, { hotelName, businessType, location, contactFullName, email, phoneNumber, method });
    }
  }, [hotelName, businessType, location, contactFullName, email, phoneNumber, method, step]);

  const methodDef = METHODS.find((m) => m.value === method)!;
  const pv = (k: string) => payout[`${method}.${k}`] ?? "";

  const errors: Errors = (() => {
    switch (step) {
      case 2:
        return { hotelName: validators.required(hotelName, "Enter your business name.") };
      case 3:
        return { contactFullName: validators.required(contactFullName, "Enter the owner's full name."), email: validators.email(email), phone: validators.phone(phoneNumber) };
      case 4: {
        const out: Errors = {};
        methodDef.fields.forEach((f) => {
          if (f.optional) return;
          out[f.key] = f.phone ? validators.phone(pv(f.key), "M-Pesa phone number") : validators.required(pv(f.key), "This detail is required.");
        });
        return out;
      }
      case 5:
        return { password: validators.password(password), pin: validators.pin(pin) };
      default:
        return {};
    }
  })();

  const go = (n: number, direction: "fwd" | "back") => {
    setDir(direction);
    setShowErrors(false);
    setError(null);
    setStep(n);
  };

  const buildSettlement = (): SettlementInput => {
    const v = pv;
    switch (method) {
      case "mpesa_till":
        // The login phone doubles as the M-Pesa-registered number (as before).
        return { method, tillNumber: v("tillNumber"), tillName: v("tillName"), registeredPhoneNumber: phoneNumber };
      case "paybill":
        return { method, paybillNumber: v("paybillNumber"), accountNumber: v("accountNumber"), paybillBusinessName: v("paybillBusinessName"), registeredPhoneNumber: phoneNumber };
      case "send_money":
        return { method, phoneNumber: v("phoneNumber"), accountHolderName: v("accountHolderName") };
      case "pochi_la_biashara":
        return { method, pochiPhoneNumber: v("pochiPhoneNumber"), businessAccountName: v("businessAccountName"), registeredName: v("registeredName") };
      case "bank":
        return { method, bankName: v("bankName"), accountName: v("accountName"), accountNumber: v("accountNumber"), branch: v("branch") || undefined };
    }
  };

  const next = async () => {
    if (step < 6) {
      if (hasErrors(errors)) return setShowErrors(true);
      return go(step + 1, "fwd");
    }
    setError(null);
    setLoading(true);
    try {
      await registerHotel({ email: email.trim(), phoneNumber, password, pin, hotelName, businessType, location, contactFullName, settlement: buildSettlement() });
      clearDraft(DRAFT_KEY);
    } catch (err) {
      // Everything entered is kept in state, so they can fix and retry.
      setError(err instanceof ApiError ? err.message : "We couldn't submit your registration. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const e = (k: string) => (showErrors ? errors[k] : null);
  const mask = (s: string) => (s.length > 4 ? "•".repeat(s.length - 4) + s.slice(-4) : s);

  const headings = [
    "Register your business on MEALVEST",
    "Tell us about your business",
    "Who should we contact?",
    "How do you get paid?",
    "Secure your account",
    "Review and submit",
  ];
  const intros = [
    "It takes about five minutes. Here's what you'll need.",
    "This is how students will find and recognise you.",
    "The owner or authorised person who manages this account.",
    "Choose where MEALVEST should send your payouts.",
    "You'll use these to sign in and unlock the app.",
    "Check everything below. You can edit any section before submitting.",
  ];

  return (
    <WizardFrame
      step={step}
      total={STEPS.length}
      stepTitle={STEPS[step - 1]}
      direction={dir}
      heading={headings[step - 1]}
      intro={intros[step - 1]}
      onBack={step > 1 ? () => go(step - 1, "back") : undefined}
      onNext={next}
      nextLabel={step === 1 ? (resumed ? "Continue where I left off" : "Start registration") : step === 6 ? "Submit registration" : "Continue"}
      nextLoading={loading}
      nextArrow={step !== 6}
      error={error}
    >
      {step === 1 && (
        <div>
          {resumed && (
            <div style={styles.resume} role="status">
              <span style={{ flex: 1 }}>We saved your earlier business details on this device. Passwords, PINs and payout numbers are never saved, so you'll re-enter those.</span>
              <button
                type="button"
                style={styles.clear}
                onClick={() => {
                  clearDraft(DRAFT_KEY);
                  setHotelName("");
                  setBusinessType("hotel");
                  setLocation("");
                  setContactFullName("");
                  setEmail("");
                  setPhoneNumber("");
                  setMethod("mpesa_till");
                  setResumed(false);
                }}
              >
                <Trash2 size={14} aria-hidden /> Start over
              </button>
            </div>
          )}
          <ul style={styles.checklist}>
            {[
              { icon: Store, t: "Your business details", d: "Name, type and area." },
              { icon: UserRound, t: "An owner or manager", d: "Name, phone and email." },
              { icon: Landmark, t: "Where to pay you", d: "M-Pesa Till, Paybill, Send Money, Pochi la Biashara or a bank account." },
              { icon: KeyRound, t: "A password and 4-digit PIN", d: "To sign in securely." },
            ].map(({ icon: Icon, t, d: desc }) => (
              <li key={t} style={styles.item}>
                <span style={styles.itemIcon}>
                  <Icon size={18} color={COLORS.accent} aria-hidden />
                </span>
                <span>
                  <span style={styles.itemTitle}>{t}</span>
                  <span style={styles.itemDesc}>{desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <div style={styles.note}>
            <ShieldCheck size={18} color={COLORS.success} aria-hidden style={{ flexShrink: 0 }} />
            <span>Payment details are verified by an admin before payouts begin. You can complete the rest of your hotel profile later.</span>
          </div>
          <div style={{ textAlign: "center", marginTop: 4 }}>
            <PrimaryButton variant="ghost" type="button" onPress={onSwitchToLogin}>
              Already registered? Sign in
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <Field label="Business name" value={hotelName} onChange={setHotelName} error={e("hotelName")} placeholder="e.g. Mama Lucy's Kitchen" autoComplete="organization" />
          <div role="group" aria-label="Business type" style={{ marginBottom: 18 }}>
            <p style={styles.groupLabel}>Business type</p>
            <div style={styles.chips}>
              {BUSINESS_TYPES.map((t) => (
                <Chip key={t.value} label={t.label} active={businessType === t.value} onPress={() => setBusinessType(t.value)} />
              ))}
            </div>
          </div>
          <Field label="Location / area (optional)" value={location} onChange={setLocation} hint="The estate, street or town students should look for." autoComplete="address-level2" />
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Owner's full name" value={contactFullName} onChange={setContactFullName} error={e("contactFullName")} autoComplete="name" autoCapitalize="words" />
          <Field label="Email address" value={email} onChange={setEmail} error={e("email")} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" hint="You'll sign in with this." />
          <Field label="Phone number" value={phoneNumber} onChange={setPhoneNumber} error={e("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" hint={method === "mpesa_till" || method === "paybill" ? "Also used as the M-Pesa-registered number for your till or paybill." : "You can also sign in with this."} />
        </>
      )}

      {step === 4 && (
        <>
          <div role="group" aria-label="Payout method" style={{ marginBottom: 18 }}>
            <div style={styles.chips}>
              {METHODS.map((m) => (
                <Chip key={m.value} label={m.label} active={method === m.value} onPress={() => setMethod(m.value)} />
              ))}
            </div>
          </div>
          {methodDef.fields.map((f) => (
            <Field
              key={`${method}.${f.key}`}
              label={f.label}
              value={pv(f.key)}
              onChange={(v) => setPayout((p) => ({ ...p, [`${method}.${f.key}`]: v }))}
              error={e(f.key)}
              inputMode={f.inputMode}
              type={f.phone ? "tel" : "text"}
              autoComplete="off"
            />
          ))}
          {methodDef.note && <p style={styles.help}>{methodDef.note}</p>}
        </>
      )}

      {step === 5 && (
        <>
          <PasswordField label="Password" value={password} onChange={setPassword} error={e("password")} autoComplete="new-password" hint="At least 8 characters." />
          <PasswordField label="4-digit PIN" noun="PIN" value={pin} onChange={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 4))} error={e("pin")} inputMode="numeric" autoComplete="off" maxLength={4} hint="Used to quickly unlock the app later without retyping your password." />
        </>
      )}

      {step === 6 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { title: "Business", icon: Store, goto: 2, rows: [["Name", hotelName], ["Type", BUSINESS_TYPES.find((t) => t.value === businessType)?.label ?? businessType], ["Area", location || "Not provided"]] },
            { title: "Owner & contact", icon: UserRound, goto: 3, rows: [["Owner", contactFullName], ["Email", email], ["Phone", phoneNumber]] },
            {
              title: "Payouts",
              icon: Landmark,
              goto: 4,
              rows: [
                ["Method", methodDef.label],
                ...methodDef.fields.filter((f) => pv(f.key)).map((f) => [f.label.replace(" (optional)", ""), f.key.toLowerCase().includes("number") && !f.phone ? mask(pv(f.key)) : pv(f.key)]),
              ],
            },
            { title: "Sign-in", icon: ListChecks, goto: 5, rows: [["Password", "•".repeat(Math.min(password.length, 12))], ["PIN", "••••"]] },
          ].map(({ title, icon: Icon, goto, rows }) => (
            <section key={title} style={styles.review} aria-label={title}>
              <header style={styles.reviewHead}>
                <Icon size={16} color={COLORS.accent} aria-hidden />
                <h2 style={styles.reviewTitle}>{title}</h2>
                <button type="button" onClick={() => go(goto, "back")} style={styles.edit} aria-label={`Edit ${title}`}>
                  Edit
                </button>
              </header>
              <dl style={{ margin: 0 }}>
                {rows.map(([k, v]) => (
                  <div key={k} style={styles.reviewRow}>
                    <dt style={styles.reviewKey}>{k}</dt>
                    <dd style={styles.reviewVal}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <div style={styles.note}>
            <ShieldCheck size={18} color={COLORS.success} aria-hidden style={{ flexShrink: 0 }} />
            <span>After you submit, you'll be signed in. An admin verifies your payment details before payouts begin.</span>
          </div>
          <p style={styles.terms}>
            By creating an account you agree to MEALVEST's{" "}
            <a href="/terms" target="_blank" rel="noreferrer" style={{ color: COLORS.primaryLight, fontWeight: 600 }}>
              terms, payments &amp; savings policy and privacy policy
            </a>
            .
          </p>
        </div>
      )}
    </WizardFrame>
  );
}

const styles: Record<string, React.CSSProperties> = {
  resume: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 14, marginBottom: 16, borderRadius: RADIUS.md, backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.35)", fontFamily: FONTS.body, fontSize: 13, lineHeight: "19px", color: COLORS.textOnDark },
  clear: { minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.accent },
  checklist: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 },
  item: { display: "flex", gap: 14, alignItems: "center", padding: 14, borderRadius: RADIUS.md, backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaisedSm, border: "1px solid var(--mv-hairline)" },
  itemIcon: { width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
  itemTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textOnDark },
  itemDesc: { display: "block", fontFamily: FONTS.body, fontSize: 12, lineHeight: "17px", color: COLORS.textOnDarkMuted, marginTop: 2 },
  note: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, padding: 14, borderRadius: RADIUS.md, backgroundColor: "#1D1511", boxShadow: NEU.darkInset, fontFamily: FONTS.body, fontSize: 12, lineHeight: "18px", color: COLORS.textOnDarkMuted },
  groupLabel: { margin: "0 0 10px", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textOnDark },
  chips: { display: "flex", flexWrap: "wrap", gap: 10 },
  help: { margin: "0 0 8px", fontFamily: FONTS.body, fontSize: 12, lineHeight: "18px", color: COLORS.textOnDarkMuted },
  review: { padding: "6px 14px 10px", borderRadius: RADIUS.md, backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaisedSm, border: "1px solid var(--mv-hairline)" },
  reviewHead: { display: "flex", alignItems: "center", gap: 8, minHeight: 44 },
  reviewTitle: { flex: 1, margin: 0, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textOnDark },
  edit: { minWidth: 44, minHeight: 44, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primaryLight },
  reviewRow: { display: "flex", gap: 12, padding: "6px 0", borderTop: "1px solid var(--mv-hairline)" },
  reviewKey: { width: 96, flexShrink: 0, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted },
  reviewVal: { flex: 1, minWidth: 0, margin: 0, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textOnDark, overflowWrap: "anywhere" },
  terms: { margin: 0, textAlign: "center", fontFamily: FONTS.body, fontSize: 12, lineHeight: "18px", color: COLORS.textOnDarkMuted },
};
