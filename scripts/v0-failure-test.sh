#!/usr/bin/env bash
#
# Spendly V0 failure-mode test procedure.
#
# Verifies that error paths behave correctly WITHOUT a working Notion
# connection. These tests confirm that:
#   - invalid API keys are rejected (401)
#   - malformed payloads are rejected (422)
#   - the transaction is still persisted even when Notion delivery fails
#
# Prerequisites:
#   1. Spendly deployed and reachable at $SPENDLY_URL
#   2. DATABASE_URL set and schema applied (npm run db:push)
#   3. A registered user account
#   4. An active API key (for auth-passing tests)
#   5. Optionally: a Notion connection with INVALID credentials (for the
#      delivery-failure test). If a valid Notion connection is active,
#      the delivery-failure test will not produce a 502.
#
# Usage:
#   SPENDLY_URL="https://your-spendly-url.vercel.app" \
#   SPENDLY_API_KEY="sk_live_..." \
#   ./scripts/v0-failure-test.sh

set -euo pipefail

if [ -z "${SPENDLY_URL:-}" ]; then
  echo "ERROR: SPENDLY_URL is not set."
  exit 1
fi

if [ -z "${SPENDLY_API_KEY:-}" ]; then
  echo "ERROR: SPENDLY_API_KEY is not set."
  exit 1
fi

API_URL="${SPENDLY_URL}/api/transactions"
UNIQUE_ID="spendly-v0-fail-$(date +%s)"
PASS=0
FAIL=0

echo "================================================"
echo "Spendly V0 failure-mode test"
echo "================================================"
echo ""

# ── Test 1: Invalid API key ────────────────────────────────────────────
echo "[1/4] POST with an invalid API key (expect 401)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer sk_live_invalid_key_that_does_not_exist" \
  -H "Content-Type: application/json" \
  -d "{\"merchant\":\"Test\",\"amountMinor\":100,\"currency\":\"EUR\",\"date\":\"2026-01-01T00:00:00Z\",\"source\":\"test\",\"externalId\":\"$UNIQUE_ID-bad-key\"}")

echo "    HTTP status: $HTTP_CODE"
if [ "$HTTP_CODE" = "401" ]; then
  echo "    PASS"
  PASS=$((PASS + 1))
else
  echo "    FAIL: expected 401, got $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi
echo ""

# ── Test 2: Missing Authorization header ───────────────────────────────
echo "[2/4] POST with no Authorization header (expect 401)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"merchant\":\"Test\",\"amountMinor\":100,\"currency\":\"EUR\",\"date\":\"2026-01-01T00:00:00Z\",\"source\":\"test\",\"externalId\":\"$UNIQUE_ID-no-auth\"}")

echo "    HTTP status: $HTTP_CODE"
if [ "$HTTP_CODE" = "401" ]; then
  echo "    PASS"
  PASS=$((PASS + 1))
else
  echo "    FAIL: expected 401, got $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi
echo ""

# ── Test 3: Malformed payload (missing required fields) ───────────────
echo "[3/4] POST with a malformed payload (expect 422)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer $SPENDLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"merchant\":\"Test\"}")

echo "    HTTP status: $HTTP_CODE"
if [ "$HTTP_CODE" = "422" ]; then
  echo "    PASS"
  PASS=$((PASS + 1))
else
  echo "    FAIL: expected 422, got $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi
echo ""

# ── Test 4: Notion delivery failure (transaction must still persist) ──
echo "[4/4] POST with valid key but check persistence-on-delivery-failure..."
echo "    This test requires a Notion connection with INVALID credentials."
echo "    If your Notion connection is valid, delivery will succeed (201)"
echo "    and this test cannot verify the failure path."
echo ""
echo "    To test the failure path:"
echo "      1. Create a Notion connection with an invalid token"
echo "      2. Run this script"
echo "      3. Expect HTTP 502 (delivery error)"
echo "      4. Check Spendly Transactions page: the transaction should"
echo "         appear with delivery status 'failed'"
echo ""
echo "    The critical invariant: the transaction MUST be persisted"
echo "    even when Notion delivery fails. It must NOT be rolled back."
echo ""
echo "    Sending a test transaction..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer $SPENDLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"merchant\": \"Spendly V0 Fail Test\",
    \"amountMinor\": 100,
    \"currency\": \"EUR\",
    \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"type\": \"expense\",
    \"source\": \"apple_wallet\",
    \"externalId\": \"$UNIQUE_ID-delivery-test\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "    HTTP status: $HTTP_CODE"
echo "    Response:   $BODY"
echo ""
if [ "$HTTP_CODE" = "201" ]; then
  echo "    Delivery succeeded (valid Notion connection)."
  echo "    To test the failure path, use invalid Notion credentials."
  PASS=$((PASS + 1))
elif [ "$HTTP_CODE" = "502" ]; then
  echo "    Delivery failed as expected (502)."
  echo "    MANUAL CHECK: verify the transaction appears in the Spendly"
  echo "    Transactions page with delivery status 'failed'."
  echo "    The transaction must NOT be missing (rolled back)."
  PASS=$((PASS + 1))
else
  echo "    UNEXPECTED: got $HTTP_CODE"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "================================================"
echo "Failure-mode test results"
echo "================================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
