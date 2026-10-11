#!/usr/bin/env bash
# Deployment probe for the Cyzora webhook route — makes NO payment and
# needs NO API key. It sends three requests to a deployed (or local)
# /api/webhooks/cyzora and tells you what each answer proves:
#
#   1. no signature            -> expect 401  (request reached OUR Express handler
#                                              through Vercel's /api rewrite)
#   2. wrong signature         -> expect 401  (signature check is live)
#   3. signed `webhook.test`   -> expect 200  (the deployed runtime hands the
#                                              handler the exact raw bytes, so a
#                                              real Cyzora delivery will verify)
#
# Usage:
#   CYZORA_WEBHOOK_SECRET=whsec_... tests/e2e/send-test-webhook.sh https://<your-domain>/api/webhooks/cyzora
#
# The secret is read from the environment only — never pass it as an
# argument (it would land in shell history / process listings).
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "usage: CYZORA_WEBHOOK_SECRET=whsec_... $0 https://<host>/api/webhooks/cyzora" >&2
  exit 2
fi
if [[ -z "${CYZORA_WEBHOOK_SECRET:-}" ]]; then
  echo "CYZORA_WEBHOOK_SECRET is not set in the environment." >&2
  exit 2
fi

BODY='{"event":"webhook.test","livemode":false,"data":{"message":"deployment probe from send-test-webhook.sh"}}'
SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CYZORA_WEBHOOK_SECRET" | sed 's/^.* //')"

probe() {
  # prints "label  HTTP code  body" to stderr, returns the code on stdout
  local label="$1"; shift
  local tmp code
  tmp="$(mktemp)"
  code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$URL" -H 'Content-Type: application/json' "$@" --data-binary "$BODY")"
  printf '%-28s HTTP %s  %s\n' "$label" "$code" "$(head -c 200 "$tmp")" >&2
  rm -f "$tmp"
  echo "$code"
}

echo "Probing $URL"
c1="$(probe "1. no signature")"
c2="$(probe "2. wrong signature" -H 'X-Cyzora-Signature: 0000')"
c3="$(probe "3. signed webhook.test" -H "X-Cyzora-Signature: $SIG")"

echo
if [[ "$c1" == "401" && "$c2" == "401" && "$c3" == "200" ]]; then
  echo "OK — routing, signature verification and raw-body handling all work at $URL."
elif [[ "$c3" == "500" ]]; then
  echo "FAIL — the handler ran but did not receive raw bytes (WEBHOOK_BODY_NOT_RAW): the deployed runtime pre-parsed the body. See TESTING.md 'Deployment checks'."
elif [[ "$c1" != "401" ]]; then
  echo "FAIL — the request did not reach the Express webhook handler (check the Vercel /api rewrite and the deployed URL)."
elif [[ "$c3" == "401" ]]; then
  echo "FAIL — the correctly signed request was rejected: the CYZORA_WEBHOOK_SECRET in this shell is not the one the server at $URL has configured (each registered endpoint has its own whsec_ secret)."
else
  echo "FAIL — unexpected combination; compare against the expectations in this script's header."
fi
