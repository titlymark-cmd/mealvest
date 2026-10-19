import React, { useCallback, useEffect, useState } from "react";
import { Wallet, CalendarCheck, PiggyBank } from "lucide-react";
import { COLORS, FONTS, NEU, RADIUS } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";
import { isGoogleAuthConfigured } from "../services/googleAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { WizardFrame } from "../components/ui/WizardFrame";
import { Field } from "../components/ui/Field";
import { PasswordField } from "../components/ui/PasswordField";
import { PrimaryButton } from "../components/PrimaryButton";
import { Errors, hasErrors, validators } from "../utils/validators";
import { clearDraft, loadDraft, saveDraft } from "../utils/formDraft";

const DRAFT_KEY = "mealvest_draft_student_v1";
const STEPS = ["Welcome", "About you", "Secure your account", "Review"];

/**
 * Student sign-up as a short guided flow. It still ends in the same single
 * registerStudent() call with the same fields — only the presentation is
 * split up. Plan selection is NOT part of it: after the account exists the
 * student lands on hotel selection / plan setup exactly as before.
 */
export function StudentSignupWizard({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { registerStudent, loginWithGoogle } = useAuth();
  const draft = React.useMemo(() => loadDraft<{ fullName: string; email: string; phoneNumber: string }>(DRAFT_KEY), []);

  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [fullName, setFullName] = useState(draft?.data.fullName ?? "");
  const [email, setEmail] = useState(draft?.data.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(draft?.data.phoneNumber ?? "");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleConfigured = isGoogleAuthConfigured();

  // Only name / email / phone are ever saved — never the password or PIN.
  useEffect(() => {
    if (fullName || email || phoneNumber) saveDraft(DRAFT_KEY, step, { fullName, email, phoneNumber });
  }, [fullName, email, phoneNumber, step]);

  const handleGoogleIdToken = useCallback(
    async (idToken: string) => {
      setError(null);
      setGoogleLoading(true);
      try {
        await loginWithGoogle(idToken);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
      } finally {
        setGoogleLoading(false);
      }
    },
    [loginWithGoogle]
  );

  const errors: Errors =
    step === 2
      ? { fullName: validators.required(fullName, "Enter your full name."), email: validators.email(email), phone: validators.phone(phoneNumber) }
      : step === 3
        ? { password: validators.password(password), pin: validators.pin(pin) }
        : {};

  const go = (n: number, d: "fwd" | "back") => {
    setDir(d);
    setShowErrors(false);
    setError(null);
    setStep(n);
  };

  const next = async () => {
    if (step < 4) {
      if (hasErrors(errors)) return setShowErrors(true);
      return go(step + 1, "fwd");
    }
    setError(null);
    setLoading(true);
    try {
      await registerStudent({ fullName, email: email.trim(), phoneNumber, password, pin });
      clearDraft(DRAFT_KEY);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const e = (k: string) => (showErrors ? errors[k] : null);

  return (
    <WizardFrame
      step={step}
      total={STEPS.length}
      stepTitle={STEPS[step - 1]}
      direction={dir}
      onBack={step > 1 ? () => go(step - 1, "back") : undefined}
      onNext={next}
      nextLabel={step === 1 ? "Get started" : step === 4 ? "Create account" : "Continue"}
      nextLoading={loading}
      nextArrow={step !== 4}
      error={error}
      heading={["Your food money, already planned.", "Tell us about you", "Secure your account", "Check your details"][step - 1]}
      intro={
        [
          "Join MEALVEST in about a minute. You can pick a hotel and plan right after.",
          draft && draft.data.email ? "We kept your details from last time. Passwords are never saved." : "We use these to create your account and keep it yours.",
          "You'll sign in with your password, then confirm with a 4-digit PIN.",
          "Everything look right? You can change anything before you create your account.",
        ][step - 1]
      }
    >
      {step === 1 && (
        <div>
          <ul style={styles.benefits}>
            {[
              { icon: Wallet, t: "Fund a meal plan", d: "Pay once for a plan with a hotel you trust." },
              { icon: CalendarCheck, t: "A daily amount to eat on", d: "Your money is spread across your plan, so it lasts." },
              { icon: PiggyBank, t: "Unspent days roll over", d: "Unused daily balance can carry to the next day." },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} style={styles.benefit}>
                <span style={styles.benefitIcon}>
                  <Icon size={20} color={COLORS.accent} aria-hidden />
                </span>
                <span>
                  <span style={styles.benefitTitle}>{t}</span>
                  <span style={styles.benefitDesc}>{d}</span>
                </span>
              </li>
            ))}
          </ul>
          {googleConfigured && (
            <div style={{ marginTop: 22 }}>
              <GoogleSignInButton onIdToken={handleGoogleIdToken} loading={googleLoading} />
              <p style={styles.or}>or continue with your email</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <>
          <Field label="Full name" value={fullName} onChange={setFullName} error={e("fullName")} autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
          <Field label="Email address" value={email} onChange={setEmail} error={e("email")} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" enterKeyHint="next" />
          <Field label="Phone number" value={phoneNumber} onChange={setPhoneNumber} error={e("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" hint="The number you'll use for M-Pesa." enterKeyHint="done" />
        </>
      )}

      {step === 3 && (
        <>
          <PasswordField label="Password" value={password} onChange={setPassword} error={e("password")} autoComplete="new-password" hint="At least 8 characters." enterKeyHint="next" />
          <PasswordField
            label="4-digit PIN"
            noun="PIN"
            value={pin}
            onChange={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 4))}
            error={e("pin")}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            hint="Used to quickly unlock the app later without retyping your password."
            enterKeyHint="done"
          />
        </>
      )}

      {step === 4 && (
        <div>
          <dl style={styles.summary}>
            {[
              ["Name", fullName, 2],
              ["Email", email, 2],
              ["Phone", phoneNumber, 2],
              ["Password", "•".repeat(Math.min(password.length, 12)), 3],
              ["PIN", "••••", 3],
            ].map(([k, v, s]) => (
              <div key={k as string} style={styles.summaryRow}>
                <dt style={styles.summaryKey}>{k}</dt>
                <dd style={styles.summaryVal}>{v}</dd>
                <button type="button" onClick={() => go(s as number, "back")} style={styles.edit} aria-label={`Edit ${k}`}>
                  Edit
                </button>
              </div>
            ))}
          </dl>
          <p style={styles.terms}>
            By creating an account you agree to MEALVEST's{" "}
            <a href="/terms" target="_blank" rel="noreferrer" style={styles.termsLink}>
              terms, payments &amp; savings policy and privacy policy
            </a>
            .
          </p>
        </div>
      )}

      {step === 1 && (
        <div style={{ marginTop: 6, textAlign: "center" }}>
          <PrimaryButton variant="ghost" type="button" onPress={onSwitchToLogin}>
            Already have an account? Sign in
          </PrimaryButton>
        </div>
      )}
    </WizardFrame>
  );
}

const styles: Record<string, React.CSSProperties> = {
  benefits: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 },
  benefit: { display: "flex", gap: 14, alignItems: "center", padding: 14, borderRadius: RADIUS.md, backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaisedSm, border: "1px solid var(--mv-hairline)" },
  benefitIcon: { width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
  benefitTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 15, color: COLORS.textOnDark },
  benefitDesc: { display: "block", fontFamily: FONTS.body, fontSize: 13, lineHeight: "18px", color: COLORS.textOnDarkMuted, marginTop: 2 },
  or: { textAlign: "center", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, margin: "14px 0 0" },
  summary: { margin: 0, padding: 6, borderRadius: RADIUS.md, backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
  summaryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 12px", minHeight: 52 },
  summaryKey: { width: 72, flexShrink: 0, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted },
  summaryVal: { flex: 1, minWidth: 0, margin: 0, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textOnDark, overflowWrap: "anywhere" },
  edit: { minWidth: 44, minHeight: 44, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primaryLight },
  terms: { fontFamily: FONTS.body, fontSize: 12, lineHeight: "18px", color: COLORS.textOnDarkMuted, margin: "16px 0 0", textAlign: "center" },
  termsLink: { color: COLORS.primaryLight, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
};
