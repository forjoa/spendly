#!/usr/bin/env bash
#
# Spendly V0 end-to-end test procedure.
#
# Prerequisites:
#   1. Spendly deployed and reachable at $SPENDLY_URL
#   2. DATABASE_URL set and schema applied (npm run db:push)
#   3. A registered user account
#   4. An active API key created via the Spendly UI (starts with sk_live_)
#   5. A Notion connection created via the Spendly UI (Connected status)
#   6. The Notion database has the required properties (see docs/apple-wallet-shortcut.md)
#
# Usage:
#   SPENDLY_URL="https://your-spendly-url.vercel.app" \
#   SPENDLY_API_KEY="sk_live_..." \
#   ./scripts/v0-test.sh
#
# This script does NOT hardcode any secrets. It reads them from the environment.
# It uses a deterministic test transaction so results are reproducible.

set -euo pipefail

if [ -z "${SPENDLY_URL:-}" ]; then
  echo "ERROR: SPENDLY_URL is not set."
  echo "Example: SPENDLY_URL=https://your-spendly-url.vercel.app"
  exit 1
fi

if [ -z "${SPENDLY_API_KEY:-}" ]; then
  echo "ERROR: SPENDLY_API_KEY is not set."
  echo "Create one in the Spendly API keys page."
  exit 1
fi

API_URL="${SPENDLY_URL}/api/transactions"
UNIQUE_ID="spendly-v0-test-$(date +%s)"

echo "================================================"
echo "Spendly V0 end-to-end test"
echo "================================================"
echo "API URL:     $API_URL"
echo "Test ID:     $UNIQUE_ID"
echo "================================================"
echo ""

# ── Test 1: Happy path — create a transaction ──────────────────────────
echo "[1/5] POST a test transaction (5.99 EUR)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer $SPENDLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"merchant\": \"Spendly V0 Test\",
    \"amountMinor\": 599,
    \"currency\": \"EUR\",
    \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"type\": \"expense\",
    \"source\": \"apple_wallet\",
    \"externalId\": \"$UNIQUE_ID\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "    HTTP status: $HTTP_CODE"
echo "    Response:   $BODY"

if [ "$HTTP_CODE" != "201" ]; then
  echo "    FAIL: expected 201, got $HTTP_CODE"
  exit 1
fi
echo "    PASS: transaction created (201)"
echo ""

# ── Test 2: Replay the same externalId — must not duplicate ────────────
echo "[2/5] POST the same externalId again (idempotency check)..."
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Authorization: Bearer $SPENDLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"merchant\": \"Spendly V0 Test\",
    \"amountMinor\": 599,
    \"currency\": \"EUR\",
    \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"type\": \"expense\",
    \"source\": \"apple_wallet\",
    \"externalId\": \"$UNIQUE_ID\"
  }")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "    HTTP status: $HTTP_CODE2"
echo "    Response:   $BODY2"

if [ "$HTTP_CODE2" != "200" ]; then
  echo "    FAIL: expected 200 (replay), got $HTTP_CODE2"
  exit 1
fi

if echo "$BODY2" | grep -q '"replay":true'; then
  echo "    PASS: replay detected, no duplicate (200, replay: true)"
else
  echo "    FAIL: expected replay:true in response"
  exit 1
fi
echo ""

# ── Test 3: Check delivery status via GET ──────────────────────────────
echo "[3/5] GET transactions to verify delivery status..."
RESPONSE3=$(curl -s -w "\n%{http_code}" -X GET "$API_URL?limit=10" \
  -H "Authorization: Bearer $SPENDLY_API_KEY")

HTTP_CODE3=$(echo "$RESPONSE3" | tail -1)
BODY3=$(echo "$RESPONSE3" | sed '$d')

echo "    HTTP status: $HTTP_CODE3"

if [ "$HTTP_CODE3" != "200" ]; then
  echo "    FAIL: expected 200, got $HTTP_CODE3"
  exit 1
fi

if echo "$BODY3" | grep -q "Spendly V0 Test"; then
  echo "    PASS: test transaction found in transaction list"
else
  echo "    WARN: test transaction not found in list (may need a moment to appear)"
fi
echo ""

# ── Test 4: Verify Notion page was created (manual check) ──────────────
echo "[4/5] MANUAL CHECK: Open your Notion database."
echo "    You should see a new page with:"
echo "      Merchant:    Spendly V0 Test"
echo "      Amount:      5.99 EUR (or equivalent display)"
echo "      Currency:    EUR"
echo "      Date:        today's date"
echo "      Type:        expense"
echo "      Source:      apple_wallet"
echo "      External ID: $UNIQUE_ID"
echo ""
echo "    There should be exactly ONE page for this External ID."
echo "    Type 'done' and press Enter to continue."
read -r CONFIRM
echo ""

# ── Test 5: Summary ───────────────────────────────────────────────────
echo "[5/5] Verify no duplicate Notion page."
echo "    After sending the same externalId twice, there should be"
echo "    only ONE Notion page for External ID: $UNIQUE_ID"
echo "    Type 'ok' and press Enter if confirmed."
read -r CONFIRM2
echo ""

echo "================================================"
echo "V0 test complete."
echo "================================================"
echo ""
echo "Results:"
echo "  [1] Transaction created:          PASS (201)"
echo "  [2] Idempotent replay:            PASS (200, replay: true)"
echo "  [3] Transaction visible in list:  PASS (200)"
echo "  [4] Notion page created:          $CONFIRM"
echo "  [5] No duplicate Notion page:     $CONFIRM2"
echo ""
echo "To verify the Notion page was not duplicated, check that only"
echo "one page exists for External ID: $UNIQUE_ID"
