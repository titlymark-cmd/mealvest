// End-to-end driver: real Express server + real DISPOSABLE Postgres + mock
// Cyzora (mock-cyzora.js). Started by run-e2e.sh — see README.md. It can
// never reach the real Cyzora API: the server under test is launched with
// CYZORA_BASE_URL pointing at the mock, and the guards below refuse to run
// against anything but a local API, a local database and the mock's key.
const crypto = require("crypto");
const { Client } = require("pg");
const jwt = require("jsonwebtoken");

const API = process.env.API || "http://127.0.0.1:4100";
const MOCK = process.env.MOCK || "http://127.0.0.1:4199";
const DB = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
const WHSEC = process.env.CYZORA_WEBHOOK_SECRET;

function isLocalUrl(u) {
  try {
    const host = new URL(u).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}
for (const [name, value] of [["API", API], ["MOCK", MOCK], ["DATABASE_URL", DB]]) {
  if (!value || !isLocalUrl(value) || /supabase/i.test(value)) {
    console.error(`Refusing to run: ${name} must point at a LOCAL, disposable target (got ${value ? new URL(value).host : "nothing"}).`);
    process.exit(2);
  }
}
if (!JWT_SECRET || !WHSEC) {
  console.error("Refusing to run: JWT_ACCESS_SECRET and CYZORA_WEBHOOK_SECRET must match the server under test (run-e2e.sh sets them).");
  process.exit(2);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
function check(name, cond, detail) {
  record(name, Boolean(cond), detail);
}

let adminToken = null;
async function api(path, { method = "GET", token, body, headers = {} } = {}) {
  // app.set("trust proxy", 1) honours X-Forwarded-For, so admin traffic gets its own
  // rate-limit bucket here exactly as a real admin on a different network would.
  const fwd = token && token === adminToken ? { "X-Forwarded-For": "10.0.0.2" } : {};
  const res = await fetch(API + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...fwd, ...headers },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
async function mock(path, body) {
  const res = await fetch(MOCK + path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}
async function mockRequests(filter) {
  const all = await mock("/__requests");
  return filter ? all.filter(filter) : all;
}
function sign(bodyBuf, secret = WHSEC) {
  return crypto.createHmac("sha256", secret).update(bodyBuf).digest("hex");
}
async function webhook(event, { secret, signature, contentType = "application/json" } = {}) {
  const raw = Buffer.from(JSON.stringify(event));
  const sig = signature === null ? undefined : signature || sign(raw, secret);
  const res = await fetch(API + "/api/webhooks/cyzora", {
    method: "POST",
    headers: { "Content-Type": contentType, ...(sig ? { "X-Cyzora-Signature": sig } : {}) },
    body: raw,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

(async () => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  // ---------- seed ----------
  const adminUser = (await q(
    `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
     VALUES ('e2e-admin@example.com', '254711000001', 'x', 'mealvest_admin', 'password', true, 'active') RETURNING id`
  ))[0];
  await q("INSERT INTO admins (user_id, full_name) VALUES ($1, 'E2E Admin')", [adminUser.id]);
  // Same claims/algorithm/issuer/audience as src/lib/jwt.ts signAccessToken (L2 hardening).
  adminToken = jwt.sign({ userId: adminUser.id, role: "mealvest_admin" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h", issuer: "mealvest-api", audience: "mealvest-app" });

  const regA = await api("/api/auth/register/student", {
    method: "POST",
    body: { fullName: "Student A", email: "e2e-a@example.com", phoneNumber: "0700000001", password: "password123", pin: "1234" },
  });
  const regB = await api("/api/auth/register/student", {
    method: "POST",
    body: { fullName: "Student B", email: "e2e-b@example.com", phoneNumber: "0700000009", password: "password123", pin: "1234" },
  });
  check("seed: student registration works (regression)", regA.status === 201 && regA.data.accessToken && regB.status === 201, `A=${regA.status} B=${regB.status}`);
  const tokenA = regA.data.accessToken;
  const tokenB = regB.data.accessToken;
  const userA = regA.data.user.id;

  const hotelSend = (await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ('E2E Send Money Hotel', 'active', 'send_money', '{"method":"send_money","phoneNumber":"0700000001","accountHolderName":"Owner"}', 10, 10) RETURNING id`
  ))[0];
  const hotelBank = (await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ('E2E Bank Hotel', 'active', 'bank', '{"method":"bank","bankName":"KCB","accountName":"X","accountNumber":"1"}', 10, 10) RETURNING id`
  ))[0];
  const hotelTiny = (await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ('E2E Tiny Hotel', 'active', 'mpesa_till', '{"method":"mpesa_till","tillNumber":"123456","tillName":"Tiny","registeredPhoneNumber":"0700000001"}', 10, 10) RETURNING id`
  ))[0];
  const hotelFail = (await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ('E2E Paybill Hotel', 'active', 'paybill', '{"method":"paybill","paybillNumber":"400200","accountNumber":"ACC-1","paybillBusinessName":"PB","registeredPhoneNumber":"0700000001"}', 10, 10) RETURNING id`
  ))[0];
  const seedOrder = (hotelId, amount, hotelAmount) =>
    q(
      `INSERT INTO orders (user_id, hotel_id, items, amount, status, redeemed, redeemed_at, commission_amount, hotel_amount)
       VALUES ($1, $2, '[{"name":"Ugali"}]', $3, 'redeemed', true, now(), $4, $5) RETURNING id`,
      [userA, hotelId, amount, amount - hotelAmount, hotelAmount]
    );
  await seedOrder(hotelSend.id, 200, 174.46);
  await seedOrder(hotelSend.id, 200, 174.46);
  await seedOrder(hotelBank.id, 200, 180);
  await seedOrder(hotelTiny.id, 20, 18); // KSh 18 < KSh 30 minimum
  await seedOrder(hotelFail.id, 100, 90);

  // ---------- config ----------
  const cfg = await api("/api/payments/config", { token: tokenA });
  if (cfg.data?.testMode !== true) {
    console.error("Refusing to continue: the server under test is not running with an sk_test_ key.", cfg.data);
    process.exit(2);
  }
  check("GET /api/payments/config reports cyzora + hosted checkout + test mode", cfg.status === 200 && cfg.data.provider === "cyzora" && cfg.data.hostedCheckoutAvailable === true && cfg.data.testMode === true, JSON.stringify(cfg.data));

  // ---------- authz ----------
  const noTok = await api("/api/payments/initialize", { method: "POST", body: {} });
  check("initialize without token -> 401", noTok.status === 401, `${noTok.status}`);
  const adminInit = await api("/api/payments/initialize", { method: "POST", token: adminToken, body: {} });
  check("initialize with admin token -> 403 (student-only route)", adminInit.status === 403, `${adminInit.status}`);
  const studentPayouts = await api("/api/admin/payouts/pending", { token: tokenA });
  check("student calling admin payouts -> 403", studentPayouts.status === 403, `${studentPayouts.status}`);

  // ---------- validation ----------
  const before = (await q("SELECT count(*)::int AS n FROM transactions"))[0].n;
  const base = { amount: 5000, numberOfDays: 30, phone: "254700000001", email: "e2e-a@example.com", termsAccepted: true };
  const v1 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: { ...base, termsAccepted: false } });
  const v2 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: { ...base, amount: 100 } });
  const v3 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: { ...base, phone: "0812345678" } });
  const v3b = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: { ...base, phone: "12345" } });
  const v4 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: "{not json" });
  const after = (await q("SELECT count(*)::int AS n FROM transactions"))[0].n;
  check("validation: termsAccepted false -> 400", v1.status === 400, v1.data?.error?.message);
  check("validation: amount below minimum -> 400", v2.status === 400, v2.data?.error?.message);
  check("validation: non-Kenyan phone -> 400 INVALID_PHONE_NUMBER; too-short phone -> 400 VALIDATION_ERROR", v3.status === 400 && v3.data?.error?.code === "INVALID_PHONE_NUMBER" && v3b.status === 400 && v3b.data?.error?.code === "VALIDATION_ERROR", `${v3.data?.error?.code} / ${v3b.data?.error?.code}`);
  check("validation: malformed JSON body -> 4xx (PRE-EXISTING: errorHandler maps body-parser errors to 500)", v4.status >= 400 && v4.status < 500, `${v4.status}`);
  check("validation failures create no transaction rows", after === before, `${before} -> ${after}`);
  check("validation failures never reach Cyzora", (await mockRequests()).length === 0);

  // ---------- STK init ----------
  const init1 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: base });
  check("STK initialize -> 201 with reference/displayText/provider", init1.status === 201 && /^MV-/.test(init1.data.reference) && init1.data.provider === "cyzora" && init1.data.displayText, JSON.stringify(init1.data));
  const ref1 = init1.data.reference;
  let row1 = (await q("SELECT * FROM transactions WHERE provider_reference=$1", [ref1]))[0];
  const ch1 = row1?.provider_transaction_id;
  check("STK row: provider=cyzora channel=stk_push status=pending amount=5000 id recorded", row1 && row1.provider === "cyzora" && row1.provider_channel === "stk_push" && row1.status === "pending" && Number(row1.amount) === 5000 && /^ch_\d+$/.test(ch1 || ""), JSON.stringify({ p: row1?.provider, ch: row1?.provider_channel, st: row1?.status, id: row1?.provider_transaction_id }));
  const chargeReq = (await mockRequests((r) => r.method === "POST" && r.path === "/charges"))[0];
  check("Cyzora POST /charges got X-API-Key, Idempotency-Key=reference, amount in cents, phone, account_ref", chargeReq && chargeReq.headers["x-api-key"] === "sk_test_e2e_key" && chargeReq.headers["idempotency-key"] === ref1 && chargeReq.body.amount === 500000 && chargeReq.body.phone === "254700000001" && chargeReq.body.account_ref === ref1, JSON.stringify(chargeReq?.body));
  check("Secret key never appears in API response", !JSON.stringify(init1.data).includes("sk_test_e2e_key"));

  // ---------- verify pending / authz ----------
  const ver1 = await api(`/api/payments/verify/${ref1}`, { token: tokenA });
  check("verify while Cyzora says pending -> pending, no budget", ver1.status === 200 && ver1.data.status === "pending" && (await q("SELECT count(*)::int AS n FROM budgets WHERE user_id=$1", [userA]))[0].n === 0, JSON.stringify(ver1.data));
  const verB = await api(`/api/payments/verify/${ref1}`, { token: tokenB });
  check("other student verifying my reference -> 403", verB.status === 403, `${verB.status}`);
  const verX = await api(`/api/payments/verify/MV-nope`, { token: tokenA });
  check("verify unknown reference -> 404", verX.status === 404, `${verX.status}`);

  // ---------- webhook signature ----------
  const evSucceeded = { event: "charge.succeeded", livemode: false, data: { id: ch1, account_ref: ref1, amount: 500000, status: "succeeded" } };
  const badSig = await webhook(evSucceeded, { secret: "whsec_wrong" });
  check("webhook with wrong secret -> 401", badSig.status === 401, `${badSig.status} ${JSON.stringify(badSig.data)}`);
  const noSig = await webhook(evSucceeded, { signature: null });
  check("webhook with no signature -> 401", noSig.status === 401, `${noSig.status}`);
  const tampered = await fetch(API + "/api/webhooks/cyzora", { method: "POST", headers: { "Content-Type": "application/json", "X-Cyzora-Signature": sign(Buffer.from(JSON.stringify(evSucceeded))) }, body: JSON.stringify({ ...evSucceeded, data: { ...evSucceeded.data, amount: 1 } }) });
  check("webhook with tampered body -> 401", tampered.status === 401, `${tampered.status}`);
  row1 = (await q("SELECT status FROM transactions WHERE provider_reference=$1", [ref1]))[0];
  check("rejected webhooks changed nothing (row still processing from the pending poll, no budget)", row1.status === "processing" && (await q("SELECT count(*)::int AS n FROM budgets WHERE user_id=$1", [userA]))[0].n === 0, row1.status);

  // webhook says succeeded but Cyzora API still says pending -> must NOT credit
  await mock("/__reset");
  const lying = await webhook(evSucceeded);
  row1 = (await q("SELECT status FROM transactions WHERE provider_reference=$1", [ref1]))[0];
  check("signed charge.succeeded while GET /charges says pending -> re-verified, NOT credited", lying.status === 200 && row1.status === "processing" && (await q("SELECT count(*)::int AS n FROM budgets WHERE user_id=$1", [userA]))[0].n === 0, `${lying.status} row=${row1.status}`);
  check("webhook triggered an independent GET /charges/{id}", (await mockRequests((r) => r.method === "GET" && r.path === `/charges/${ch1}`)).length === 1);

  // now Cyzora really reports succeeded
  await mock("/__config", { chargeStatus: { [ch1]: "succeeded" } });
  const good = await webhook(evSucceeded);
  row1 = (await q("SELECT status, provider_transaction_id FROM transactions WHERE provider_reference=$1", [ref1]))[0];
  let budgets = await q("SELECT id, total_amount, remaining_amount, status FROM budgets WHERE user_id=$1", [userA]);
  check("charge.succeeded + verify succeeded -> 200, row success, exactly one budget of 5000", good.status === 200 && row1.status === "success" && budgets.length === 1 && Number(budgets[0].total_amount) === 5000, `${good.status} row=${row1.status} budgets=${budgets.length}`);
  const dup = await webhook(evSucceeded);
  budgets = await q("SELECT id, remaining_amount FROM budgets WHERE user_id=$1", [userA]);
  check("duplicate charge.succeeded -> 200 and still exactly one budget", dup.status === 200 && budgets.length === 1 && Number(budgets[0].remaining_amount) === 5000, `${dup.status} budgets=${budgets.length} remaining=${budgets[0]?.remaining_amount}`);
  const verDone = await api(`/api/payments/verify/${ref1}`, { token: tokenA });
  check("verify after success -> success, alreadyProcessed=true, provider=cyzora", verDone.data.status === "success" && verDone.data.alreadyProcessed === true && verDone.data.provider === "cyzora", JSON.stringify(verDone.data));
  const legacy = await api(`/api/payments/paystack/verify/${ref1}`, { token: tokenA });
  check("legacy /paystack/verify route dispatches by row provider (regression)", legacy.status === 200 && legacy.data.status === "success", JSON.stringify(legacy.data));
  const st = await api(`/api/payments/${ref1}/status`, { token: tokenA });
  check("GET /:reference/status still works and shows provider", st.status === 200 && st.data.provider === "cyzora" && st.data.status === "success", JSON.stringify(st.data));
  const budgetId = budgets[0].id;

  // ---------- amount mismatch ----------
  const init2 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: base });
  const ref2 = init2.data.reference;
  const row2id = (await q("SELECT provider_transaction_id FROM transactions WHERE provider_reference=$1", [ref2]))[0].provider_transaction_id;
  await mock("/__config", { chargeStatus: { [row2id]: "succeeded" }, chargeAmount: { [row2id]: 10000 } }); // KES 100 paid vs 5000 expected
  const mm = await webhook({ event: "charge.succeeded", livemode: false, data: { id: row2id, account_ref: ref2, amount: 500000, status: "succeeded" } });
  const row2 = (await q("SELECT status, result_description FROM transactions WHERE provider_reference=$1", [ref2]))[0];
  const remAfterMM = Number((await q("SELECT remaining_amount FROM budgets WHERE id=$1", [budgetId]))[0].remaining_amount);
  check("amount mismatch -> row failed + flagged, nothing credited, webhook 200 (final)", mm.status === 200 && row2.status === "failed" && /mismatch/i.test(row2.result_description || "") && remAfterMM === 5000, `${mm.status} ${row2.status} '${row2.result_description}' remaining=${remAfterMM}`);

  // ---------- failed charge ----------
  const init3 = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: { ...base, phone: "254700000002" } });
  const ref3 = init3.data.reference;
  const row3id = (await q("SELECT provider_transaction_id FROM transactions WHERE provider_reference=$1", [ref3]))[0].provider_transaction_id;
  await mock("/__config", { chargeStatus: { [row3id]: "failed" } });
  const failedEv = await webhook({ event: "charge.failed", livemode: false, retryable: false, data: { id: row3id, account_ref: ref3, status: "failed" } });
  const row3 = (await q("SELECT status FROM transactions WHERE provider_reference=$1", [ref3]))[0];
  check("charge.failed (not retryable) -> row failed, budget unchanged", failedEv.status === 200 && row3.status === "failed" && Number((await q("SELECT remaining_amount FROM budgets WHERE id=$1", [budgetId]))[0].remaining_amount) === 5000, `${failedEv.status} ${row3.status}`);

  // ---------- hosted checkout ----------
  await mock("/__reset");
  const co = await api("/api/payments/cyzora/checkout/initialize", { method: "POST", token: tokenA, body: { ...base, amount: 1500, numberOfDays: 7 }, headers: { Origin: "http://localhost:3000" } });
  const refCo = co.data.reference;
  const rowCo = (await q("SELECT * FROM transactions WHERE provider_reference=$1", [refCo]))[0];
  check("hosted checkout -> 201 with checkoutUrl, expiresIn 1800", co.status === 201 && /^https:\/\/checkout\.cyzora\.co\.ke\//.test(co.data.checkoutUrl) && co.data.expiresIn === 1800, JSON.stringify(co.data));
  check("hosted checkout row: channel=hosted_checkout, Cyzora reference stored, pending", rowCo && rowCo.provider_channel === "hosted_checkout" && /^CZ_/.test(rowCo.provider_transaction_id) && rowCo.status === "pending", JSON.stringify({ ch: rowCo?.provider_channel, id: rowCo?.provider_transaction_id, st: rowCo?.status }));
  const coReq = (await mockRequests((r) => r.path === "/transactions/initialize"))[0];
  check("POST /transactions/initialize body: cents, account_ref, callback_url with OUR reference, cancel_url, expires_in, phone, email, metadata ≤20", coReq && coReq.body.amount === 150000 && coReq.body.account_ref === refCo && coReq.body.callback_url === `http://localhost:3000/payment/callback?reference=${encodeURIComponent(refCo)}` && coReq.body.cancel_url === "http://localhost:3000/student/budget-onboarding" && coReq.body.expires_in === 1800 && coReq.body.customer_phone === "254700000001" && coReq.body.customer_email === "e2e-a@example.com" && coReq.body.description.length <= 200 && Object.keys(coReq.body.metadata || {}).length <= 20 && coReq.headers["idempotency-key"] === refCo, JSON.stringify(coReq?.body));
  const retryable = await webhook({ event: "charge.failed", livemode: false, retryable: true, data: { reference: rowCo.provider_transaction_id, account_ref: refCo, status: "failed" } });
  const rowCo2 = (await q("SELECT status FROM transactions WHERE provider_reference=$1", [refCo]))[0];
  check("charge.failed retryable:true on checkout -> 200 ignored, row stays pending", retryable.status === 200 && retryable.data.ignored === "retryable_failure" && rowCo2.status === "pending", `${retryable.status} ${JSON.stringify(retryable.data)} row=${rowCo2.status}`);
  // simulate the redirect: student lands on callback -> frontend polls verify. Cyzora still pending => pending
  const coVer1 = await api(`/api/payments/verify/${refCo}`, { token: tokenA });
  check("callback-screen poll while session pending -> pending (redirect never trusted)", coVer1.data.status === "pending", JSON.stringify(coVer1.data));
  await mock("/__config", { sessionStatus: { [rowCo.provider_transaction_id]: "succeeded" } });
  const coVer2 = await api(`/api/payments/verify/${refCo}`, { token: tokenA });
  const remAfterCo = Number((await q("SELECT remaining_amount FROM budgets WHERE id=$1", [budgetId]))[0].remaining_amount);
  check("verify via GET /transactions/verify/{ref} succeeded -> success, existing budget credited +1500 once", coVer2.data.status === "success" && remAfterCo === 6500, `${JSON.stringify(coVer2.data)} remaining=${remAfterCo}`);
  check("verify used the checkout endpoint, not /charges", (await mockRequests((r) => r.path === `/transactions/verify/${rowCo.provider_transaction_id}`)).length >= 1);
  const coDup = await webhook({ event: "charge.succeeded", livemode: false, data: { reference: rowCo.provider_transaction_id, account_ref: refCo, status: "succeeded", amount: 150000 } });
  const remAfterCoDup = Number((await q("SELECT remaining_amount FROM budgets WHERE id=$1", [budgetId]))[0].remaining_amount);
  check("late charge.succeeded after verify already credited -> 200, no double credit", coDup.status === 200 && remAfterCoDup === 6500, `remaining=${remAfterCoDup}`);

  // ---------- webhook edge cases ----------
  const unknown = await webhook({ event: "charge.succeeded", livemode: false, data: { id: "ch_999", account_ref: "MV-unknown" } });
  check("webhook for unknown transaction -> 404 (Cyzora retries)", unknown.status === 404, `${unknown.status}`);
  await q(
    `INSERT INTO transactions (user_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key, number_of_days, provider_channel)
     VALUES ($1, 500, '254700000001', 'budget_topup', 'pending', 'cyzora', 'MV-race', 'MV-race', 7, 'stk_push')`,
    [userA]
  );
  const race = await webhook({ event: "charge.succeeded", livemode: false, data: { id: "ch_x", account_ref: "MV-race" } });
  check("webhook racing our initialize (no provider id yet) -> 404 retry, row untouched", race.status === 404 && (await q("SELECT status FROM transactions WHERE provider_reference='MV-race'"))[0].status === "pending", `${race.status}`);
  const live = await webhook({ event: "charge.succeeded", livemode: true, data: { id: ch1, account_ref: ref1 } });
  check("livemode:true event on a test-key server -> 200 ignored (mode_mismatch)", live.status === 200 && live.data.ignored === "mode_mismatch", JSON.stringify(live.data));
  const testEv = await webhook({ event: "webhook.test", livemode: false });
  check("webhook.test -> 200", testEv.status === 200, `${testEv.status}`);
  const unhandled = await webhook({ event: "something.new", livemode: false, data: {} });
  check("unknown event -> 200 ignored", unhandled.status === 200 && unhandled.data.ignored === "unhandled_event");
  const textCT = await webhook({ event: "webhook.test", livemode: false }, { contentType: "text/plain" });
  check("webhook with non-JSON content-type still raw-verified -> 200", textCT.status === 200, `${textCT.status}`);
  const badJson = await fetch(API + "/api/webhooks/cyzora", { method: "POST", headers: { "Content-Type": "application/json", "X-Cyzora-Signature": sign(Buffer.from("{nope")) }, body: "{nope" });
  check("validly signed but invalid JSON -> 400", badJson.status === 400, `${badJson.status}`);
  const paystackRow = await q(
    `INSERT INTO transactions (user_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key, number_of_days)
     VALUES ($1, 500, '254700000001', 'budget_topup', 'pending', 'paystack', 'MV-paystack-row', 'MV-paystack-row', 7) RETURNING id`,
    [userA]
  );
  const crossProv = await webhook({ event: "charge.succeeded", livemode: false, data: { id: "ch_z", account_ref: "MV-paystack-row" } });
  check("Cyzora webhook naming a Paystack row -> 200 ignored, row untouched", crossProv.status === 200 && crossProv.data.ignored === "not_a_cyzora_row" && (await q("SELECT status FROM transactions WHERE id=$1", [paystackRow[0].id]))[0].status === "pending", JSON.stringify(crossProv.data));
  const psVerify = await api(`/api/payments/verify/MV-paystack-row`, { token: tokenA });
  check("verify on a Paystack row goes to the Paystack adapter, never Cyzora (regression)", /^PAYSTACK_/.test(psVerify.data?.error?.code || "") && (await mockRequests((r) => r.method === "GET" && r.path.startsWith("/charges"))).length === 0, JSON.stringify(psVerify.data));

  // ---------- provider errors ----------
  await mock("/__reset");
  await mock("/__config", { rateLimitNext: 2 });
  const rl = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: base });
  const rlReqs = await mockRequests((r) => r.method === "POST" && r.path === "/charges");
  check("429 twice then success -> initialize still 201 after backoff, same Idempotency-Key on every attempt", rl.status === 201 && rlReqs.length === 3 && new Set(rlReqs.map((r) => r.headers["idempotency-key"])).size === 1, `${rl.status} attempts=${rlReqs.length}`);
  await mock("/__config", { chargeError: { status: 422, error: "phone is invalid" } });
  const rej = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: base });
  check("Cyzora 422 {error} -> 400 with Cyzora's message shown", rej.status === 400 && rej.data.error.message === "phone is invalid", JSON.stringify(rej.data));
  await mock("/__config", { chargeError: { status: 401, error: "bad key sk_test_e2e_key" } });
  const authErr = await api("/api/payments/initialize", { method: "POST", token: tokenA, body: base });
  check("Cyzora 401 -> 500 CYZORA_AUTH_FAILED without echoing the key", authErr.status === 500 && authErr.data.error.code === "CYZORA_AUTH_FAILED" && !JSON.stringify(authErr.data).includes("sk_test_e2e_key"), JSON.stringify(authErr.data));

  // ---------- boost ----------
  const boost = await api("/api/payments/boost/initialize", { method: "POST", token: tokenA, body: { amount: 500, phone: "254700000001", email: "e2e-a@example.com" } });
  const refBoost = boost.data.reference;
  const boostId = (await q("SELECT provider_transaction_id, type, budget_id FROM transactions WHERE provider_reference=$1", [refBoost]))[0];
  check("boost initialize -> 201, plan_boost row tied to the active budget", boost.status === 201 && boostId.type === "plan_boost" && boostId.budget_id === budgetId, JSON.stringify(boost.data));
  await mock("/__config", { chargeStatus: { [boostId.provider_transaction_id]: "succeeded" } });
  await webhook({ event: "charge.succeeded", livemode: false, data: { id: boostId.provider_transaction_id, account_ref: refBoost } });
  await webhook({ event: "charge.succeeded", livemode: false, data: { id: boostId.provider_transaction_id, account_ref: refBoost } });
  const remAfterBoost = Number((await q("SELECT remaining_amount FROM budgets WHERE id=$1", [budgetId]))[0].remaining_amount);
  check("boost credited exactly once despite duplicate webhook (+500)", remAfterBoost === 7000, `remaining=${remAfterBoost}`);
  const boostB = await api("/api/payments/boost/initialize", { method: "POST", token: tokenB, body: { amount: 500, phone: "254700000009", email: "e2e-b@example.com" } });
  check("boost without an active plan -> 404 BUDGET_NOT_FOUND", boostB.status === 404 && boostB.data.error.code === "BUDGET_NOT_FOUND");

  // ---------- payouts ----------
  await mock("/__reset");
  const pending = await api("/api/admin/payouts/pending", { token: adminToken });
  const byName = Object.fromEntries((pending.data.hotels || []).map((h) => [h.hotel_name, h]));
  check("admin pending payouts: provider=cyzora, send_money/till/paybill supported, bank not", pending.status === 200 && pending.data.provider === "cyzora" && byName["E2E Send Money Hotel"]?.payout_supported === true && byName["E2E Paybill Hotel"]?.payout_supported === true && byName["E2E Tiny Hotel"]?.payout_supported === true && byName["E2E Bank Hotel"]?.payout_supported === false, JSON.stringify(Object.values(byName).map((h) => [h.hotel_name, h.payout_supported, h.pending_amount])));
  const fee = await api("/api/admin/payouts/fee-preview?amount=1000", { token: adminToken });
  check("fee preview -> KSh 15 from 1500 cents, amount sent in cents", fee.status === 200 && fee.data.feeKes === 15 && (await mockRequests((r) => r.path === "/payouts/fee-preview?amount=100000")).length === 1, JSON.stringify(fee.data));

  const trig = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelSend.id } });
  const payout1 = trig.data.payout;
  const poReq = (await mockRequests((r) => r.method === "POST" && r.path === "/payouts"))[0];
  const claimed = (await q("SELECT count(*)::int AS n FROM orders WHERE hotel_id=$1 AND payout_id=$2", [hotelSend.id, payout1?.id]))[0].n;
  check("trigger payout (send_money) -> 201 processing, provider=cyzora, transfer_code=po id, both orders claimed", trig.status === 201 && payout1.status === "processing" && payout1.provider === "cyzora" && /^po_/.test(payout1.transfer_code) && claimed === 2, JSON.stringify({ st: payout1?.status, p: payout1?.provider, tc: payout1?.transfer_code, claimed }));
  check("POST /payouts body: amount 34892 cents (2×174.46), destination mobile + 254 phone, Idempotency-Key=PO ref", poReq && poReq.body.amount === 34892 && poReq.body.destination_type === "mobile" && poReq.body.phone === "254700000001" && poReq.headers["idempotency-key"] === payout1.transfer_reference, JSON.stringify(poReq?.body));
  const trigAgain = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelSend.id } });
  check("second trigger for same hotel -> 404 NOTHING_TO_PAY_OUT, no second Cyzora call", trigAgain.status === 404 && trigAgain.data.error.code === "NOTHING_TO_PAY_OUT" && (await mockRequests((r) => r.method === "POST" && r.path === "/payouts")).length === 1, JSON.stringify(trigAgain.data));
  const trigBank = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelBank.id } });
  check("bank hotel -> 400 PAYOUT_METHOD_NOT_SUPPORTED, orders not claimed", trigBank.status === 400 && trigBank.data.error.code === "PAYOUT_METHOD_NOT_SUPPORTED" && (await q("SELECT count(*)::int AS n FROM orders WHERE hotel_id=$1 AND payout_id IS NOT NULL", [hotelBank.id]))[0].n === 0, JSON.stringify(trigBank.data));
  const trigTiny = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelTiny.id } });
  const tinyClaimed = (await q("SELECT count(*)::int AS n FROM orders WHERE hotel_id=$1 AND payout_id IS NOT NULL", [hotelTiny.id]))[0].n;
  const tinyRows = (await q("SELECT count(*)::int AS n FROM hotel_payouts WHERE hotel_id=$1", [hotelTiny.id]))[0].n;
  // Since the KSh 40 payout threshold (AUTO_PAYOUT_THRESHOLD_KES) a below-threshold balance is refused BEFORE anything is claimed: 409, no payout row, earnings stay payable, no Cyzora call.
  check("below KSh 40 threshold -> 409 BELOW_PAYOUT_THRESHOLD, nothing claimed, no payout row, no Cyzora call", trigTiny.status === 409 && trigTiny.data.error.code === "BELOW_PAYOUT_THRESHOLD" && tinyClaimed === 0 && tinyRows === 0 && (await mockRequests((r) => r.method === "POST" && r.path === "/payouts")).length === 1, JSON.stringify({ st: trigTiny.status, code: trigTiny.data?.error?.code, claimed: tinyClaimed, rows: tinyRows }));

  const refreshNoop = await api(`/api/admin/payouts/${payout1.id}/refresh`, { method: "POST", token: adminToken });
  check("refresh on a Cyzora payout -> returns row unchanged (webhook-finalized)", refreshNoop.status === 200 && refreshNoop.data.payout.status === "processing");
  const unknownPo = await webhook({ event: "payout.paid", livemode: false, data: { id: "po_unknown" } });
  check("payout.paid for unknown payout id -> 404 (retry)", unknownPo.status === 404, `${unknownPo.status}`);
  const paid = await webhook({ event: "payout.paid", livemode: false, data: { id: payout1.transfer_code, status: "paid" } });
  const po1 = (await q("SELECT status FROM hotel_payouts WHERE id=$1", [payout1.id]))[0];
  check("payout.paid -> 200, payout successful", paid.status === 200 && po1.status === "successful", `${paid.status} ${po1.status}`);
  const paidDup = await webhook({ event: "payout.failed", livemode: false, data: { id: payout1.transfer_code } });
  const po1b = (await q("SELECT status FROM hotel_payouts WHERE id=$1", [payout1.id]))[0];
  check("late payout.failed after paid -> 200, status stays successful, orders stay claimed", paidDup.status === 200 && po1b.status === "successful" && (await q("SELECT count(*)::int AS n FROM orders WHERE payout_id=$1", [payout1.id]))[0].n === 2);

  const trigPb = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelFail.id } });
  const payout2 = trigPb.data.payout;
  const pbReq = (await mockRequests((r) => r.method === "POST" && r.path === "/payouts"))[1];
  check("paybill hotel -> destination paybill with short_code + account_ref", trigPb.status === 201 && pbReq?.body.destination_type === "paybill" && pbReq.body.short_code === "400200" && pbReq.body.account_ref === "ACC-1", JSON.stringify(pbReq?.body));
  const failedPo = await webhook({ event: "payout.failed", livemode: false, data: { id: payout2.transfer_code, status: "failed" } });
  const po2 = (await q("SELECT status, failure_reason FROM hotel_payouts WHERE id=$1", [payout2.id]))[0];
  const released = (await q("SELECT count(*)::int AS n FROM orders WHERE hotel_id=$1 AND payout_id IS NULL", [hotelFail.id]))[0].n;
  check("payout.failed -> payout failed, orders released for the next run", failedPo.status === 200 && po2.status === "failed" && released === 1, JSON.stringify({ po2, released }));
  const retrig = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelFail.id } });
  check("re-trigger after failure -> new payout with a NEW reference (no reuse of failed idempotency key)", retrig.status === 201 && retrig.data.payout.transfer_reference !== payout2.transfer_reference && retrig.data.payout.status === "processing");
  await mock("/__config", { payoutError: { status: 403, error: "business not verified for live payouts" } });
  // use the send-money hotel again with a fresh order to exercise a provider rejection
  await seedOrder(hotelSend.id, 100, 90);
  const trigRefused = await api("/api/admin/payouts/trigger", { method: "POST", token: adminToken, body: { hotelId: hotelSend.id } });
  const refusedRow = trigRefused.data.payout;
  const refusedReleased = (await q("SELECT count(*)::int AS n FROM orders WHERE hotel_id=$1 AND payout_id IS NULL", [hotelSend.id]))[0].n;
  check("Cyzora refuses payout (403 unverified business) -> row failed with reason, orders released", trigRefused.status === 201 && refusedRow?.status === "failed" && refusedRow?.failure_reason && refusedReleased === 1, JSON.stringify({ http: trigRefused.status, st: refusedRow?.status, reason: refusedRow?.failure_reason, released: refusedReleased, err: trigRefused.data?.error }));
  const history = await api("/api/admin/payouts", { token: adminToken });
  check("admin payout history lists Cyzora payouts (regression of existing endpoint)", history.status === 200 && history.data.payouts.some((p) => p.provider === "cyzora"));

  // ---------- savings withdrawal (10% MEALVEST fee, locked until plan end) ----------
  await mock("/__reset");
  const wsLocked = await api("/api/student/withdrawal-status", { token: tokenA });
  check("withdrawal status: locked while plan active, fee 10%, net = 90% of remaining", wsLocked.status === 200 && wsLocked.data.locked === true && wsLocked.data.reason === "CONTRACT_ACTIVE" && wsLocked.data.feePercent === 10 && Math.abs(wsLocked.data.netAmount - 0.9 * Number(wsLocked.data.availableSavings)) < 0.011, JSON.stringify(wsLocked.data));
  const earlyWithdraw = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true, pin: "1234" } });
  check("withdraw before plan end -> 403 CONTRACT_ACTIVE (lock enforced server-side)", earlyWithdraw.status === 403 && earlyWithdraw.data.error.code === "CONTRACT_ACTIVE", JSON.stringify(earlyWithdraw.data));
  const noAccept = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001" } });
  check("withdraw without acceptFee -> 400", noAccept.status === 400);
  // End the plan (server clock is the only clock: we move end_date into the past in the DB)
  await q("UPDATE budgets SET end_date = CURRENT_DATE - 1 WHERE id = $1", [budgetId]);
  const wsOpen = await api("/api/student/withdrawal-status", { token: tokenA });
  const grossBefore = Number(wsOpen.data.availableSavings);
  check("withdrawal status: unlocked once end_date passed", wsOpen.data.locked === false && wsOpen.data.reason === null && grossBefore > 0, JSON.stringify(wsOpen.data));
  const badPhone = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0812345678", acceptFee: true, pin: "1234" } });
  check("withdraw to a non-Kenyan number -> 400 INVALID_PHONE_NUMBER", badPhone.status === 400 && badPhone.data.error.code === "INVALID_PHONE_NUMBER");
  // Security fix M1: the withdrawal needs the PIN, verified server-side.
  const noPin = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true } });
  check("withdraw without PIN -> 400 PIN_REQUIRED, nothing reserved", noPin.status === 400 && noPin.data.error.code === "PIN_REQUIRED" && (await q("SELECT status FROM budgets WHERE user_id=(SELECT id FROM users WHERE email='e2e-a@example.com') AND status='active'")).length === 1, JSON.stringify(noPin.data));
  const wrongPin = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true, pin: "9999" } });
  check("withdraw with wrong PIN -> 401 PIN_INCORRECT, nothing reserved", wrongPin.status === 401 && wrongPin.data.error.code === "PIN_INCORRECT", JSON.stringify(wrongPin.data));
  const wd = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true, pin: "1234" } });
  const expectedFee = Math.round(grossBefore * 10) / 100;
  check("withdraw -> 201 with gross/fee/net; fee is exactly 10%, student gets the remainder", wd.status === 201 && wd.data.gross_savings === grossBefore && wd.data.platform_fee_percent === 10 && wd.data.platform_fee_amount === expectedFee && Math.abs(wd.data.student_amount + wd.data.platform_fee_amount - grossBefore) < 0.001 && wd.data.status === "pending", JSON.stringify(wd.data));
  const wdRow = (await q("SELECT * FROM savings_withdrawals WHERE id = $1", [wd.data.withdrawalId]))[0];
  const budgetAfter = (await q("SELECT status, remaining_amount FROM budgets WHERE id = $1", [budgetId]))[0];
  check("withdrawal row persisted with fee columns, destination normalised, plan closed with 0 remaining", wdRow && Number(wdRow.platform_fee_percent) === 10 && Number(wdRow.student_amount) + Number(wdRow.platform_fee_amount) === Number(wdRow.gross_savings) && wdRow.payout_destination === "254700000001" && budgetAfter.status === "completed" && Number(budgetAfter.remaining_amount) === 0, JSON.stringify({ wdRow: wdRow && { s: wdRow.student_amount, f: wdRow.platform_fee_amount, g: wdRow.gross_savings, d: wdRow.payout_destination }, budgetAfter }));
  const wdAgain = await api("/api/student/withdraw", { method: "POST", token: tokenA, body: { payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true, pin: "1234" } });
  check("second withdrawal -> 404 (plan no longer active), never a double payout", wdAgain.status === 404, `${wdAgain.status}`);
  const myWd = await api("/api/student/withdrawals", { token: tokenA });
  const myWdB = await api("/api/student/withdrawals", { token: tokenB });
  check("student withdrawal history shows own row only; other student sees none", myWd.data.withdrawals.length === 1 && myWd.data.withdrawals[0].id === wd.data.withdrawalId && myWdB.data.withdrawals.length === 0);
  const myPayments = await api("/api/student/payments", { token: tokenA });
  const myPaymentsB = await api("/api/student/payments", { token: tokenB });
  check("student payment ledger lists own transactions with provider refs; other student sees own only", myPayments.status === 200 && myPayments.data.payments.length >= 5 && myPayments.data.payments.every((p) => p.provider_reference) && myPaymentsB.data.payments.length === 0, `A=${myPayments.data.payments?.length} B=${myPaymentsB.data.payments?.length}`);

  // admin follow-up: status transitions
  const adminWd = await api("/api/admin/withdrawals?status=unresolved", { token: adminToken });
  check("admin sees the pending withdrawal with fee fields", adminWd.data.withdrawals.some((w) => w.id === wd.data.withdrawalId && Number(w.platform_fee_amount) === expectedFee));
  const completeNoRef = await api(`/api/admin/withdrawals/${wd.data.withdrawalId}`, { method: "PATCH", token: adminToken, body: { status: "completed" } });
  check("admin completing without a payout reference -> 400", completeNoRef.status === 400);
  const studentPatch = await api(`/api/admin/withdrawals/${wd.data.withdrawalId}`, { method: "PATCH", token: tokenA, body: { status: "completed", payoutReference: "X" } });
  check("student cannot update a withdrawal -> 403", studentPatch.status === 403);
  const complete = await api(`/api/admin/withdrawals/${wd.data.withdrawalId}`, { method: "PATCH", token: adminToken, body: { status: "completed", payoutReference: "QAB12345XY" } });
  check("admin marks completed with reference -> 200, processed_at/by recorded", complete.status === 200 && complete.data.withdrawal.status === "completed" && complete.data.withdrawal.payout_reference === "QAB12345XY" && complete.data.withdrawal.processed_at && complete.data.withdrawal.processed_by === adminUser.id, JSON.stringify(complete.data));
  const flipBack = await api(`/api/admin/withdrawals/${wd.data.withdrawalId}`, { method: "PATCH", token: adminToken, body: { status: "rejected", note: "oops" } });
  check("completed withdrawal is final -> 409 on any further change", flipBack.status === 409 && flipBack.data.error.code === "WITHDRAWAL_FINAL");
  const dashAfter = await api("/api/student/withdrawal-status", { token: tokenA });
  check("withdrawal status after payout: no active budget + latest withdrawal completed", dashAfter.data.reason === "NO_ACTIVE_BUDGET" && dashAfter.data.latestWithdrawal?.status === "completed");

  // ---------- reviews ----------
  const pubReviewsEmpty = await api(`/api/hotels/${hotelSend.id}/reviews`);
  check("public reviews: empty summary for a hotel with no reviews", pubReviewsEmpty.status === 200 && pubReviewsEmpty.data.summary.count === 0 && pubReviewsEmpty.data.reviews.length === 0);
  const meNotEligible = await api(`/api/hotels/${hotelSend.id}/reviews/me`, { token: tokenB });
  check("student with no redeemed order there -> not eligible", meNotEligible.status === 200 && meNotEligible.data.eligible === false && meNotEligible.data.reason === "NO_REDEEMED_ORDER");
  const postIneligible = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: tokenB, body: { rating: 5, comment: "fake" } });
  check("posting without a redeemed order -> 403 REVIEW_NOT_ELIGIBLE", postIneligible.status === 403 && postIneligible.data.error.code === "REVIEW_NOT_ELIGIBLE");
  const postAnon = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", body: { rating: 5 } });
  check("posting a review unauthenticated -> 401", postAnon.status === 401);
  const postAdmin = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: adminToken, body: { rating: 5 } });
  check("admin posting a review -> 403 (students only)", postAdmin.status === 403);
  const badRating = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: tokenA, body: { rating: 7 } });
  check("rating outside 1-5 -> 400", badRating.status === 400);
  const longComment = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: tokenA, body: { rating: 4, comment: "x".repeat(501) } });
  check("comment over 500 chars -> 400", longComment.status === 400);
  const post1 = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: tokenA, body: { rating: 4, comment: "Great ugali, quick service." } });
  check("eligible student posts review -> 201", post1.status === 201 && post1.data.review.rating === 4, JSON.stringify(post1.data));
  const post2 = await api(`/api/hotels/${hotelSend.id}/reviews`, { method: "POST", token: tokenA, body: { rating: 5, comment: "Even better the second time." } });
  const reviewCount = (await q("SELECT count(*)::int AS n FROM hotel_reviews WHERE hotel_id=$1", [hotelSend.id]))[0].n;
  check("posting again updates the same review (200), never a duplicate row", post2.status === 200 && post2.data.review.rating === 5 && reviewCount === 1, `count=${reviewCount}`);
  const pubReviews = await api(`/api/hotels/${hotelSend.id}/reviews`);
  check("public summary: avg 5.0, count 1, reviewer shown as first name + initial, no email", pubReviews.data.summary.average === 5 && pubReviews.data.summary.count === 1 && pubReviews.data.reviews[0].reviewer === "Student A." && !JSON.stringify(pubReviews.data).includes("e2e-a@example.com"), JSON.stringify(pubReviews.data));
  const hotelsList = await api("/api/hotels");
  const listed = hotelsList.data.hotels.find((h) => h.id === hotelSend.id);
  check("hotel list carries average_rating/review_count", listed && Number(listed.average_rating) === 5 && listed.review_count === 1, JSON.stringify(listed && { r: listed.average_rating, c: listed.review_count }));
  const menuWithRating = await api(`/api/hotels/${hotelSend.id}/menu`);
  check("hotel menu header carries rating too", Number(menuWithRating.data.hotel.average_rating) === 5 && menuWithRating.data.hotel.review_count === 1);
  const del = await api(`/api/hotels/${hotelSend.id}/reviews/me`, { method: "DELETE", token: tokenA });
  const delAgain = await api(`/api/hotels/${hotelSend.id}/reviews/me`, { method: "DELETE", token: tokenA });
  check("delete own review -> 200, second delete -> 404", del.status === 200 && delAgain.status === 404);

  // ---------- analytics date range + admin transaction ledger ----------
  const presets = await api("/api/admin/analytics/revenue?days=7", { token: adminToken });
  check("analytics preset 7d -> 7 daily points, from/to echoed", presets.status === 200 && presets.data.days === 7 && presets.data.daily.length === 7 && presets.data.preset === true && presets.data.from && presets.data.to);
  const custom = await api("/api/admin/analytics/revenue?from=2026-01-01&to=2026-01-10", { token: adminToken });
  check("analytics custom range -> inclusive 10 days, window totals present", custom.status === 200 && custom.data.days === 10 && custom.data.daily.length === 10 && custom.data.daily[0].date.startsWith("2026-01-01") && custom.data.window && typeof custom.data.window.gross === "number", JSON.stringify({ days: custom.data.days, n: custom.data.daily?.length, first: custom.data.daily?.[0]?.date }));
  const badRange = await api("/api/admin/analytics/revenue?from=2026-02-30&to=2026-03-01", { token: adminToken });
  const reversed = await api("/api/admin/analytics/revenue?from=2026-03-01&to=2026-02-01", { token: adminToken });
  const tooLong = await api("/api/admin/analytics/revenue?from=2024-01-01&to=2026-01-01", { token: adminToken });
  check("analytics rejects invalid date, reversed range and >366 days with 400", badRange.status === 400 && reversed.status === 400 && tooLong.status === 400, `${badRange.status}/${reversed.status}/${tooLong.status}`);
  const todayStr = new Date().toISOString().slice(0, 10);
  const txAll = await api(`/api/admin/transactions?from=${todayStr}&to=${todayStr}`, { token: adminToken });
  check("admin transactions ledger: today's rows with student + provider ids + totals", txAll.status === 200 && txAll.data.transactions.length >= 5 && txAll.data.transactions.every((t) => t.student_email && t.provider_reference) && Number(txAll.data.totals.count) === txAll.data.transactions.length, `n=${txAll.data.transactions?.length}`);
  const txFiltered = await api(`/api/admin/transactions?status=success&provider=cyzora&type=plan_boost`, { token: adminToken });
  check("ledger filters: status+provider+type narrow to the boost row", txFiltered.status === 200 && txFiltered.data.transactions.length === 1 && txFiltered.data.transactions[0].type === "plan_boost", `n=${txFiltered.data.transactions?.length}`);
  const txSearch = await api(`/api/admin/transactions?search=${encodeURIComponent(ref1)}`, { token: adminToken });
  check("ledger search by our reference finds exactly that row", txSearch.data.transactions.length === 1 && txSearch.data.transactions[0].provider_reference === ref1);
  const txBad = await api(`/api/admin/transactions?status=bogus`, { token: adminToken });
  check("ledger rejects unknown status filter -> 400", txBad.status === 400);
  const txStudent = await api(`/api/admin/transactions`, { token: tokenA });
  check("student cannot read the admin ledger -> 403", txStudent.status === 403);

  // ---------- regression: unrelated endpoints ----------
  const health = await api("/api/health");
  const hotelsPublic = await api("/api/hotels", { token: tokenA });
  const overview = await api("/api/admin/overview", { token: adminToken });
  check("regression: /api/health, /api/hotels, /api/admin/overview respond 200", health.status === 200 && hotelsPublic.status === 200 && overview.status === 200, `${health.status}/${hotelsPublic.status}/${overview.status}`);

  await db.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail || ""}`);
  }
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(2);
});
