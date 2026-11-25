# VibeVault – Thrift & Deal Detective

VibeVault is an Expo / React Native app (iOS, Android and web) that helps people find second-hand fashion that fits their style, buy at the right price, and track the impact of thrifting.

- **Discover** – listings from 9 marketplaces (Depop, Poshmark, Vinted, ThredUp, local thrift stores, Myntra, Meesho, Amazon, Flipkart) ranked by how well they match your style. Search, filter by category, platform and region, and sort by match, deal score, price or eco score.
- **My Vibe** – an 8-question Style Profiler (personality, music, movies, colour palette, weekend, sustainability, budget) that produces your top style archetypes and personalises every ranking.
- **Compose** – builds complete outfits, preferring pieces from your wishlist, with shuffle and share.
- **Deals** – top deals, price alerts and wishlist price tracking, with 7/30-day forecasts, the best day to buy, and backtested forecast accuracy.
- **Quests** – styling and sustainability challenges that award XP, points, levels and badges.
- **Profile** – level progress, eco impact from logged purchases, badges, leaderboard, display name and data reset.

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm start          # Expo dev server (press a / i / w for Android / iOS / web)
npm run android    # or: npm run ios, npm run web
```

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run typecheck` | TypeScript (strict) type check             |
| `npm run lint`      | ESLint (`eslint-config-expo`)              |
| `npm test`          | Jest unit tests (`jest-expo`)              |
| `npm run check`     | All of the above                           |

## How it works

- **No backend required.** The catalogue in `src/data/mockData.ts` is seed data. `src/services/priceEngine.ts` simulates each listing's price per calendar day (deterministic per item, so it's stable across launches but moves day to day), and the forecasting model predicts from the last two weeks of that history. All prices are in USD.
- **Price alerts** are checked when the app opens or returns to the foreground. When a target is hit you get an in-app alert and a badge on the Deals tab. There are no push notifications.
- **Persistence.** Only user data (profile, wishlist, alerts, purchases, quest progress, streak) is saved, with AsyncStorage (localStorage on web), under a versioned key. Everything read from storage is validated (`src/store/persistence.ts`). Older saved data is migrated, and corrupted data falls back to a fresh start instead of crashing. Catalogue, quest and badge definitions always come from the app bundle, so content updates reach existing installs.
- **Rewards are idempotent.** Quest rewards, badges and streaks are granted in store actions (`src/store/useStore.ts`) that can't pay out twice.

## Project structure

```
App.tsx                      error boundary → safe area → hydration gate → navigation
src/
  components/                shared UI (headers, cards, chart, chips, image fallback, lifecycle)
  constants/                 theme tokens, marketplaces/regions
  data/                      seed catalogue, quests, badges, leaderboard, profiler questions
  hooks/                     useKeyboardHeight
  navigation/                bottom tabs + per-tab native stacks, typed params
  screens/                   one file per screen
  services/                  price, style, catalogue, composer, gamification, linking
  store/                     zustand store, persistence/migration, derived-state hooks
  utils/                     dates (local calendar), formatting, dialogs, share, PRNG
  __tests__/                 Jest tests
```

## Releasing

1. Replace the placeholder identifiers `com.vibevault.app` (`app.json` → `ios.bundleIdentifier` / `android.package`) with your own before your first store build.
2. Replace the default Expo icon and splash images in `assets/`.
3. Build with [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`), or `npx expo export --platform web` for a static web build.

Product photos are loaded from Unsplash. If an image can't be loaded (for example, offline), a placeholder is shown instead.
