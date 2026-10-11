import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ScrollText, ShieldCheck, Wallet, Star } from "lucide-react";
import { Card } from "../components/Card";
import { COLORS, FONTS, RADIUS } from "../styles/theme";

const LAST_UPDATED = "11 October 2026";

type SectionKey = "terms" | "payments" | "privacy" | "community";

const TABS: { key: SectionKey; label: string; Icon: any }[] = [
  { key: "terms", label: "Terms of use", Icon: ScrollText },
  { key: "payments", label: "Payments & savings", Icon: Wallet },
  { key: "privacy", label: "Privacy", Icon: ShieldCheck },
  { key: "community", label: "Reviews & conduct", Icon: Star },
];

/**
 * MEALVEST terms, conditions and policies — public (no sign-in needed,
 * mounted in RootGate ahead of the auth gate) so a student can read
 * them from the registration form, the plan set-up disclaimer and
 * the withdrawal screen alike. Deep-linkable per section via
 * ?section=payments etc.
 *
 * The rules written here describe how the app actually behaves (plan
 * funds, daily credit, rollover, withdrawal fee, commission, reviews)
 * — if a rule changes in code, change it here too.
 */
export default function TermsScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("section") as SectionKey) || "terms";
  const [section, setSection] = useState<SectionKey>(TABS.some((t) => t.key === initial) ? initial : "terms");

  useEffect(() => {
    if (params.get("section") !== section) setParams({ section }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <button onClick={goBack} style={styles.backRow}>
          <ArrowLeft size={16} color={COLORS.primary} />
          <span style={styles.backText}>Back</span>
        </button>

        <h1 style={styles.title}>MEALVEST terms &amp; policies</h1>
        <p style={styles.subtitle}>Last updated {LAST_UPDATED}. These apply to every student, hotel partner and visitor using MEALVEST.</p>

        <div style={styles.tabRow}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSection(key)} style={{ ...styles.tab, ...(section === key ? styles.tabActive : null) }}>
              <Icon size={14} color={section === key ? "#fff" : COLORS.textOnDarkMuted} />
              <span style={{ ...styles.tabText, ...(section === key ? styles.tabTextActive : null) }}>{label}</span>
            </button>
          ))}
        </div>

        <Card style={styles.card}>
          {section === "terms" && <TermsOfUse />}
          {section === "payments" && <PaymentsPolicy />}
          {section === "privacy" && <PrivacyPolicy />}
          {section === "community" && <CommunityPolicy />}
        </Card>

        <p style={styles.footer}>
          Questions about these terms? Use the Help option in your dashboard or email the MEALVEST team through your
          institution's MEALVEST contact.
        </p>
      </div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 style={styles.h2}>{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={styles.p}>{children}</p>;
}
function L({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={styles.ul}>
      {items.map((it, i) => (
        <li key={i} style={styles.li}>
          {it}
        </li>
      ))}
    </ul>
  );
}

function TermsOfUse() {
  return (
    <>
      <H>1. What MEALVEST is</H>
      <P>
        MEALVEST is a prepaid meal-planning service for students. You commit an amount of money to a meal plan for a
        chosen number of days at a participating hotel or canteen ("hotel partner"). MEALVEST turns that into a daily
        meal credit you spend by ordering meals and showing a QR meal pass at the hotel.
      </P>
      <H>2. Your account</H>
      <L
        items={[
          "You must give accurate details (name, phone number, email) and keep your password and 4-digit PIN private. Anything done with your login is treated as done by you.",
          "One account per person. Accounts are for students and hotel partners; MEALVEST administrators are appointed separately and cannot be created through the app.",
          "We may suspend an account that is used fraudulently, shares QR passes, or abuses hotel partners or other students.",
        ]}
      />
      <H>3. Meal plans and daily credit</H>
      <L
        items={[
          "A plan has a total amount, a number of days and a start and end date. Your daily credit is the remaining balance divided by the remaining days, recalculated by MEALVEST's servers — never by your device.",
          "Each day you may spend up to that day's credit plus anything you carried over. Unused credit from a day is offered to you to carry forward (\"rollover\"); if you confirm, it is added to your spendable balance.",
          "Meal Boost lets you add money to an active plan to raise the daily credit. It follows the same payment rules as a plan payment.",
          "Money in a plan is committed for the plan period. It is not a bank deposit, earns no interest, and is not withdrawable or refundable before the plan period ends, except where the Payments & savings policy says so.",
        ]}
      />
      <H>4. Ordering and the QR meal pass</H>
      <L
        items={[
          "Placing an order reserves the meal's price from your daily credit and issues a single-use QR meal pass. The hotel scans it to serve you; a pass cannot be redeemed twice or at a different hotel.",
          "Orders you do not collect follow the hotel's own policy. MEALVEST records what was redeemed, when, and by which hotel staff member.",
          "Prices are set by each hotel partner. MEALVEST shows them as given and does not guarantee availability of a menu item.",
        ]}
      />
      <H>5. Hotel partners</H>
      <L
        items={[
          "Hotel partners agree to serve MEALVEST meal-pass holders at the listed prices and to let MEALVEST deduct an agreed commission on each redeemed meal (currently at most 10% per hotel, shown to each partner in their dashboard).",
          "Hotel earnings after commission are paid out by MEALVEST to the settlement method the hotel registered (M-Pesa till, paybill, Pochi la Biashara, Send Money or bank), once those details have been verified by MEALVEST.",
          "MEALVEST may suspend a hotel that fails to honour meal passes or breaches these terms.",
        ]}
      />
      <H>6. Changes, availability and liability</H>
      <L
        items={[
          "We may update the app and these terms. Material changes to money rules (fees, withdrawal timing, commission caps) will be shown in the app before they apply to you.",
          "MEALVEST is provided \"as is\". We work to keep it available but do not promise uninterrupted service. Where the law allows, MEALVEST's liability is limited to the amount you have paid into your current plan.",
          "These terms are governed by the laws of Kenya.",
        ]}
      />
    </>
  );
}

function PaymentsPolicy() {
  return (
    <>
      <H>1. How you pay</H>
      <L
        items={[
          "Plan payments and Meal Boost top-ups are made by M-Pesa through MEALVEST's licensed payment provider. You either approve an STK prompt on your phone or pay on the provider's secure checkout page.",
          "A payment counts only when the payment provider confirms it to MEALVEST's servers. A \"success\" message on your screen, or being redirected back to the app, is never treated as proof of payment on its own.",
          "If a confirmed payment does not match the plan amount you chose, it is held for review rather than credited. Contact support with your payment reference.",
          "Failed or cancelled payments are not charged. If M-Pesa deducted money but your plan was not credited within a few minutes, keep the M-Pesa message and contact support — nothing is lost, it is reconciled against the provider's records.",
        ]}
      />
      <H>2. Refunds</H>
      <L
        items={[
          "Because plan money is committed for the plan period, MEALVEST does not refund an active plan on request. Use your daily credit, or carry it forward, and withdraw what is left when the plan ends (section 3).",
          "If MEALVEST or a hotel partner cannot honour a plan (for example a hotel closes), MEALVEST will move your remaining balance to another partner or refund it, less any amount already redeemed.",
          "Duplicate payments for the same plan are credited to that plan, never charged twice: every payment carries a unique reference and the provider is asked once only.",
        ]}
      />
      <H>3. Savings and withdrawal at the end of your plan</H>
      <L
        items={[
          "\"Savings\" means whatever is still unspent when your plan period ends: that day's unused credit, all rollover you carried forward, and any amount you moved to a later day.",
          "Savings are locked until your plan's end date. From that date you can request a withdrawal to an M-Pesa number from your dashboard.",
          <>
            <strong>MEALVEST keeps a withdrawal fee of 10% of the savings withdrawn.</strong> You receive the remaining 90%. The
            exact shilling amounts are shown to you before you confirm, and the fee percentage in force on that day is
            recorded on your withdrawal so later changes never apply to it.
          </>,
          "Requesting a withdrawal closes the plan. The payout is sent by MEALVEST to the M-Pesa number you gave; you are notified when it has gone out and can track the status and reference under Payments & savings.",
          "Each plan's savings can be withdrawn once. Amounts under KSh 1 are not paid out.",
          "A hotel loyalty incentive, where a partner offers one, is added on top of your savings by MEALVEST or the hotel. It is never deducted from you.",
        ]}
      />
      <H>4. Hotel payouts and commission</H>
      <L
        items={[
          "MEALVEST pays hotel partners the price of each redeemed meal minus the agreed commission, batched and sent to the registered settlement method. Payment-provider transfer fees are accounted for separately and are never hidden inside the commission.",
          "Payout references and statuses are visible to the hotel in its dashboard.",
        ]}
      />
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <H>1. What we collect</H>
      <L
        items={[
          "Account details: name, email, phone number(s), institution and admission number if you give them, and a profile photo if you upload one.",
          "Payment details: the M-Pesa number you pay from or withdraw to, payment references and outcomes. MEALVEST never sees or stores your M-Pesa PIN.",
          "Usage: plans, orders, QR redemptions, reviews, device tokens for notifications you opt into, and approximate location only when you ask for nearby hotels.",
          "If you sign in with Google, we receive your name, email and Google account identifier from Google.",
        ]}
      />
      <H>2. How we use it</H>
      <L
        items={[
          "To run your plan, orders and payouts; to show hotels the orders they must serve; to send the notifications you turn on; and to prevent fraud and duplicate payments.",
          "Hotel partners see only what they need to serve you: your order, its meal pass status and your first name. They do not see your phone number, email, balance or other hotels' data.",
          "Students see only their own plans, payments, orders and savings. MEALVEST administrators can see payment and payout records to operate the service.",
        ]}
      />
      <H>3. Who we share it with</H>
      <L
        items={[
          "Payment providers (currently Cyzora and, for older payments, Paystack) receive the phone number and amount needed to process a payment or payout, under their own terms.",
          "Infrastructure providers that host MEALVEST's servers, database, images and notifications process data on our behalf.",
          "We do not sell your data. We disclose it to authorities only where the law requires.",
        ]}
      />
      <H>4. Keeping and protecting it</H>
      <L
        items={[
          "Passwords and PINs are stored only as salted hashes. Payment webhooks are cryptographically verified before anything is recorded. Access to data is role-based and enforced on MEALVEST's servers.",
          "We keep financial records for as long as Kenyan law requires. You can ask us to delete your account; we will remove personal details while keeping the anonymised financial ledger we are required to retain.",
          "You can turn notifications off at any time in your profile.",
        ]}
      />
    </>
  );
}

function CommunityPolicy() {
  return (
    <>
      <H>1. Hotel reviews</H>
      <L
        items={[
          "You can rate a hotel (1 to 5 stars) and leave a short comment only after you have collected at least one meal there with a MEALVEST meal pass. One review per hotel per student; posting again updates your earlier review.",
          "Reviews show your first name and last initial, never your contact details.",
          "Be honest and specific. We remove reviews that contain abuse, personal data, discrimination, advertising, or claims unrelated to the meal and service. Repeated misuse can lead to account suspension.",
          "Hotels cannot edit or remove student reviews, and MEALVEST does not accept payment to alter ratings.",
        ]}
      />
      <H>2. Conduct</H>
      <L
        items={[
          "Treat hotel staff and other students with respect. Do not attempt to redeem a meal pass twice, share passes, or interfere with another student's plan.",
          "Report problems with a meal or a hotel through the app so MEALVEST can follow up with the partner.",
        ]}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", backgroundColor: COLORS.bg, padding: 20, paddingTop: 48, display: "flex", flexDirection: "column", alignItems: "center" },
  inner: { width: "100%", maxWidth: 760, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16, alignSelf: "flex-start" },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 6, marginBottom: 16, lineHeight: "18px" },
  tabRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, backgroundColor: COLORS.bgDeep, borderRadius: RADIUS.md, padding: 4, alignSelf: "flex-start", marginBottom: 14 },
  tab: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: RADIUS.pill },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textOnDarkMuted },
  tabTextActive: { color: "#fff" },
  card: { display: "flex", flexDirection: "column", padding: 22 },
  h2: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text, margin: "14px 0 6px 0" },
  p: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, lineHeight: "20px", margin: "0 0 8px 0" },
  ul: { margin: "0 0 8px 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 },
  li: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, lineHeight: "20px" },
  footer: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textOnDarkMuted, marginTop: 16, lineHeight: "17px", textAlign: "center" },
};
