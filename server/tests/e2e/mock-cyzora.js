// Mock of the Cyzora API surface the server calls, built from the facts
// in the integration brief. Records every request for the E2E driver
// and lets it steer outcomes via POST /__config. Never used by the app.
const http = require("http");

const PORT = Number(process.env.MOCK_PORT || 4199);
const API_KEY = process.env.MOCK_API_KEY || "sk_test_e2e_key";

const state = {
  requests: [],
  charges: {}, // id -> { id, status, amount, phone, account_ref }
  sessions: {}, // reference -> { reference, status, amount, account_ref }
  payouts: {},
  counter: 0,
  config: {
    chargeStatus: {}, // chargeId -> status to report on GET
    chargeAmount: {}, // chargeId -> amount override on GET (cents)
    sessionStatus: {}, // reference -> status on verify
    rateLimitNext: 0, // number of upcoming POST /charges calls to answer 429
    chargeError: null, // { status, error } to return on next POST /charges
    payoutError: null,
    payoutStatus: "requested",
  },
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({ __invalid: raw });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const body = await readBody(req);

  // ---- test control plane ----
  if (url.pathname === "/__requests") return json(res, 200, state.requests);
  if (url.pathname === "/__reset") {
    state.requests = [];
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/__config") {
    Object.assign(state.config, body);
    return json(res, 200, state.config);
  }
  if (url.pathname === "/__state") return json(res, 200, { charges: state.charges, sessions: state.sessions, payouts: state.payouts });

  state.requests.push({ method: req.method, path: url.pathname + url.search, headers: req.headers, body });

  if (req.headers["x-api-key"] !== API_KEY) return json(res, 401, { error: "Invalid API key" });

  const needsIdem = req.method === "POST" && ["/charges", "/transactions/initialize", "/payouts"].includes(url.pathname);
  if (needsIdem && !req.headers["idempotency-key"]) return json(res, 400, { error: "Idempotency-Key header is required" });
  if (needsIdem && !Number.isInteger(body.amount)) return json(res, 422, { error: "amount must be an integer in cents" });

  if (req.method === "POST" && url.pathname === "/charges") {
    if (state.config.rateLimitNext > 0) {
      state.config.rateLimitNext -= 1;
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "1" });
      return res.end(JSON.stringify({ error: "Too many requests" }));
    }
    if (state.config.chargeError) {
      const e = state.config.chargeError;
      state.config.chargeError = null;
      return json(res, e.status, { error: e.error });
    }
    if (!/^(254|0)\d{9}$/.test(String(body.phone))) return json(res, 422, { error: "phone is invalid" });
    const id = `ch_${++state.counter}`;
    state.charges[id] = { id, status: "pending", amount: body.amount, phone: body.phone, account_ref: body.account_ref || null, currency: "KES" };
    return json(res, 201, state.charges[id]);
  }

  const chargeMatch = url.pathname.match(/^\/charges\/([^/]+)$/);
  if (req.method === "GET" && chargeMatch) {
    const c = state.charges[decodeURIComponent(chargeMatch[1])];
    if (!c) return json(res, 404, { error: "Charge not found" });
    const status = state.config.chargeStatus[c.id] || c.status;
    const amount = state.config.chargeAmount[c.id] ?? c.amount;
    return json(res, 200, { ...c, status, amount });
  }

  if (req.method === "POST" && url.pathname === "/transactions/initialize") {
    for (const u of [body.callback_url, body.cancel_url]) {
      if (u) {
        const p = new URL(u);
        const ok = p.protocol === "https:" || (p.protocol === "http:" && ["localhost", "127.0.0.1"].includes(p.hostname));
        if (!ok) return json(res, 422, { error: "callback_url must be https" });
      }
    }
    if (body.description && body.description.length > 200) return json(res, 422, { error: "description too long" });
    if (body.expires_in !== undefined && (body.expires_in < 300 || body.expires_in > 86400)) return json(res, 422, { error: "expires_in out of range" });
    const reference = `CZ_${++state.counter}`;
    state.sessions[reference] = { reference, status: "pending", amount: body.amount, account_ref: body.account_ref || null, currency: "KES" };
    return json(res, 201, { reference, checkout_url: `https://checkout.cyzora.co.ke/pay/${reference}` });
  }

  const verifyMatch = url.pathname.match(/^\/transactions\/verify\/([^/]+)$/);
  if (req.method === "GET" && verifyMatch) {
    const s = state.sessions[decodeURIComponent(verifyMatch[1])];
    if (!s) return json(res, 404, { error: "Transaction not found" });
    return json(res, 200, { ...s, status: state.config.sessionStatus[s.reference] || s.status });
  }

  if (req.method === "GET" && url.pathname === "/payouts/fee-preview") {
    const amount = Number(url.searchParams.get("amount"));
    if (!Number.isInteger(amount)) return json(res, 422, { error: "amount must be integer cents" });
    return json(res, 200, { amount, fee: 1500, total: amount + 1500 });
  }
  if (req.method === "GET" && url.pathname === "/payout-banks") {
    return json(res, 200, [{ bank_code: "01", name: "Kenya Commercial Bank" }]);
  }
  if (req.method === "POST" && url.pathname === "/payouts") {
    if (state.config.payoutError) {
      const e = state.config.payoutError;
      state.config.payoutError = null;
      return json(res, e.status, { error: e.error });
    }
    if (body.amount < 3000) return json(res, 422, { error: "minimum payout is 3000 cents" });
    const types = { mobile: ["phone"], till: ["short_code"], paybill: ["short_code", "account_ref"], bank: ["bank_code", "account_number", "account_name"] };
    if (!types[body.destination_type]) return json(res, 422, { error: "invalid destination_type" });
    for (const f of types[body.destination_type]) if (!body[f]) return json(res, 422, { error: `${f} is required` });
    const id = `po_${++state.counter}`;
    state.payouts[id] = { id, status: state.config.payoutStatus, amount: body.amount, fee: 1500, destination_type: body.destination_type };
    return json(res, 201, state.payouts[id]);
  }

  return json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock cyzora on ${PORT}`));
