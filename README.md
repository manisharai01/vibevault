# VibeVault – Thrift & Deal Detective

VibeVault is an Expo / React Native app (iOS, Android and web) that helps people find fashion that fits their personality and style, and buy it at the right time. **Every price is a live marketplace price** recorded daily by the VibeVault backend — nothing is simulated or hardcoded.

- **Discover** – live listings for your country from every connected marketplace, ranked by how well they match you, with the reason for each match ("Matches your Minimalist style · In colours you love").
- **Item page** – the price is re-checked on the marketplace when you open it. **When to buy**: the chance the price gets ≥5% cheaper within 7, 14 and 30 days, the typical low if you wait, whether one-off pre-owned pieces tend to sell first, the month the item has historically been cheapest (with a year of history), and the model's measured track record. Full price-history chart, valid coupons for that store (tap one to copy its code and open the store), price alerts, purchase logging, and search links for the same item on the other marketplaces in your country.
- **My Vibe** – the Style Profiler: your country and sections (women's / men's), six personality questions, colours you love and avoid, fit, occasions, budget, pre-owned preference, and a taste check on real live listings. The result explains every style score.
- **Stylist** – complete outfits for any occasion or style (deterministic: "Next look" walks down the ranking, nothing is random), and a **capsule wardrobe** built around your palette that mixes into as many outfits as possible.
- **Deals** – top deals right now, **coupons valid today**, price alerts, and how accurate the predictions have actually been.
- **Quests** – styling and second-hand challenges with XP, levels and badges.
- **Profile** – your wishlist (saved items with live prices and advice), country, currency and sections, purchases and money saved, badges, data reset.

No screen shows the same action twice, and every button is exercised by the end-to-end test (`npm run e2e`), which fails if a screen shows a duplicate control.

## How it works

```
 Flipkart · Amazon · eBay · AliExpress · Etsy ─┐
 Google Shopping (SerpApi) · Keepa (history)    │                    ┌─ refresh-catalog  (every 10 min, pg_cron)
 Cuelinks · Admitad · Awin · Flipkart offers   ─┼── Edge Functions ──┤
 ECB exchange rates (frankfurter.dev)          ─┘   (hold the keys)  └─ live-item        (when an item is opened)
                                          │
                Supabase Postgres: listings · price_points (daily) · offers · fx_rates
                predictions model (run_price_model, daily) → price_predictions → track record
                                          │  read-only views (RLS)
                                     VibeVault app
```

- **Why a backend?** API keys can't be kept secret inside an app, and prices have to be recorded every day whether or not anyone opens the app. A [Supabase](https://supabase.com) project does both.
- **Markets.** Each listing is an offer *to shoppers in one country* (its id is `source:country:item`), priced in that market's currency. The app downloads the listings for the user's country.
- **Refresh queue.** Every 10 minutes `refresh-catalog` takes the most overdue marketplace + country: re-checks known listings (today's price, sold out or not), searches for new ones (the `search_terms` table, translated per language), imports archived history (Keepa, for Amazon), and retires listings it can't confirm. It also takes the most overdue coupon feed, and refreshes exchange rates twice a day. Everything is logged in `refresh_runs`.
- **Classification.** Department, category and style tags come from each marketplace's own category data and the listing's text; kids' items and non-fashion results are dropped.
- **Currencies.** Prices are shown in the listing's currency. Totals, budgets and sorting convert with the European Central Bank's daily reference rates and are marked "≈"; a price is never converted without a rate.
- **Offline.** The last download (listings, rates, coupons) is cached and shown with its age.

### The "when to buy" model

The question it answers: *"If I wait 7 / 14 / 30 days, will this be at least 5% cheaper at some point while it's still for sale?"*

1. Every recorded day of every listing is a *situation*: how long it has been tracked, where the price sits in its 60-day range, its 7-day trend and how often the price changed in 30 days.
2. For past situations the outcome is known (got 5% cheaper / didn't / sold out first). The chance for today's situation is the frequency observed in the same situation, pooled from broad to specific (all listings → same marketplace → same category → this listing's own history) with Bayesian shrinkage, so thin data borrows from broader data instead of guessing.
3. Nothing is published until at least 30 listings have complete outcomes for a horizon. Predictions are re-published for a listing whenever its price changes on a live check, and hidden when they are more than 3 days old.
4. **Every published prediction is stored and scored when its window closes** (`prediction_track_record`, `prediction_calibration`). The app shows the real hit rates ("when it said wait, the price dropped 72% of the time — 210 calls") and the Brier score against always guessing the average.

No prediction of future prices can be 100% certain — sellers set prices — so VibeVault measures and shows how often it is right instead of claiming certainty. Accuracy improves as history accumulates; with Keepa connected, Amazon listings start with up to a year of history (including past sale seasons).

### Coupons

Only from official merchant / affiliate-network feeds (Flipkart offers, Cuelinks, Admitad, Awin) and promo codes marketplaces attach to listings (AliExpress, Amazon deals). An offer is shown only while **the feed still listed it within the last day** and it is **inside its start and end dates**; withdrawn offers are switched off on the next fetch. Stores still apply their own conditions (minimum spend, one use per customer) at checkout.

### Marketplaces

| Marketplace | API | Countries | Notes |
| --- | --- | --- | --- |
| Flipkart | Flipkart Affiliate API | India | new; also the offers feed |
| Amazon | Amazon Creators API (PA-API 5.0 was retired in 2026) | 22 country sites | needs 10 qualified sales in the last 30 days; one partner tag per site |
| eBay | eBay Browse API | any (items that deliver there) | pre-owned by default (`EBAY_CONDITIONS=USED,NEW` for both) |
| AliExpress | AliExpress Affiliate API | almost any | priced in the local currency where supported; promo codes |
| Etsy | Etsy Open API v3 | shops in US, GB, CA, AU, DE, FR, IN, … | handmade and vintage; Etsy's attribution is shown in the app |
| Google Shopping | via SerpApi (paid third-party service) | any Google Shopping country | stores without an API (Myntra, Ajio, Zalando, ASOS…); one search = one credit |
| Keepa | Keepa API (paid) | Amazon sites incl. India | price history only |

Not included: Naver Shopping (its API was shut down on 31 Jul 2026); Rakuten Ichiba (its API moved to a new platform in 2026 whose spec isn't public); Mercado Libre and Walmart (their docs couldn't be verified). Stores with no public price API at all (Myntra, Ajio, Meesho, Zalando, Shein, Vinted, Depop…) are covered only through Google Shopping.

## Getting started on a new computer

Works the same on Windows, macOS and Linux.

**You need:** [Node.js 22 LTS](https://nodejs.org) (22.12 or newer — `nvm use` / `fnm use` pick it up from `.nvmrc`) and Git. Optional: Google Chrome, Chromium or Microsoft Edge for `npm run e2e`; the Expo Go app on a phone to try the app on a device; Android Studio + JDK 17 to build an APK.

```bash
git clone https://github.com/manisharai01/vibevault.git
cd vibevault
npm ci              # exact dependency versions from package-lock.json
npm run setup       # checks Node, creates .env and supabase/functions/.env from the examples (never overwrites)
```

Put the Supabase URL and anon key in `.env` (ask whoever runs the backend, or see [App](#3-app) below), then:

```bash
npm start           # press a = Android (Expo Go / emulator), i = iOS, w = web
npm run check       # typecheck, lint, unit tests, database tests
npm run e2e         # builds the web app and clicks through every screen and button in Chrome/Edge
```

Without `.env` values the app still runs and says "Live prices aren’t connected".

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Windows: Metro says `Failed to get the SHA-1 for …` | Start Expo through the npm scripts (`npm start`, `npm run android`, `npm run export:web`). They run the Expo CLI with one spelling of the drive letter; plain `npx expo …` from a terminal opened at `c:\…` (lowercase) trips Metro. |
| The app says "Live prices aren’t connected" | `.env` is missing the URL or anon key. Fill them in and restart `npm start` (or rebuild the APK) — the values are built into the app. `metro.config.js` makes Metro re-transform when they change, so no cache clearing is needed. |
| `npm run e2e`: "No Chrome, Chromium or Edge found" | Install Google Chrome, or set `CHROME_PATH` to a Chrome/Chromium/Edge executable. |
| `npm run e2e`: "Port 8787 is in use" | The test backend needs port 8787; stop whatever is using it. |
| `npm run setup` says Node is too old | Install Node 22 LTS (`nvm install 22` / `fnm install 22`). |
| Gradle can't download dependencies (some networks) | Set `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true` before `gradlew`. |
| Windows: files show as changed after pulling, with no real differences | `.gitattributes` keeps LF line endings on every OS; run `git add --renormalize .` once to refresh the checkout. |

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` on Windows, macOS and Linux and `npm run e2e` on Linux for every push and pull request.

## Setup

Requirements: a [Supabase](https://supabase.com/dashboard) project, and keys for the marketplaces you want (any subset works; the rest are skipped). Where to get each key is listed in `supabase/functions/.env.example`.

### 1. Keys

```bash
npm run setup                      # creates supabase/functions/.env (gitignored) if it doesn't exist
# fill in the keys you have and a long random REFRESH_CRON_SECRET, then:
npm run providers:check            # or: npm run providers:check -- "linen shirt" IN
```

`providers:check` calls the real APIs with your keys — a search and a lookup per marketplace, a fetch per coupon feed, and the ECB rates — and prints what it parsed and how each listing was classified. It never prints keys.

### 2. Backend (Supabase)

These commands use Supabase CLI 3 (`npx supabase@3`, no install or Docker needed):

```bash
npx supabase@3 login
npx supabase@3 link --project-ref <your-project-ref>
npx supabase@3 db push --remote                                    # tables, views, model, security rules, search terms
npx supabase@3 secrets set --env-file supabase/functions/.env      # keys + cron secret
npx supabase@3 functions deploy refresh-catalog live-item --use-api --no-verify-jwt
```

`--no-verify-jwt` is intended: `refresh-catalog` checks the `x-cron-secret` header itself, and `live-item` only re-checks listings already in the catalogue (at most every 15 minutes each).

Then open the Supabase **SQL editor**, paste `supabase/setup/schedule.sql`, replace `<PROJECT_REF>` and `<REFRESH_CRON_SECRET>`, and run it. It schedules the refresh queue (every 10 minutes) and the price model (daily, 23:40 UTC).

Kick off the first refreshes instead of waiting (each call does the next due marketplace + country and coupon feed; `catalog=` and `offers=` run up to 5 of each):

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/refresh-catalog?catalog=5&offers=5" -H "x-cron-secret: <REFRESH_CRON_SECRET>"
```

Tune it in the Table Editor: `search_terms` (what to search for, per department, with translations), `marketplace_markets` (which countries, searches/lookups per run, hours between runs), `offer_feeds`.

### 3. App

```bash
npm run setup           # creates .env (gitignored) from .env.example if it doesn't exist
# EXPO_PUBLIC_SUPABASE_URL      = https://<project-ref>.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY = the anon / publishable key (Project Settings → API)
npm start               # press a / i / w for Android / iOS / web
```

The anon/publishable key is public by design: it can only read the catalogue. Never put the service-role key in the app. These values are built into the app, so **rebuild after changing them**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run setup` | First run on a computer: checks Node, creates the `.env` files from the examples, says what's missing |
| `npm start` / `npm run android` / `ios` / `web` | Expo dev server (through `scripts/expo.cjs`, which keeps Metro happy on Windows) |
| `npm run export:web` | Static web build in `dist/` |
| `npm run typecheck` | TypeScript (strict) for the app and the Edge Functions |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm test` | Jest: app logic and every marketplace / coupon adapter against documented responses |
| `npm run test:db` | The real migrations in PGlite (Postgres in WebAssembly): ingest, queue, coupons, the prediction model and its track record, and the refresh/live-check code end to end |
| `npm run check` | Typecheck, lint, Jest and the database tests |
| `npm run e2e` | Builds the web app against a fake backend and drives every screen, button and flow in headless Chrome/Edge (`-- --headed` to watch, `-- --skip-build` to reuse the last build). Fails on any broken flow, console error, unlabelled control or a control shown twice on one screen |
| `npm run providers:check` | Tests your keys against the real APIs |

## Project structure

```
App.tsx                      error boundary → safe area → hydration gate → navigation
src/
  config.ts                  backend URL/key from EXPO_PUBLIC_* env vars
  components/                shared UI (headers, cards, price chart, status banner, image fallback, lifecycle)
  constants/                 theme tokens, catalogue vocabulary (categories, styles, colours, occasions)
  data/                      quests, badges, profiler questions, ISO country list
  screens/                   one file per screen
  services/                  catalogue + API client, price advice, style engine, item traits, stylist, links
  store/                     zustand store, persistence/migration, catalogue cache, derived-state hooks
  utils/                     dates, money formatting and conversion, dialogs, share
  __tests__/                 Jest tests (backend/ covers the marketplace and coupon adapters)
supabase/
  migrations/                schema, views, row-level security, search terms, prediction model
  functions/_shared/         providers/ (marketplaces + Keepa), offers/ (coupon feeds), pipeline, refresh, live check
  functions/refresh-catalog/ refresh queue endpoint (secret-protected)
  functions/live-item/       single-listing live check
  setup/schedule.sql         pg_cron schedule
  tests/                     PGlite database and integration tests (npm run test:db)
e2e/                         end-to-end tests: fake backend, browser helpers, every flow (npm run e2e)
metro.config.js              Expo defaults + EXPO_PUBLIC_* values in the transform cache key
scripts/
  check-providers.ts         key/API smoke test
  expo.cjs                   runs the Expo CLI (consistent project path on Windows)
  setup.cjs                  first-run setup
.github/workflows/ci.yml     checks on Windows, macOS and Linux + end-to-end tests
```

## Releasing

Before your first store build:

1. Replace the placeholder identifiers `com.vibevault.app` (`app.json` → `ios.bundleIdentifier` / `android.package`) with your own.
2. Replace the default Expo icon and splash images in `assets/`.
3. Make sure `.env` holds your Supabase URL and anon key (see Setup → App).
4. Affiliate programmes require a disclosure; the app shows one under Profile, plus each marketplace's required attribution.

### Android APK (local build)

Requires the Android SDK and NDK (installed with Android Studio) and JDK 17.

```bash
npx expo prebuild --platform android   # generates ./android (gitignored)
cd android
./gradlew assembleRelease              # Windows: gradlew.bat assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. The release bundle reads `.env` at build time.

- If `expo prebuild` offers to change the `android`/`ios` scripts in `package.json` to `expo run:*`, keep the existing ones if you want to keep using Expo Go.
- The generated project signs release builds with a debug key — fine for installing the APK directly. For the Play Store, sign with your own upload key (or let EAS manage it) and build an `.aab` with `./gradlew bundleRelease`.

### Other targets

- Cloud builds: [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`). `.env` is gitignored, so add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables.
- Web: `npm run export:web` produces a static site in `dist/`.
