#!/usr/bin/env bash
# End-to-end run: real API server + disposable Postgres + mock Cyzora.
#
#   E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mealvest_e2e npm run test:e2e
#
# The database named in E2E_DATABASE_URL is WIPED (DROP SCHEMA public
# CASCADE) and re-migrated on every run, so it must be a throwaway
# local database. Hard safety rails, in order:
#   * host must be 127.0.0.1 / localhost and the URL must not mention
#     supabase — the production DB can never be targeted;
#   * the database name must contain "e2e" or "test";
#   * the server under test is started by THIS script with a fixed
#     fake sk_test_ key and CYZORA_BASE_URL pointing at mock-cyzora.js,
#     so no request can ever reach api.cyzora.co.ke and no real money
#     can move. Any CYZORA_* / PAYSTACK_* values in your shell are
#     ignored (unset below).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$HERE/../.." && pwd)"
cd "$SERVER_DIR"

DB="${E2E_DATABASE_URL:-}"
if [[ -z "$DB" ]]; then
  echo "E2E_DATABASE_URL is required (a LOCAL throwaway database, e.g. postgres://postgres:postgres@127.0.0.1:5432/mealvest_e2e)." >&2
  exit 2
fi
HOST="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$DB")"
NAME="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$DB")"
if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]] || [[ "$DB" == *supabase* ]]; then
  echo "Refusing: E2E_DATABASE_URL must point at 127.0.0.1/localhost and never at Supabase (got host '$HOST')." >&2
  exit 2
fi
if [[ "$NAME" != *e2e* && "$NAME" != *test* ]]; then
  echo "Refusing: the database name must contain 'e2e' or 'test' (got '$NAME') — this script wipes it." >&2
  exit 2
fi

API_PORT="${E2E_API_PORT:-4100}"
MOCK_PORT="${E2E_MOCK_PORT:-4199}"
LOG_DIR="${E2E_LOG_DIR:-$HERE/.logs}"
mkdir -p "$LOG_DIR"

# Nothing from the developer's real environment may leak into the server under test.
unset CYZORA_SECRET_KEY CYZORA_WEBHOOK_SECRET CYZORA_BASE_URL PAYSTACK_SECRET_KEY PAYSTACK_PUBLIC_KEY \
      APP_BASE_URL DATABASE_URL JWT_ACCESS_SECRET QR_SIGNING_SECRET PAYMENT_PROVIDER_DEFAULT NODE_ENV PORT

echo "==> Resetting $NAME on $HOST"
node -e '
  const { Client } = require("pg");
  (async () => {
    const c = new Client({ connectionString: process.argv[1] });
    await c.connect();
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await c.end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
' "$DB"

echo "==> Applying migrations with the project migrate script"
# Migration 039 inserts into Supabase's storage.buckets, which plain Postgres
# lacks. If that is the only failure, apply its portable part by hand, record
# it, and let the script continue with 040+.
if ! DATABASE_URL="$DB" npm run --silent migrate > "$LOG_DIR/migrate.log" 2>&1; then
  if grep -q 'storage.buckets' "$LOG_DIR/migrate.log"; then
    node -e '
      const { Client } = require("pg");
      (async () => {
        const c = new Client({ connectionString: process.argv[1] });
        await c.connect();
        await c.query("ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url TEXT");
        await c.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", ["039_student_avatars.sql"]);
        await c.end();
      })().catch((e) => { console.error(e.message); process.exit(1); });
    ' "$DB"
    DATABASE_URL="$DB" npm run --silent migrate >> "$LOG_DIR/migrate.log" 2>&1
  else
    cat "$LOG_DIR/migrate.log" >&2
    exit 1
  fi
fi
grep -E '^(apply|Applied)' "$LOG_DIR/migrate.log" | tail -3

# Each child runs in its own process group (setsid) so cleanup can kill
# the whole tree — `npx tsx` spawns a grandchild node process that would
# otherwise outlive the script, keep the port, and poison the next run
# with its rate-limit counters and stale DB state.
cleanup() {
  for pid in "${SERVER_PID:-}" "${MOCK_PID:-}"; do
    [[ -n "$pid" ]] || continue
    # children first (tsx's node grandchild), then the group, then the pid itself
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -- "-$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  # Belt and braces: node processes still running our exact server/mock
  # command lines (anchored to ^node so a shell whose command line merely
  # mentions these paths is never matched).
  pkill -f "^node .*node_modules/\.bin/tsx src/index\.ts" 2>/dev/null || true
  pkill -f "^node .*tests/e2e/mock-cyzora\.js" 2>/dev/null || true
}
trap cleanup EXIT

for port in "$API_PORT" "$MOCK_PORT"; do
  if curl -sf "http://127.0.0.1:$port/" >/dev/null 2>&1 || curl -s -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then
    echo "Refusing: something is already listening on 127.0.0.1:$port (a previous run still alive?). Stop it or set E2E_API_PORT/E2E_MOCK_PORT." >&2
    exit 2
  fi
done

echo "==> Starting mock Cyzora on :$MOCK_PORT"
MOCK_PORT="$MOCK_PORT" MOCK_API_KEY="sk_test_e2e_key" setsid node "$HERE/mock-cyzora.js" > "$LOG_DIR/mock.log" 2>&1 &
MOCK_PID=$!

echo "==> Starting API server on :$API_PORT (test key, mock Cyzora, local DB)"
DATABASE_URL="$DB" \
NODE_ENV=development PORT="$API_PORT" \
JWT_ACCESS_SECRET=e2e-jwt-secret QR_SIGNING_SECRET=e2e-qr-secret \
PAYMENT_PROVIDER_DEFAULT=cyzora \
CYZORA_SECRET_KEY=sk_test_e2e_key CYZORA_WEBHOOK_SECRET=whsec_e2e_secret \
CYZORA_BASE_URL="http://127.0.0.1:$MOCK_PORT" \
APP_BASE_URL=http://localhost:3000 ALLOWED_ORIGINS=http://localhost:3000 \
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
  setsid node_modules/.bin/tsx src/index.ts > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && curl -sf "http://127.0.0.1:$MOCK_PORT/__requests" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null || { echo "API server did not start:"; tail -30 "$LOG_DIR/server.log"; exit 1; }

echo "==> Running scenarios"
set +e
API="http://127.0.0.1:$API_PORT" MOCK="http://127.0.0.1:$MOCK_PORT" DATABASE_URL="$DB" \
JWT_ACCESS_SECRET=e2e-jwt-secret CYZORA_WEBHOOK_SECRET=whsec_e2e_secret \
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
  node "$HERE/e2e.js"
STATUS=$?
set -e
echo "Logs: $LOG_DIR (server.log, mock.log, migrate.log)"
exit $STATUS
