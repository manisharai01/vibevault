# VibeVault – Thrift & Deal Detective

VibeVault is an Expo / React Native app (iOS, Android and web) that helps people find fashion that fits their style, buy at the right price, and track the impact of thrifting. **All prices are live marketplace prices** — nothing is simulated.

- **Discover** – live listings from **Flipkart** (new, India) and **eBay** (pre-owned, shipping to India) ranked by how well they match your style. Search, filter by category, platform and region, and sort by match, deal score, price or eco score.
- **Item page** – the price is re-checked on the marketplace when you open it. Shows the recorded daily price history, a forecast once there's a week of data, price alerts, and "search other stores" links (Myntra, Meesho, Amazon, Ajio, Depop, Vinted, Poshmark, ThredUp).
- **My Vibe** – an 8-question Style Profiler (personality, music, movies, colour palette, weekend, sustainability, budget) that personalises every ranking.
- **Compose** – builds complete outfits, preferring pieces from your wishlist, with shuffle and share.
- **Deals** – top deals, price alerts and wishlist price tracking, with forecasts and backtested accuracy from recorded prices.
- **Quests** – styling and sustainability challenges that award XP, points, levels and badges.
- **Profile** – level progress, eco impact from logged purchases, badges, display name and data reset.

## How it works

```
 Flipkart Affiliate API ─┐                 ┌─ refresh-catalog (daily, pg_cron)
 eBay Browse API ────────┼── Edge Functions┤
 ECB rates (frankfurter) ┘   (hold the keys)└─ live-item (when an item is opened)
                                   │
                         Supabase Postgres: listings, price_points (1/day), fx_rates
                                   │  read-only (RLS)
                              VibeVault app
```

- **Why a backend?** Marketplace API keys can't be kept secret inside an app, and price history has to be recorded every day whether or not anyone opens the app. A small [Supabase](https://supabase.com) project does both (the free tier is enough).
- **Daily refresh.** `refresh-catalog` re-checks every known listing (price, availability), records today's price, finds new listings with the searches in the `search_queries` table, retires listings that disappear, and stores the USD→INR rate.
- **Live check.** Opening an item calls `live-item`, which re-fetches that one listing from its marketplace (at most once every 15 minutes per listing).
- **Currencies.** Each price is shown in the listing's own currency (₹ for Flipkart, usually $ for eBay). Sorting, budgets and totals convert to rupees with the latest recorded rate and are marked "≈" when converted. eBay shipping and import charges are shown by eBay at checkout.
- **Forecasts** use a damped linear trend fitted to recorded prices only. They appear once a listing has 7 days of history; until then the app says it's still collecting data.
- **Stores without a price API.** Myntra, Meesho, Ajio, Amazon (needs an Associates account with sales), Depop, Vinted, Poshmark and ThredUp have no usable public price API, so they are offered as search links without prices.
- **Price alerts** are checked whenever fresh prices are downloaded (on launch, on returning to the app, and every 15 minutes while it's open). There are no push notifications.
- **Offline.** The last download is cached and shown with its age ("Offline — showing prices saved 2 h ago").
- **Persistence.** Only user data (profile, wishlist, alerts, purchases, quest progress, streak) is saved on the device, validated on load (`src/store/persistence.ts`), migrated from older versions, and never overwritten if it couldn't be read.

## Setup

Requirements: Node.js 22+ and npm, plus accounts for:

| Account | What you need | Where |
| --- | --- | --- |
| Supabase | a project (free tier works) | [supabase.com](https://supabase.com/dashboard) |
| Flipkart Affiliate | Affiliate ID + API token | affiliate.flipkart.com → Tools → API Token |
| eBay Developers | Production Client ID + Client Secret | developer.ebay.com → Application Keysets |

You can start with only one marketplace; the other is reported as "not configured" and skipped.

### 1. Marketplace keys

```bash
npm install
cp supabase/functions/.env.example supabase/functions/.env   # gitignored
# fill in the keys and a long random REFRESH_CRON_SECRET, then:
npm run providers:check
```

`providers:check` calls the real APIs with your keys (a 3-result search and one lookup per marketplace, plus the exchange rate) and prints what it parsed. It never prints the keys.

### 2. Backend (Supabase)

These commands use Supabase CLI 3 (`npx supabase@3`, no install or Docker needed):

```bash
npx supabase@3 login
npx supabase@3 link --project-ref <your-project-ref>
npx supabase@3 db push --remote                                    # tables, views, security rules, starter searches
npx supabase@3 secrets set --env-file supabase/functions/.env      # marketplace keys + cron secret
npx supabase@3 functions deploy refresh-catalog live-item --use-api --no-verify-jwt
```

`--no-verify-jwt` is intended: `refresh-catalog` checks the `x-cron-secret` header itself, and `live-item` only re-checks listings already in the catalogue. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the functions automatically.

Then open the Supabase **SQL editor**, paste `supabase/setup/schedule.sql`, replace `<PROJECT_REF>` and `<REFRESH_CRON_SECRET>`, and run it. This schedules the daily refresh (00:30/00:45 UTC).

Run the first refresh now instead of waiting for the schedule:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/refresh-catalog?source=flipkart" -H "x-cron-secret: <REFRESH_CRON_SECRET>"
curl -X POST "https://<project-ref>.supabase.co/functions/v1/refresh-catalog?source=ebay" -H "x-cron-secret: <REFRESH_CRON_SECRET>"
```

Each call returns a summary (listings checked, found, removed, errors). Results are also logged in the `refresh_runs` table.

To change what the app discovers, edit the `search_queries` table (Table Editor): each row is a search, with the category and style it's tagged with.

### 3. App

```bash
cp .env.example .env    # gitignored
# EXPO_PUBLIC_SUPABASE_URL      = https://<project-ref>.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY = the anon / publishable key (Project Settings → API)
npm start               # press a / i / w for Android / iOS / web
```

The anon/publishable key is public by design: it can only read the catalogue. Never put the service-role key in the app. These values are built into the app, so **rebuild after changing them**. A build without them shows "Live prices aren't connected".

## Scripts

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript (strict) for the app and the Edge Functions |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm test` | Jest tests (app and backend logic, with mocked APIs) |
| `npm run check` | All of the above |
| `npm run providers:check` | Tests your marketplace keys against the real APIs |

## Project structure

```
App.tsx                      error boundary → safe area → hydration gate → navigation
src/
  config.ts                  backend URL/key from EXPO_PUBLIC_* env vars
  components/                shared UI (headers, cards, chart, status banner, image fallback, lifecycle)
  constants/                 theme tokens, marketplaces/regions
  data/                      quests, badges, profiler questions
  screens/                   one file per screen
  services/                  catalogue + API client, price analysis, style, composer, gamification, links
  store/                     zustand store, persistence/migration, catalogue cache, derived-state hooks
  utils/                     dates (local calendar), money formatting, dialogs, share
  __tests__/                 Jest tests (backend/ tests the Edge Function logic)
supabase/
  migrations/                database schema, views, row-level security, starter searches
  functions/_shared/         marketplace clients (Flipkart, eBay), refresh + live-check logic
  functions/refresh-catalog/ daily refresh endpoint (secret-protected)
  functions/live-item/       single-listing live check
  setup/schedule.sql         pg_cron schedule
scripts/check-providers.ts   key/API smoke test
```

## Releasing

Before your first store build:

1. Replace the placeholder identifiers `com.vibevault.app` (`app.json` → `ios.bundleIdentifier` / `android.package`) with your own.
2. Replace the default Expo icon and splash images in `assets/`.
3. Make sure `.env` holds your Supabase URL and anon key (see Setup → App).

### Android APK (local build)

Requires the Android SDK and NDK (installed with Android Studio) and JDK 17.

```bash
npx expo prebuild --platform android   # generates ./android (gitignored)
cd android
./gradlew assembleRelease              # Windows: gradlew.bat assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk` (a single APK for all phone CPU types). The release bundle reads `.env` at build time.

- `expo prebuild` changes the `android`/`ios` scripts in `package.json` to `expo run:*`. Revert that change if you want to keep using Expo Go.
- The generated project signs release builds with a debug key. That's fine for installing the APK directly on phones. For the Play Store, sign with your own upload key (or let EAS manage it) and build an `.aab` with `./gradlew bundleRelease`.

### Other targets

- Cloud builds: [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`). `.env` is gitignored, so add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables. For an APK instead of an `.aab`, use a build profile with `"android": { "buildType": "apk" }` in `eas.json`.
- Web: `npx expo export --platform web` produces a static site in `dist/`.

Product images come from the marketplaces. If an image can't be loaded (for example, offline), a placeholder is shown instead.
