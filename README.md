# Quick Buy Line Bot

Next.js 14 based LINE bot for Snap-on / Blue Point product lookup, AI-assisted replies, and admin management.

## Requirements

- Node.js 18+
- npm
- Supabase project with the required tables
- LINE Messaging API channel
- Anthropic API key

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env.local
```

3. Fill in these required values in `.env.local`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ANTHROPIC_API_KEY`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `ADMIN_TOKEN`

4. Optional but recommended:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_LIFF_ID`

## Development

```bash
npm run dev
```

- Home page: `http://localhost:3000/`
- Admin page: `http://localhost:3000/admin`
- LINE webhook: `http://localhost:3000/api/line/webhook`
- LIFF page: `http://localhost:3000/liff`

## Build

```bash
npm run build
npm run start
```

## Notes

- The admin API is protected by `ADMIN_TOKEN`.
- The admin page will ask for the token before loading data.
- LINE webhook signature verification requires a correct `LINE_CHANNEL_SECRET`.
- The AI reply flow uses Anthropic and stores chat logs in Supabase.

## Pre-Launch Checklist

### 1. Environment variables

- [ ] Set `SUPABASE_URL`
- [ ] Set `SUPABASE_SERVICE_KEY`
- [ ] Set `ANTHROPIC_API_KEY`
- [ ] Set `LINE_CHANNEL_SECRET`
- [ ] Set `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] Set `ADMIN_TOKEN`
- [ ] Set `NEXT_PUBLIC_LIFF_ID` if LIFF is enabled

### 2. Supabase

- [ ] Confirm `quickbuy_products` exists
- [ ] Confirm `quickbuy_line_messages` exists
- [ ] Confirm `quickbuy_line_customers` exists
- [ ] Confirm `quickbuy_response_cache` exists
- [ ] Confirm `quickbuy_config` exists
- [ ] Confirm `quickbuy_promotions` and `quickbuy_promotion_items` exist if promotion features are used
- [ ] Confirm `quickbuy_chat_history` exists if chat history features are used
- [ ] Confirm `quickbuy_config` supports `config_key` / `config_value`
- [ ] Confirm `search_text` full-text search works on product data

### 3. LINE Messaging API

- [ ] Set webhook URL to `https://your-domain/api/line/webhook`
- [ ] Enable webhook delivery
- [ ] Confirm `LINE_CHANNEL_SECRET` matches the LINE channel secret
- [ ] Confirm `LINE_CHANNEL_ACCESS_TOKEN` matches the deployed channel token
- [ ] Run a webhook test from LINE Developers

### 4. LIFF

- [ ] Set LIFF URL to `https://your-domain/liff`
- [ ] Confirm `NEXT_PUBLIC_LIFF_ID` matches the LIFF app
- [ ] Open `/liff` on mobile and verify product search works
- [ ] Test sending a product inquiry into chat or the clipboard fallback

### 5. Admin

- [ ] Open `/admin`
- [ ] Sign in successfully with `ADMIN_TOKEN`
- [ ] Verify dashboard data loads
- [ ] Verify AI prompt saving works
- [ ] Verify promotion create / enable / disable works
- [ ] Verify product search and chat history pages work

### 6. End-to-end checks

- [ ] Send a text message to the bot in LINE
- [ ] Confirm the webhook replies successfully
- [ ] Confirm `quickbuy_line_messages` receives a row
- [ ] Confirm first-time inquiries follow the new-customer SOP
- [ ] Repeat the same inquiry and confirm known-customer behavior still works
- [ ] Test a missing-product inquiry
- [ ] Test Anthropic failure fallback behavior if possible

### 7. Release hygiene

- [ ] Confirm `.env.local` is not committed
- [ ] Exclude `.DS_Store` from the release commit
- [ ] Run `npm run build`
- [ ] Commit the final changes
- [ ] Re-test webhook / admin / LIFF after deploy
