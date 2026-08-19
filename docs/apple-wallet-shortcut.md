# Apple Wallet Shortcut setup

This guide shows you how to set up an Apple Shortcut that sends Wallet transactions to Spendly automatically.

You do not need to be a developer. If you can create a Shortcut on your iPhone and follow the steps below, you can do this.

## What the Shortcut does

When you pay with Apple Wallet (Apple Pay), the Shortcut takes the payment details and sends them to Spendly. Spendly saves the transaction and creates a page in your Notion database. The whole thing happens in the background.

```
You pay with Apple Pay
→ iPhone detects the payment
→ Shortcut sends the transaction to Spendly
→ Spendly saves it and writes it to Notion
```

## Before you start

You need three things ready in Spendly:

1. A Spendly account (sign up at your Spendly URL).
2. An API key (create one in Spendly under API keys).
3. A Notion connection (create one in Spendly under Connections).

If you have not done these yet, do them first. Come back here when you have your API key and your Notion connection showing as Connected.

## Part 1 — Get your Spendly API key

1. Open Spendly in your browser and sign in.
2. Go to API keys.
3. Tap Create API key.
4. Type a label, for example "iPhone".
5. Tap Create key.
6. Copy the key that appears. It starts with `sk_live_`.
7. Paste it somewhere safe. You will not be able to see it again in Spendly.

The key looks like this (this is only an example, not a real key):

```
sk_live_<random-characters>
```

## Part 2 — Set up your Notion connection in Spendly

1. Go to Connections in Spendly.
2. Tap Add Notion connection.
3. Follow the instructions in the dialog. You need a Notion database with these properties:
   - Merchant (title)
   - Amount (text)
   - Currency (select)
   - Date (date)
   - Type (select)
   - Source (text)
   - External ID (text)
4. Paste your Notion integration token and database id.
5. Tap Connect.

When the connection shows as Connected, you are ready.

## Part 3 — Create the Shortcut on your iPhone

These steps happen on your iPhone, in the Shortcuts app.

### Step 1 — Open the Shortcuts app

Open the Shortcuts app on your iPhone. If you do not have it, download it free from the App Store.

### Step 2 — Create a new Shortcut

Tap the plus button in the top right to create a new Shortcut.

### Step 3 — Add a trigger

Tap the "i" button at the bottom, then tap "Show in Share Sheet". This lets the Shortcut appear when you share payment details.

Alternatively, you can set up an automation that triggers when a Wallet transaction happens. To do this, go to the Automation tab and create a new personal automation. Choose Wallet as the trigger.

### Step 4 — Add the payment data

When the Shortcut runs, it receives information from the Wallet transaction. The Shortcut needs to build the data that Spendly expects.

The data Spendly needs:

| Field | What it is | Example |
|---|---|---|
| merchant | The shop or business name | Coffee Shop |
| amountMinor | The amount in the smallest currency unit (cents) | 599 (means 5.99) |
| currency | The three-letter currency code | EUR |
| date | The date and time of the payment | 2026-08-12T10:30:00Z |
| type | The transaction type | expense |
| source | Where the transaction came from | apple_wallet |
| externalId | A unique ID for this transaction so Spendly does not duplicate it | wallet-2026-08-12-10-30-00 |

The amount must be in the smallest unit of the currency. For EUR, GBP, or USD, that is cents or pence. So 5.99 EUR becomes 599. This avoids rounding problems with decimal numbers.

Spendly accepts `amountMinor` as a JSON number whose value is a whole number. `599` and `599.0` are the same number in JSON, and both work. Values with a real fraction — like `599.5`, or `5.99` (euros instead of cents) — are rejected with a 422 error. Spendly never rounds, truncates, or guesses an amount.

If you compute the cents inside the Shortcut by multiplying the price by 100, be careful: Shortcuts uses binary floating-point math, so 19.99 × 100 can come out as 1998.9999999999998, which Spendly will reject. To avoid this, add a "Round" action right after the multiplication, rounding to the nearest whole number. This only removes the math noise — Spendly still rejects any amount that is genuinely not a whole number.

### Step 5 — Build the JSON body

Add a "Dictionary" action to the Shortcut. Set these keys:

- merchant: Text — set this to the merchant name from the Wallet transaction
- amountMinor: Number — set this to the amount in cents
- currency: Text — set this to your currency code (EUR, USD, GBP)
- date: Text — set this to the current date and time in the format shown above
- type: Text — set this to "expense"
- source: Text — set this to "apple_wallet"
- externalId: Text — set this to a unique value, for example by combining the date and time

### Step 6 — Add the network request

Add a "Get contents of URL" action to the Shortcut. Set it up like this:

- URL: your Spendly API address followed by `/api/transactions`
  - For example: `https://your-spendly-url.vercel.app/api/transactions`
- Method: POST
- Headers:
  - Authorization: `Bearer sk_live_your_key_here`
  - Content-Type: `application/json`
- Request body: JSON — pass the Dictionary you built in step 5

Replace `sk_live_your_key_here` with the API key you copied in Part 1.

### Step 7 — Save and test

Save the Shortcut. Tap the play button to test it with sample data.

## What happens after a successful request

Spendly receives the transaction, saves it, and creates a page in your Notion database. You will see:

- A new transaction in the Spendly Transactions page.
- A new page in your Notion database with the merchant, amount, currency, date, type, source, and external ID.

The response Spendly sends back looks like this:

```json
{
  "id": "a-uuid-generated-by-spendly",
  "externalId": "wallet-2026-08-12-10-30-00",
  "replay": false,
  "merchant": "Coffee Shop",
  "amountMinor": 599,
  "currency": "EUR"
}
```

If `replay` is `true`, it means Spendly already had this transaction (same external ID), so it did not create a new one.

## What happens if Spendly rejects the transaction

Spendly sends back an error with a status code:

| Status code | What it means | What to do |
|---|---|---|
| 401 | The API key is missing, wrong, or revoked | Check the key in your Spendly API keys page and update the Shortcut |
| 422 | The transaction data is invalid | Check that all required fields are present and that `amountMinor` is a whole number in the smallest currency unit (no decimals) |
| 502 | Spendly saved the transaction but could not deliver it to Notion | Check your Notion connection and database in Spendly |
| 500 | Something went wrong on Spendly's side | Try again later |

The error response looks like this:

```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Missing or malformed Authorization header"
  }
}
```

The important thing: if Spendly returns 502, the transaction is still saved in Spendly. It just did not reach Notion. You can see it in your Spendly Transactions page with a "failed" delivery status.

## How to test it

1. Make sure your Spendly API key and Notion connection are set up.
2. Run the Shortcut with test data:
   - merchant: "Spendly V0 Test"
   - amountMinor: 599
   - currency: "EUR"
   - date: the current date and time
   - type: "expense"
   - source: "apple_wallet"
   - externalId: "spendly-v0-test-1"
3. Check the response. It should be a 200 or 201 with the transaction details.
4. Open Notion. You should see a new page with the test transaction.
5. Run the Shortcut again with the same externalId.
6. Check the response. It should be a 200 with `replay: true`. No new Notion page should be created.

## Summary

| Where | What you do |
|---|---|
| Spendly | Create an account |
| Spendly | Create an API key and copy it |
| Spendly | Connect Notion (token + database id) |
| iPhone | Create a Shortcut that sends payment data to Spendly |
| iPhone | Use your Spendly URL and API key in the Shortcut |
| Notion | Watch new transaction pages appear automatically |
