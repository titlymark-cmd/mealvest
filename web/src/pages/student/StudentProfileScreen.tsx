import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Pencil,
  CircleCheck,
  Mail,
  Phone,
  PhoneCall,
  UserRound,
  GraduationCap,
  IdCard,
  ShieldCheck,
  LockKeyhole,
  KeyRound,
  Headset,
  ScrollText,
  LogOut,
  ChevronRight,
  RefreshCw,
  BadgeCheck,
  Save,
} from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/Spinner";
import { EmptyState, StatusBadge } from "../../components/student/ui";
import { useAuth } from "../../context/AuthContext";
import { fetchStudentProfile, updateStudentProfile, uploadStudentAvatar, StudentProfile } from "../../services/studentProfileApi";
import { fetchCustomerCarePhone } from "../../services/settingsApi";
import { validators } from "../../utils/validators";
import { NotificationSettingsSection } from "../../components/notifications/NotificationSettingsSection";
import { VerificationSection } from "../../components/student/VerificationSection";

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

type FieldErrors = Partial<Record<"fullName" | "phoneNumber" | "alternatePhoneNumber", string>>;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** One read-only row: small label above, value below (never an empty gap). */
function InfoRow({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | null | undefined; hint?: string }) {
  return (
    <div className="sv-row">
      <span className="sv-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sv-row-main">
        <span className="sv-row-sub">{label}</span>
        <span className="sv-row-label" style={value ? undefined : { color: "var(--sv-faint)", fontWeight: 500 }}>
          {value || hint || "Not added"}
        </span>
      </span>
    </div>
  );
}

export default function StudentProfileScreen() {
  const { user, authFetch, logout, lockApp } = useAuth();

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState("");
  const [institution, setInstitution] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [carePhone, setCarePhone] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const applyProfileToDraft = (p: StudentProfile) => {
    setFullName(p.full_name || "");
    setPhoneNumber(p.phone_number || "");
    setAlternatePhoneNumber(p.alternate_phone_number || "");
    setInstitution(p.institution || "");
    setAdmissionNumber(p.admission_number || "");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await fetchStudentProfile(authFetch);
      setProfile(p);
      applyProfileToDraft(p);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchCustomerCarePhone()
      .then(setCarePhone)
      .catch(() => setCarePhone(null));
  }, []);

  // The "saved" confirmation clears itself.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  const startEditing = () => {
    if (profile) applyProfileToDraft(profile);
    setSaveError(null);
    setFieldErrors({});
    setSaved(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (profile) applyProfileToDraft(profile);
    setSaveError(null);
    setFieldErrors({});
    setEditing(false);
  };

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image is too large — 4MB maximum.");
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const avatarUrl = await uploadStudentAvatar(authFetch, file);
      setProfile((p) => (p ? { ...p, avatar_url: avatarUrl } : p));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Could not upload your profile picture.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const save = async () => {
    // Mirrors (never exceeds) the server's rules, only for earlier feedback.
    const errors: FieldErrors = {};
    const nameErr = validators.required(fullName, "Enter your full name.");
    if (nameErr) errors.fullName = nameErr;
    const phoneErr = validators.phone(phoneNumber);
    if (phoneErr) errors.phoneNumber = phoneErr;
    if (alternatePhoneNumber.trim()) {
      const altErr = validators.phone(alternatePhoneNumber, "alternate phone number");
      if (altErr) errors.alternatePhoneNumber = altErr;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaveError(null);
    setSaving(true);
    try {
      const updated = await updateStudentProfile(authFetch, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        alternatePhoneNumber: alternatePhoneNumber.trim(),
        institution: institution.trim(),
        admissionNumber: admissionNumber.trim(),
      });
      setProfile(updated);
      applyProfileToDraft(updated);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  };

  // ----- Loading / error --------------------------------------------------------

  if (loading) {
    return (
      <div className="mv-container sv-page" aria-busy="true" aria-label="Loading your profile">
        <h1 className="sv-visually-hidden">Profile</h1>
        <div className="mv-skel" style={{ height: 250 }} />
        <div className="mv-skel" style={{ height: 300 }} />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="mv-container sv-page">
        <h1 className="sv-title">Profile</h1>
        <EmptyState role="alert" icon={<RefreshCw size={28} />} title="We couldn't load your profile" body={loadError ?? "Something went wrong."}>
          <PrimaryButton type="button" variant="secondary" showArrow={false} icon={<RefreshCw size={16} aria-hidden />} onPress={load}>
            Try again
          </PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const displayName = profile.full_name || user?.fullName || profile.email;
  const schoolLine = [profile.institution, profile.admission_number ? `Adm. ${profile.admission_number}` : null].filter(Boolean).join(" · ");
  const accountActive = (profile.account_status || "").toLowerCase() === "active";
  const showPinRows = profile.has_pin !== undefined;

  const editField = (id: string, label: string, value: string, set: (v: string) => void, opts: { error?: string; placeholder?: string; help?: string; type?: string; autoFocus?: boolean; autoComplete?: string }) => (
    <div className="sv-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        type={opts.type ?? "text"}
        inputMode={opts.type === "tel" ? "tel" : undefined}
        placeholder={opts.placeholder}
        autoFocus={opts.autoFocus}
        autoComplete={opts.autoComplete}
        aria-invalid={opts.error ? true : undefined}
        aria-describedby={opts.error || opts.help ? `${id}-msg` : undefined}
        style={opts.error ? { borderColor: "var(--sv-bad)" } : undefined}
      />
      {(opts.error || opts.help) && (
        <span id={`${id}-msg`} className="sv-field-help" style={opts.error ? { color: "var(--sv-bad)", fontWeight: 600 } : undefined}>
          {opts.error || opts.help}
        </span>
      )}
    </div>
  );

  return (
    <div className="mv-container sv-page">
      {/* ---- Identity ---- */}
      <section className="sv-identity" aria-label="Your profile">
        <div className="sv-avatar-wrap">
          <span className="sv-avatar">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={`${displayName}`} />
            ) : (
              <span className="sv-avatar-initials" aria-hidden="true">
                {initialsOf(displayName)}
              </span>
            )}
          </span>
          <button type="button" className="sv-avatar-edit" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading} aria-label="Change profile picture">
            {avatarUploading ? <Spinner color="#FCF4EA" /> : <Camera size={18} aria-hidden />}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelected} style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />
        </div>

        <div className="sv-identity-main">
          <h1 className="sv-identity-name">{displayName}</h1>
          <span className="sv-identity-sub">{profile.email}</span>
          {schoolLine && <span className="sv-identity-sub">{schoolLine}</span>}
          <div className="sv-identity-badges">
            {accountActive ? (
              <StatusBadge tone="ok" label="Active account" icon={<BadgeCheck size={13} aria-hidden />} />
            ) : (
              profile.account_status && <StatusBadge tone="warn" label={`Account ${profile.account_status}`} />
            )}
            {profile.email_verified !== undefined && (
              <StatusBadge tone={profile.email_verified ? "ok" : "warn"} label={profile.email_verified ? "Email verified" : "Email not verified"} icon={<Mail size={13} aria-hidden />} />
            )}
            {profile.phone_verified !== undefined && (
              <StatusBadge tone={profile.phone_verified ? "ok" : "warn"} label={profile.phone_verified ? "Phone verified" : "Phone not verified"} icon={<Phone size={13} aria-hidden />} />
            )}
          </div>
          {!editing && (
            <div style={{ marginTop: 6 }}>
              <button type="button" className="sv-btn" onClick={startEditing}>
                <Pencil size={16} aria-hidden />
                Edit profile
              </button>
            </div>
          )}
        </div>
      </section>

      {avatarError && (
        <div className="sv-toast" data-tone="bad" role="alert">
          {avatarError}
        </div>
      )}
      {saved && (
        <div className="sv-toast" data-tone="ok" role="status">
          <CircleCheck size={18} aria-hidden />
          Profile saved
        </div>
      )}

      <div className="sv-profile-cols">
        <div className="sv-stack" style={{ gap: 22 }}>
          {/* ---- Personal information ---- */}
          <section aria-labelledby="personal-heading">
            <h2 className="sv-group-title" id="personal-heading">
              Personal information
            </h2>
            {editing ? (
              <form
                className="sv-group"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                noValidate
              >
                <InfoRow icon={<Mail size={18} />} label="Email" value={profile.email} />
                {editField("pf-name", "Full name", fullName, setFullName, { error: fieldErrors.fullName, autoFocus: true, autoComplete: "name" })}
                {editField("pf-phone", "Phone number", phoneNumber, setPhoneNumber, { error: fieldErrors.phoneNumber, type: "tel", autoComplete: "tel" })}
                {editField("pf-alt", "Alternate phone number", alternatePhoneNumber, setAlternatePhoneNumber, {
                  error: fieldErrors.alternatePhoneNumber,
                  type: "tel",
                  placeholder: "Optional — e.g. a parent's number",
                })}
                {editField("pf-inst", "Institution", institution, setInstitution, { placeholder: "Optional" })}
                {editField("pf-adm", "Admission number", admissionNumber, setAdmissionNumber, { placeholder: "Optional" })}
                {saveError && (
                  <div className="sv-toast" data-tone="bad" role="alert" style={{ margin: "4px 16px 0" }}>
                    {saveError}
                  </div>
                )}
                <div className="sv-edit-actions">
                  <button type="button" className="sv-btn" onClick={cancelEditing} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="sv-btn" data-variant="primary" disabled={saving}>
                    <Save size={16} aria-hidden />
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="sv-group">
                <InfoRow icon={<UserRound size={18} />} label="Full name" value={profile.full_name} />
                <InfoRow icon={<Mail size={18} />} label="Email" value={profile.email} />
                <InfoRow icon={<Phone size={18} />} label="Phone number" value={profile.phone_number} />
                <InfoRow icon={<PhoneCall size={18} />} label="Alternate phone number" value={profile.alternate_phone_number} hint="Optional — add a parent's number" />
                <InfoRow icon={<GraduationCap size={18} />} label="Institution" value={profile.institution} />
                <InfoRow icon={<IdCard size={18} />} label="Admission number" value={profile.admission_number} />
              </div>
            )}
          </section>

          <VerificationSection
            emailVerified={Boolean(profile.email_verified)}
            phoneVerified={Boolean(profile.phone_verified)}
            onVerified={() => setProfile((p) => (p ? { ...p, phone_verified: true } : p))}
          />

          <NotificationSettingsSection />
        </div>

        <div className="sv-stack" style={{ gap: 22 }}>
          {/* ---- Security ---- */}
          <section aria-labelledby="security-heading">
            <h2 className="sv-group-title" id="security-heading">
              Account and security
            </h2>
            <div className="sv-group">
              {showPinRows && (
                <div className="sv-row">
                  <span className="sv-row-icon" aria-hidden="true">
                    <KeyRound size={18} />
                  </span>
                  <span className="sv-row-main">
                    <span className="sv-row-label">App PIN</span>
                    <span className="sv-row-sub">{profile.has_pin ? "Unlocks MEALVEST when you reopen the app" : "No PIN set on this account"}</span>
                  </span>
                  <StatusBadge tone={profile.has_pin ? "ok" : "warn"} label={profile.has_pin ? "On" : "Not set"} icon={<ShieldCheck size={13} aria-hidden />} />
                </div>
              )}
              {profile.has_google && (
                <div className="sv-row">
                  <span className="sv-row-icon" aria-hidden="true">
                    <ShieldCheck size={18} />
                  </span>
                  <span className="sv-row-main">
                    <span className="sv-row-label">Google sign-in</span>
                    <span className="sv-row-sub">Linked to this account</span>
                  </span>
                  <StatusBadge tone="ok" label="Linked" icon={<CircleCheck size={13} aria-hidden />} />
                </div>
              )}
              {profile.has_pin !== false && (
                <button type="button" className="sv-row" onClick={() => lockApp()}>
                  <span className="sv-row-icon" aria-hidden="true">
                    <LockKeyhole size={18} />
                  </span>
                  <span className="sv-row-main">
                    <span className="sv-row-label">Lock the app now</span>
                    <span className="sv-row-sub">Asks for your PIN to continue. You stay signed in.</span>
                  </span>
                  <ChevronRight size={18} aria-hidden style={{ color: "var(--sv-muted)" }} />
                </button>
              )}
            </div>
          </section>

          {/* ---- Support ---- */}
          <section aria-labelledby="support-heading">
            <h2 className="sv-group-title" id="support-heading">
              Support
            </h2>
            <div className="sv-group">
              {carePhone && (
                <a className="sv-row" href={`tel:${carePhone.replace(/\s+/g, "")}`}>
                  <span className="sv-row-icon" aria-hidden="true">
                    <Headset size={18} />
                  </span>
                  <span className="sv-row-main">
                    <span className="sv-row-label">Call Customer Care</span>
                    <span className="sv-row-sub">Tap to open your phone app</span>
                  </span>
                  <ChevronRight size={18} aria-hidden style={{ color: "var(--sv-muted)" }} />
                </a>
              )}
              <Link className="sv-row" to="/terms">
                <span className="sv-row-icon" aria-hidden="true">
                  <ScrollText size={18} />
                </span>
                <span className="sv-row-main">
                  <span className="sv-row-label">Terms, payments &amp; savings policy, privacy</span>
                  <span className="sv-row-sub">How MEALVEST handles your plan and your data</span>
                </span>
                <ChevronRight size={18} aria-hidden style={{ color: "var(--sv-muted)" }} />
              </Link>
            </div>
          </section>

          {/* ---- Account ---- */}
          <section aria-labelledby="account-heading">
            <h2 className="sv-group-title" id="account-heading">
              Account
            </h2>
            <div className="sv-group">
              <button type="button" className="sv-row" onClick={() => setConfirmSignOut(true)} style={{ color: "var(--sv-bad)" }}>
                <span className="sv-row-icon" aria-hidden="true" style={{ color: "var(--sv-bad)" }}>
                  <LogOut size={18} />
                </span>
                <span className="sv-row-main">
                  <span className="sv-row-label">Sign out</span>
                  <span className="sv-row-sub">End your session on this device</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={confirmSignOut}
        title="Sign out of MEALVEST?"
        icon={<LogOut size={22} color="#E5482E" aria-hidden />}
        onClose={() => !signingOut && setConfirmSignOut(false)}
        actions={
          <>
            <PrimaryButton type="button" showArrow={false} loading={signingOut} onPress={doSignOut}>
              Sign out
            </PrimaryButton>
            <PrimaryButton type="button" variant="secondary" showArrow={false} disabled={signingOut} onPress={() => setConfirmSignOut(false)}>
              Stay signed in
            </PrimaryButton>
          </>
        }
      >
        You'll need to sign in again to use your meal plan on this device.
      </Modal>
    </div>
  );
}
