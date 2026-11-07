import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, UserX, UserCheck, Send, Users, Mail, Phone, Eye } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Modal } from "../../components/ui/Modal";
import { SkeletonRegion, SkeletonCards } from "../../components/ui/Skeleton";
import { Banner, Chips, EmptyState, PageHeader, Panel, StatusPill, formatDate, useNotice, Tone } from "../../components/hotel/hd";
import { ApiError } from "../../services/authApi";
import {
  createStaff,
  deactivateStaff,
  fetchStaff,
  reactivateStaff,
  resendStaffInvite,
  StaffMember,
  StaffStatus,
} from "../../services/hotelStaffManagementApi";

const STATUS: Record<StaffStatus, { label: string; tone: Tone }> = {
  owner: { label: "Owner", tone: "ready" },
  active: { label: "Active", tone: "good" },
  invited: { label: "Invite pending", tone: "warn" },
  deactivated: { label: "Deactivated", tone: "muted" },
};

const EMPTY_FORM = { fullName: "", email: "", phoneNumber: "" };

type Confirm = { kind: "deactivate" | "reactivate"; member: StaffMember } | null;

export default function HotelStaffManageScreen() {
  const { authFetch, user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { notice, notify } = useNotice();

  const load = useCallback(async () => {
    try {
      const data = await fetchStaff(authFetch);
      setStaff(data.staff);
      setLimit(data.limit);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your staff.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const team = staff.filter((s) => s.status !== "owner");
    return {
      all: team.length,
      active: team.filter((s) => s.status === "active").length,
      invited: team.filter((s) => s.status === "invited").length,
      deactivated: team.filter((s) => s.status === "deactivated").length,
    };
  }, [staff]);

  const visible = staff.filter((s) => {
    if (s.status === "owner") return filter === "all";
    return filter === "all" || s.status === filter;
  });
  const usedSlots = counts.active + counts.invited;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const phoneNumber = form.phoneNumber.trim();
    if (fullName.length < 2) return setFormError("Enter the staff member's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError("Enter a valid email address — the invitation is sent there.");
    if (phoneNumber.replace(/\D/g, "").length < 9) return setFormError("Enter a valid Kenyan phone number.");

    setSubmitting(true);
    try {
      const result = await createStaff(authFetch, { fullName, email, phoneNumber });
      setAdding(false);
      setForm(EMPTY_FORM);
      await load();
      if (result.inviteSent) {
        setWarning(null);
        notify(`Invitation sent to ${result.staff.email}.`);
      } else {
        setWarning(result.inviteError ?? "The account was created, but the invitation email couldn't be sent. Use “Resend invite”.");
      }
    } catch (err) {
      setFormError(err instanceof ApiError || err instanceof Error ? err.message : "Could not create this account.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async (m: StaffMember) => {
    setBusyId(m.userId);
    try {
      await resendStaffInvite(authFetch, m.userId);
      setWarning(null);
      notify(`Invitation re-sent to ${m.email}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not resend the invitation.", "bad");
    } finally {
      setBusyId(null);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { kind, member } = confirm;
    setBusyId(member.userId);
    try {
      if (kind === "deactivate") await deactivateStaff(authFetch, member.userId);
      else await reactivateStaff(authFetch, member.userId);
      setConfirm(null);
      setViewing(null);
      await load();
      notify(kind === "deactivate" ? `${member.fullName} can no longer sign in.` : `${member.fullName} can sign in again.`);
    } catch (err) {
      setConfirm(null);
      notify(err instanceof Error ? err.message : "That didn't work. Please try again.", "bad");
    } finally {
      setBusyId(null);
    }
  };

  const chips = [
    { value: "all", label: "All", count: counts.all },
    { value: "active", label: "Active", count: counts.active },
    { value: "invited", label: "Invited", count: counts.invited },
    { value: "deactivated", label: "Deactivated", count: counts.deactivated },
  ];

  const actionsFor = (m: StaffMember) => {
    if (m.status === "owner") return null;
    const busy = busyId === m.userId;
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {m.status === "invited" && (
          <button type="button" className="hd-btn hd-btn-quiet hd-btn-sm" disabled={busy} onClick={() => resend(m)}>
            <Send size={14} aria-hidden="true" /> Resend invite
          </button>
        )}
        {m.status === "deactivated" ? (
          <button type="button" className="hd-btn hd-btn-dark hd-btn-sm" disabled={busy} onClick={() => setConfirm({ kind: "reactivate", member: m })}>
            <UserCheck size={14} aria-hidden="true" /> Reactivate
          </button>
        ) : (
          <button type="button" className="hd-btn hd-btn-danger hd-btn-sm" disabled={busy} onClick={() => setConfirm({ kind: "deactivate", member: m })}>
            <UserX size={14} aria-hidden="true" /> Deactivate
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="hd-page mv-page">
      <PageHeader
        eyebrow="Your team"
        title="Staff"
        subtitle={loading ? undefined : `${counts.active} active · ${counts.invited} invited · room for ${Math.max(0, limit - usedSlots)} more`}
        actions={
          <button type="button" className="hd-btn hd-btn-primary" onClick={() => { setFormError(null); setAdding(true); }} disabled={loading || usedSlots >= limit}>
            <UserPlus size={16} aria-hidden="true" /> Add staff
          </button>
        }
      />

      {error && (
        <Banner tone="bad" title="Couldn't load your staff" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>}>
          {error}
        </Banner>
      )}
      {warning && <Banner tone="warn" title="Invitation not sent">{warning}</Banner>}

      <Banner tone="good" title="Staff can scan, redeem and view orders">
        They can't change your menu, payouts, settlement details or other staff. They set their own password from an emailed link.
      </Banner>

      {!loading && counts.all > 0 && (
        <div className="hd-toolbar">
          <Chips label="Filter staff" options={chips} value={filter} onChange={setFilter} />
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="staff">
          <SkeletonCards count={3} imageHeight={60} />
        </SkeletonRegion>
      ) : counts.all === 0 && !error ? (
        <EmptyState icon={<Users size={22} />} title="No staff yet">
          Add the people who work your counter. Each gets their own login, so you can see who redeemed what — and remove access in one tap.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="Nobody in this view">Try another filter.</EmptyState>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {visible.map((m) => {
            const status = STATUS[m.status];
            return (
              <li key={m.userId}>
                <Panel as="article" aria-label={m.fullName}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                    <span className="hd-avatar" style={{ backgroundColor: "#8f3a24" }} aria-hidden="true">
                      {m.fullName.trim().charAt(0).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span className="hd-row-title">
                        {m.fullName}
                        {m.userId === user?.id ? " (you)" : ""}
                      </span>
                      <span className="hd-row-meta" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <Mail size={12} aria-hidden="true" /> {m.email}
                      </span>
                      {m.phoneNumber && (
                        <span className="hd-row-meta" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <Phone size={12} aria-hidden="true" /> +{m.phoneNumber}
                        </span>
                      )}
                    </div>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </div>
                  {m.status !== "owner" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                      <span className="hd-row-meta" style={{ margin: 0 }}>
                        {m.redemptions} meal{m.redemptions === 1 ? "" : "s"} redeemed · added {formatDate(m.createdAt)}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="hd-btn hd-btn-quiet hd-btn-sm" onClick={() => setViewing(m)} aria-label={`View ${m.fullName}`}>
                          <Eye size={14} aria-hidden="true" /> View
                        </button>
                        {actionsFor(m)}
                      </div>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------ Add staff ------------------------------ */}
      <Modal
        open={adding}
        title="Add a staff member"
        icon={<UserPlus size={20} />}
        onClose={() => !submitting && setAdding(false)}
        actions={
          <div className="hd-modal-actions">
            <button type="button" className="hd-btn hd-btn-quiet" onClick={() => setAdding(false)} disabled={submitting}>Cancel</button>
            <button type="submit" form="add-staff-form" className="hd-btn hd-btn-primary" disabled={submitting}>
              {submitting ? "Sending invite…" : "Send invitation"}
            </button>
          </div>
        }
      >
        <form id="add-staff-form" className="hd-form" onSubmit={submit} noValidate>
          <p className="hd-hint">They'll get an email with a link to set their own password. You never see or share a password.</p>
          {formError && <p className="hd-err" role="alert">{formError}</p>}
          <div className="hd-field">
            <label htmlFor="staff-name">Full name</label>
            <input id="staff-name" className="hd-input" autoComplete="off" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="hd-field">
            <label htmlFor="staff-email">Email</label>
            <input id="staff-email" className="hd-input" type="email" autoComplete="off" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="hd-field">
            <label htmlFor="staff-phone">Phone number</label>
            <input id="staff-phone" className="hd-input" type="tel" autoComplete="off" inputMode="tel" placeholder="07XX XXX XXX" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
          </div>
        </form>
      </Modal>

      {/* ------------------------------ Details ------------------------------ */}
      <Modal
        open={viewing !== null}
        title={viewing?.fullName ?? ""}
        onClose={() => setViewing(null)}
        actions={
          viewing && viewing.status !== "owner" ? (
            <div className="hd-modal-actions">{actionsFor(viewing)}</div>
          ) : undefined
        }
      >
        {viewing && (
          <ul className="hd-detail-list">
            <li className="hd-detail-line"><span>Status</span><span>{STATUS[viewing.status].label}</span></li>
            <li className="hd-detail-line"><span>Email</span><span>{viewing.email}{viewing.emailVerified ? " ✓" : ""}</span></li>
            <li className="hd-detail-line"><span>Phone</span><span>{viewing.phoneNumber ? `+${viewing.phoneNumber}` : "—"}</span></li>
            <li className="hd-detail-line"><span>Added</span><span>{formatDate(viewing.createdAt)}</span></li>
            <li className="hd-detail-line"><span>Accepted invite</span><span>{viewing.activatedAt ? formatDate(viewing.activatedAt) : "Not yet"}</span></li>
            {viewing.deactivatedAt && <li className="hd-detail-line"><span>Deactivated</span><span>{formatDate(viewing.deactivatedAt)}</span></li>}
            <li className="hd-detail-line"><span>Meals redeemed</span><span>{viewing.redemptions}</span></li>
          </ul>
        )}
      </Modal>

      {/* ------------------------------ Confirm ------------------------------ */}
      <Modal
        open={confirm !== null}
        title={confirm?.kind === "deactivate" ? "Deactivate this account?" : "Reactivate this account?"}
        onClose={() => busyId === null && setConfirm(null)}
        actions={
          <div className="hd-modal-actions">
            <button type="button" className="hd-btn hd-btn-quiet" onClick={() => setConfirm(null)} disabled={busyId !== null}>Cancel</button>
            <button type="button" className={confirm?.kind === "deactivate" ? "hd-btn hd-btn-danger" : "hd-btn hd-btn-primary"} onClick={runConfirm} disabled={busyId !== null}>
              {busyId !== null ? "Working…" : confirm?.kind === "deactivate" ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        }
      >
        {confirm && (
          <p style={{ margin: 0 }}>
            {confirm.kind === "deactivate"
              ? `${confirm.member.fullName} will be signed out everywhere immediately and can't use MEALVEST for your hotel again until you reactivate them. Their past activity stays on record.`
              : `${confirm.member.fullName} will be able to sign in again with their existing password.`}
          </p>
        )}
      </Modal>
      {notice}
    </div>
  );
}
