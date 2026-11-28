# Where to get every key

VibeVault reads keys from two files. Both are gitignored, and `npm run setup` creates them from the examples.

| File | Who reads it | What goes in it |
| --- | --- | --- |
| `.env` | the app (built into it) | the Supabase URL and the public anon key. Nothing secret. |
| `supabase/functions/.env` | the backend (Supabase Edge Functions) | marketplace, coupon and price-history API keys, plus the cron secret |

**Every backend key is optional.** A marketplace without keys is skipped, and the app shows the ones that are connected. The quickest useful setup is Supabase plus one or two marketplaces for your country. Add the rest later.

After you change `supabase/functions/.env`:

```bash
npm run providers:check                                        # tests each key against the real API; never prints keys
npx supabase@3 secrets set --env-file supabase/functions/.env  # uploads the keys to your Supabase project
```

No redeploy is needed: the functions read the secrets on every run.

## At a glance

| Key(s) | Unlocks | Countries | Cost | Approval wait |
| --- | --- | --- | --- | --- |
| [`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`](#1-supabase-required) | the app talking to your backend | – | free tier | none |
| [`REFRESH_CRON_SECRET`](#2-refresh_cron_secret-required) | the scheduled refresh | – | free | none |
| [`FLIPKART_*`](#3-flipkart) | Flipkart listings and offers | India | free | affiliate approval |
| [`AMAZON_*`](#4-amazon-creators-api) | Amazon listings | 22 Amazon sites | free | needs 10 sales in 30 days |
| [`EBAY_*`](#5-ebay) | eBay new and pre-owned | anywhere eBay delivers | free | usually within a day |
| [`ALIEXPRESS_*`](#6-aliexpress) | AliExpress listings and promo codes | almost everywhere | free | app review, a few days |
| [`ETSY_*`](#7-etsy) | handmade and vintage | US, UK, CA, AU, DE, FR, IN, … | free | usually quick |
| [`IMPACT_*`](#8-impactcom-brand-stores) | brands' own stores (every brand that approves you) | by currency: US, UK, CA, AU, EU, IN, … | free | each brand approves you |
| [`SERPAPI_*`](#9-serpapi-google-shopping) | Google Shopping: thousands of stores without an API | 19 countries | paid per search (small free plan) | instant |
| [`KEEPA_API_KEY`](#10-keepa) | up to a year of past Amazon prices | Amazon sites | paid | instant |
| [`CUELINKS_API_KEY`](#11-cuelinks) | coupons for Indian stores | India | free | publisher approval |
| [`ADMITAD_*`](#12-admitad) | coupons worldwide | many | free | ad-space approval |
| [`AWIN_*`](#13-awin) | coupons and announced sales | UK, Europe, US, AU | free (small deposit in some regions) | publisher approval |

---

## App (`.env`)

### 1. Supabase (required)

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`

1. Go to <https://supabase.com/dashboard> and sign in (GitHub sign-in works).
2. Click **New project**. Pick an organisation, give the project a name (e.g. `vibevault`), set a database password and save it somewhere safe. Choose the region closest to your users, then click **Create new project** and wait about two minutes.
3. Open **Project Settings → API** (newer dashboards: **Project Settings → Data API**, with the keys under **API Keys**).
4. Copy the **Project URL**, e.g. `https://abcdefghijklmnop.supabase.co`, into `EXPO_PUBLIC_SUPABASE_URL`.
5. Copy the **anon / public** key (or the **publishable** key, `sb_publishable_…`) into `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
6. Note the **project ref**: the `abcdefghijklmnop` part of the URL. You need it for `supabase link` and `schedule.sql`.

> Never copy the **service_role** / **secret** key into the app. The Edge Functions get it from Supabase automatically, so it isn't in any `.env` file.

The values are built into the app, so restart `npm start` (or rebuild the APK) after changing them.

---

## Backend (`supabase/functions/.env`)

### 2. `REFRESH_CRON_SECRET` (required)

This is a password you make up. The scheduled job sends it to `refresh-catalog`, so nobody else can trigger refreshes.

1. Generate one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Paste it into `REFRESH_CRON_SECRET=`.
3. Use the **same value** for `<REFRESH_CRON_SECRET>` when you run `supabase/setup/schedule.sql` (see README → Setup → Backend).

### 3. Flipkart

`FLIPKART_AFFILIATE_ID`, `FLIPKART_AFFILIATE_TOKEN`. These give India listings and Flipkart's own offers feed.

1. Go to <https://affiliate.flipkart.com> and click **Join now for free**. Sign up with your website or app details. Flipkart reviews each application.
2. Once approved, sign in. Your **Affiliate ID** (also called the tracking ID) is shown on your profile / dashboard. It is the `affid` value in your affiliate links. Put it in `FLIPKART_AFFILIATE_ID`.
3. Open **Tools → API Token** and click **Generate token**. Put the token in `FLIPKART_AFFILIATE_TOKEN`.

Flipkart sometimes pauses new affiliate sign-ups. If it is closed, skip Flipkart: Indian stores still arrive through Google Shopping and Cuelinks.

### 4. Amazon (Creators API)

`AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, `AMAZON_CREATORS_CREDENTIAL_VERSION`, `AMAZON_PARTNER_TAGS`

Amazon retired PA-API 5.0 in 2026. The Creators API replaces it.

1. Join Amazon Associates for each country site you want. Each site has its own programme, for example:
   - India: <https://affiliate-program.amazon.in>
   - US: <https://affiliate-program.amazon.com>
   - UK: <https://affiliate-program.amazon.co.uk>
   - Germany: <https://partnernet.amazon.de>

   Each one gives you a **tracking ID / store ID** such as `yourname-21`.
2. API access opens only after an account has **10 qualified sales in the last 30 days**. Until then the API refuses requests. Share your links to get the first sales.
3. In **Associates Central**, open **Tools → Creators API** and create credentials. Copy the **Client ID** and **Client Secret** into the two `AMAZON_CREATORS_CLIENT_*` keys.
4. The credentials page shows a **version**. Set `AMAZON_CREATORS_CREDENTIAL_VERSION` to it:
   - `3.1` for North America
   - `3.2` for Europe, the Middle East and India
   - `3.3` for the Far East
5. List one tag per country site in `AMAZON_PARTNER_TAGS`, as `COUNTRY:tag` pairs separated by commas, e.g. `IN:yourname-21,US:yourname-20,GB:yourname-21`. Only the countries listed are fetched.

The API allows about one request a second for new accounts. The backend paces itself (fewer searches per run, and lookups 10 items per call).

### 5. eBay

`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, plus `EBAY_MARKETS`, `EBAY_CONDITIONS` and optionally `EBAY_CAMPAIGN_ID`

1. Create a developer account at <https://developer.ebay.com> (**Register**). Approval usually takes up to a day.
2. Open **Hi <name> → Application Keysets**. Under **Production**, click **Create a keyset** and give it a name.
3. eBay asks how you handle **Marketplace Account Deletion** notifications before enabling production keys. VibeVault stores no eBay user data, so choose **opt out / exemption** and select the reason that you don't store eBay user data.
4. Copy the **App ID (Client ID)** into `EBAY_CLIENT_ID` and the **Cert ID (Client Secret)** into `EBAY_CLIENT_SECRET`. The Dev ID is not needed.
5. `EBAY_MARKETS`: the shopper countries to serve, e.g. `IN,US,GB,DE`. Items must deliver there.
6. `EBAY_CONDITIONS`: `USED` (pre-owned, the default), `NEW`, or `USED,NEW`.
7. Optional affiliate links: join the eBay Partner Network at <https://partnernetwork.ebay.com>, open **Campaigns**, create one and copy its 10-digit **Campaign ID** into `EBAY_CAMPAIGN_ID`.

### 6. AliExpress

`ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID`, `ALIEXPRESS_MARKETS`

1. Join the affiliate programme at <https://portals.aliexpress.com>. Under **Ad Center → Tracking ID**, create a tracking ID and put it in `ALIEXPRESS_TRACKING_ID`. The default one is fine.
2. Register as a developer at <https://openservice.aliexpress.com> with the **same** AliExpress account, choosing the affiliate/publisher developer type.
3. Create an app (**App Management → Create App**) and choose the **Affiliates API** category. Submit it. Review takes a few days.
4. Once the app is approved, its page shows the **App Key** and **App Secret**. Copy them into `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET`.
5. `ALIEXPRESS_MARKETS`: the countries to serve (the default covers 18 countries).

### 7. Etsy

`ETSY_API_KEY`, `ETSY_SHARED_SECRET`, `ETSY_MARKETS`

1. Sign in to Etsy, go to <https://www.etsy.com/developers/register> and create an app. Describe it as a price-comparison and fashion-discovery app.
2. Open **Your apps → See API key details**. Copy the **Keystring** into `ETSY_API_KEY` and the **Shared secret** into `ETSY_SHARED_SECRET`.
3. If the app shows a pending status, wait for Etsy to activate it. VibeVault only uses public listing endpoints, so it needs no shopper sign-in (OAuth).
4. `ETSY_MARKETS`: the countries whose shops to show, e.g. `US,GB,CA,AU,DE,FR,IN`.

Etsy requires apps to show its attribution text. VibeVault does this automatically.

### 8. impact.com (brand stores)

`IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`, `IMPACT_MARKETS`

Many fashion brands and department stores run their affiliate programme on impact.com. Once a brand approves you, its product catalog appears in VibeVault under the brand's name, with your tracking link.

1. Sign up as a **partner** (publisher / creator) at <https://impact.com>, then complete your profile and add your website or app.
2. Find brands in the partner marketplace (**Brands → Find brands**, or **Discover**) and apply to the fashion brands you want. Each brand approves you separately. Approved brands with a product catalog show up automatically. Nothing else needs configuring.
3. Create the API credentials. In <https://app.impact.com>, open **your profile → Settings → Technical → API → Create Access Token**. A **read-only** token is enough. The same page shows your **Account SID** (it starts with `IR…`). Copy the SID into `IMPACT_ACCOUNT_SID` and the token into `IMPACT_AUTH_TOKEN`.
4. `IMPACT_MARKETS`: the countries to serve, e.g. `US,GB,CA,AU`. Catalog items don't say where they ship, so each country gets the items **priced in its currency** (USD → US, GBP → UK, EUR → the euro countries you list, …).

Limits: 3,000 product searches an hour, which is far more than the refresh uses.

### 9. SerpApi (Google Shopping)

`SERPAPI_API_KEY`, `SERPAPI_MARKETS`

This is the widest coverage: Google Shopping lists offers from thousands of stores that have no public API (Myntra, Ajio, Zalando, ASOS, H&M, Zara, Uniqlo, Nordstrom, SHEIN where it lists on Google Shopping, …). SerpApi is a paid third-party service that fetches those results. One search costs one credit.

1. Sign up at <https://serpapi.com>.
2. Your key is on the **Dashboard** (**Your Private API Key**). Copy it into `SERPAPI_API_KEY`.
3. Pick a plan on <https://serpapi.com/pricing>. The free plan has a small monthly allowance, enough to try it out.
4. `SERPAPI_MARKETS`: the countries to search, e.g. `IN,US,GB`. Each country runs 6 searches a day by default, about 180 credits a month per country. Change `searches_per_run` in the `marketplace_markets` table to spend more or less.

### 10. Keepa

`KEEPA_API_KEY`

Keepa imports up to a year of past Amazon prices, so "when to buy" and the seasonal months work from day one for Amazon listings.

1. Create an account at <https://keepa.com>.
2. Open <https://keepa.com/#!api> and subscribe to an API plan. Plans are sold by tokens per minute, and the smallest is plenty.
3. The page shows your **private API access key**. Copy it into `KEEPA_API_KEY`.

### 11. Cuelinks

`CUELINKS_API_KEY`. Coupons for Indian stores such as Myntra, Ajio and Nykaa Fashion.

1. Sign up as a publisher at <https://www.cuelinks.com> and wait for approval.
2. Open **Profile → API key** and create a key with the scopes **read:offers** and **read:campaigns**.
3. Copy it into `CUELINKS_API_KEY`.

### 12. Admitad

`ADMITAD_CLIENT_ID`, `ADMITAD_CLIENT_SECRET`, `ADMITAD_WEBSITE_ID`, `ADMITAD_MARKETS`. Coupons from stores worldwide.

1. Register as a publisher at <https://www.admitad.com>.
2. Add an **ad space** (your website or app) and wait for it to be approved. Its numeric id, shown in the ad-space list, goes in `ADMITAD_WEBSITE_ID`.
3. Join the programmes (stores) whose coupons you want. Coupons only come from programmes you have joined.
4. Open **Account settings → Credentials** (API access). Copy the **client_id** and **client_secret** into `ADMITAD_CLIENT_ID` and `ADMITAD_CLIENT_SECRET`.
5. `ADMITAD_MARKETS`: the countries to fetch coupons for.

### 13. Awin

`AWIN_API_TOKEN`, `AWIN_PUBLISHER_ID`, `AWIN_MARKETS`. Coupons and **announced sales** (the "Sale starts 5 Dec" advice in the app comes from feeds like this).

1. Sign up as a publisher at <https://www.awin.com>. Some regions ask for a small refundable deposit.
2. Join the advertisers you want (**Advertisers → Join Programmes**).
3. Your **publisher ID** is the number in the account switcher and in the address bar (`ui.awin.com/…/affiliate/123456/…`). Put it in `AWIN_PUBLISHER_ID`.
4. Open the user menu (top right) → **API Credentials**, enter your password and copy the token into `AWIN_API_TOKEN`.
5. `AWIN_MARKETS`: e.g. `GB,US,DE,FR,IT,ES,NL,AU`.

---

## Which shops will show up?

| Shop | How |
| --- | --- |
| Amazon (22 countries) | Amazon Creators API |
| Flipkart | Flipkart Affiliate API |
| eBay (new and pre-owned) | eBay Browse API |
| AliExpress | AliExpress Affiliate API |
| Etsy (handmade, vintage) | Etsy API |
| Brands on impact.com (many fashion labels and department stores) | impact.com catalogs, after each brand approves you |
| Myntra, Ajio, Nykaa Fashion, Zalando, ASOS, H&M, Zara, Uniqlo, Nordstrom, Macy's, SHEIN and thousands more | Google Shopping via SerpApi, when the store lists its products there |

**About SHEIN, Zara, H&M, Myntra and similar stores:** they don't offer a public product API. Their products appear through Google Shopping (SerpApi) when they list there. A store that runs its affiliate programme on impact.com and approves you also appears directly, with your tracking link.

**Not included yet:**
- **CJ Affiliate, Rakuten Advertising and Walmart.** Their official API docs load only in a browser (they are JavaScript pages), so the exact request and response formats could not be verified. An adapter built on guessed formats could silently show wrong prices. If you have accounts there, the adapters can be added once their API reference is available.
- **Naver Shopping.** Its API was shut down.
- **Rakuten Ichiba.** Its new API spec isn't public.

## Keeping keys safe

- `supabase/functions/.env` and `.env` are gitignored. Never commit them, and never paste keys into issues or chat.
- Only `EXPO_PUBLIC_*` values go into the app, and the anon key can only read the public catalogue (row-level security).
- To rotate a key, change it in `supabase/functions/.env`, then run `npx supabase@3 secrets set --env-file supabase/functions/.env`.
- `npm run providers:check` prints results only, never keys, so its output is safe to share.
