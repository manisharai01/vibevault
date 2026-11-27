// A stand-in for the VibeVault Supabase backend, for the end-to-end tests only. It answers the
// same REST shapes the app reads (catalog_items, price_points, catalog_status, available_markets,
// fx_latest, active_offers, prediction_track_record, prediction_calibration) and the live-item
// function, with listings for India. Tests can change a price or take the server offline.

import http from 'node:http';

export const ANON_KEY = 'sb_publishable_e2e';
export const BACKEND_PORT = 8787;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const DAY = 86_400_000;

type PricePoint = { date: string; price: number };
type Row = Record<string, unknown> & {
  id: string;
  title: string;
  source: string;
  market: string;
  available: boolean;
  current_price: number;
  price_history: PricePoint[];
};
type Offer = Record<string, unknown> & { id: string; market: string };

const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

function historyOf(prices: number[]): PricePoint[] {
  const now = Date.now();
  return prices.map((price, i) => ({ date: dateKey(now - (prices.length - 1 - i) * DAY), price }));
}

function statsOf(prices: number[]) {
  const now = Date.now();
  const sorted = [...prices].sort((a, b) => a - b);
  const lowest = sorted[0];
  const index = prices.lastIndexOf(lowest);
  return {
    days: prices.length,
    since: dateKey(now - (prices.length - 1) * DAY),
    lowest,
    lowest_on: dateKey(now - (prices.length - 1 - index) * DAY),
    highest: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function predictionOf(price: number, p14: number, low: number) {
  const horizon = (p: number) => ({
    p_drop: p,
    p_gone: 0.08,
    expected_low: low,
    basis: 'category',
    basis_listings: 64,
    verdict: p >= 0.6 ? 'wait' : p <= 0.3 ? 'buy' : 'unclear',
  });
  return {
    made_on: dateKey(Date.now()),
    price,
    horizons: { 7: horizon(Math.max(0, p14 - 0.15)), 14: horizon(p14), 30: horizon(Math.min(1, p14 + 0.1)) },
  };
}

const SOURCE_NAMES: Record<string, string> = { flipkart: 'Flipkart', ebay: 'eBay', amazon: 'Amazon', google_shopping: 'Google Shopping' };
const SITE_NAMES: Record<string, string> = { flipkart: 'Flipkart', ebay: 'eBay (ships to India)', amazon: 'Amazon.in', google_shopping: 'Google Shopping' };

interface Spec {
  id: string;
  title: string;
  category: string;
  department: 'women' | 'men' | 'unisex';
  styles: string[];
  colors: string[];
  prices: number[];
  source?: string;
  p14?: number;
  low?: number;
  extra?: Record<string, unknown>;
}

function rowOf(spec: Spec): Row {
  const source = spec.source ?? 'flipkart';
  const id = `${source}:IN:${spec.id}`;
  const current = spec.prices[spec.prices.length - 1];
  return {
    id,
    source,
    source_name: SOURCE_NAMES[source],
    site_name: SITE_NAMES[source],
    market: 'IN',
    source_item_id: spec.id,
    title: spec.title,
    description: null,
    brand: null,
    category: spec.category,
    department: spec.department,
    style_archetypes: spec.styles,
    colors: spec.colors,
    image_url: `https://img.e2e/${encodeURIComponent(id)}.png`,
    product_url: source === 'flipkart' ? `https://dl.flipkart.com/dl/${spec.id}` : `https://example.com/${source}/${spec.id}`,
    size: null,
    seller: null,
    condition: source === 'ebay' ? 'Good' : 'New with tags',
    currency: source === 'ebay' ? 'USD' : 'INR',
    current_price: current,
    original_price: source === 'flipkart' ? Math.round(current * 1.8) : null,
    available: true,
    listed_at: null,
    first_seen_at: isoAgo((spec.prices.length - 1) * DAY),
    last_seen_at: isoAgo(3600_000),
    last_checked_at: isoAgo(3600_000),
    ended_on: null,
    end_reason: null,
    price_history: historyOf(spec.prices.slice(-30)),
    stats: statsOf(spec.prices),
    prediction: spec.p14 === undefined ? null : predictionOf(current, spec.p14, spec.low ?? Math.round(current * 0.9)),
    ...spec.extra,
  };
}

/** About 13 months of history, cheapest every October (for the seasonal insight). */
function yearOfPrices(): number[] {
  return Array.from({ length: 400 }, (_, i) => (new Date(Date.now() - (399 - i) * DAY).getUTCMonth() === 9 ? 1199 : 1499));
}

function initialRows(): Row[] {
  const specs: Spec[] = [
    { id: 'LIN1', title: 'Women White Linen Shirt', category: 'Tops', department: 'women', styles: ['Minimalist'], colors: ['#F5F5F5'], prices: [999, 999, 979, 959, 949, 949, 939, 929, 919, 899], p14: 0.72, low: 820 },
    { id: 'TRT1', title: 'Women Black Ribbed Turtleneck', category: 'Tops', department: 'women', styles: ['Minimalist', 'Dark Academia'], colors: ['#1C1C1C'], prices: [749, 749, 749, 749, 749, 749, 749, 749], p14: 0.12, low: 749 },
    { id: 'BLS1', title: 'Women Pink Puff Sleeve Blouse', category: 'Tops', department: 'women', styles: ['Cottagecore'], colors: ['#E8A0B4'], prices: [999, 999] },
    { id: 'TRS1', title: 'Women Straight Leg Beige Trousers', category: 'Bottoms', department: 'women', styles: ['Minimalist'], colors: ['#D8C3A0'], prices: [1399, 1349, 1299], p14: 0.45 },
    { id: 'JNS1', title: 'Women High Waist Black Jeans', category: 'Bottoms', department: 'women', styles: ['Minimalist', 'Grunge'], colors: ['#1C1C1C'], prices: [1499] },
    { id: 'DRS1', title: 'Floral Tiered Maxi Dress', category: 'Dresses', department: 'women', styles: ['Bohemian', 'Cottagecore'], colors: ['#E8A0B4', '#556B2F'], prices: [1199] },
    { id: 'DRS2', title: 'Black Slip Dress', category: 'Dresses', department: 'women', styles: ['Minimalist'], colors: ['#1C1C1C'], prices: [1099] },
    { id: 'SNK1', title: 'Women White Leather Sneakers', category: 'Shoes', department: 'women', styles: ['Minimalist'], colors: ['#F5F5F5'], prices: [1999, 1999] },
    { id: 'LOF1', title: 'Women Tan Loafers', category: 'Shoes', department: 'women', styles: ['Preppy'], colors: ['#C19A6B'], prices: [1799] },
    { id: 'BLZ1', title: 'Women Camel Wool Blazer', category: 'Outerwear', department: 'women', styles: ['Dark Academia', 'Minimalist'], colors: ['#C19A6B'], prices: yearOfPrices(), p14: 0.65, low: 1199 },
    { id: 'TOT1', title: 'Women Beige Tote Bag', category: 'Bags', department: 'women', styles: ['Minimalist'], colors: ['#D8C3A0'], prices: [799] },
    { id: 'EAR1', title: 'Gold Hoop Earrings', category: 'Accessories', department: 'women', styles: ['Y2K'], colors: ['#D4AF37'], prices: [399] },
    { id: 'OXF1', title: 'Men White Oxford Shirt', category: 'Tops', department: 'men', styles: ['Minimalist', 'Preppy'], colors: ['#F5F5F5'], prices: [899] },
    { id: 'CHN1', title: 'Men Slim Beige Chinos', category: 'Bottoms', department: 'men', styles: ['Minimalist', 'Preppy'], colors: ['#D8C3A0'], prices: [1199] },
    { id: 'SNK2', title: 'Men White Sneakers', category: 'Shoes', department: 'men', styles: ['Minimalist'], colors: ['#F5F5F5'], prices: [1899] },
    {
      id: 'v1|1234567890|0',
      source: 'ebay',
      title: "Levi's Vintage Trucker Denim Jacket",
      category: 'Outerwear',
      department: 'unisex',
      styles: ['Vintage'],
      colors: ['#3A6EA5'],
      prices: [49, 48, 47, 46, 45, 44, 43, 42.5],
      p14: 0.3,
      extra: { seller: 'denimhunter', product_url: 'https://www.ebay.com/itm/1234567890' },
    },
    {
      id: 'B0TEST0001',
      source: 'amazon',
      title: 'Women Linen Blend Wide Leg Pants',
      category: 'Bottoms',
      department: 'women',
      styles: ['Minimalist'],
      colors: ['#F3EAD3'],
      prices: [1299, 1199],
      extra: { original_price: 2499, product_url: 'https://www.amazon.in/dp/B0TEST0001?tag=vibe-21' },
    },
    {
      id: '4887~ab12cd34',
      source: 'google_shopping',
      title: 'Roadster Women Black Slim Fit Jeans',
      category: 'Bottoms',
      department: 'women',
      styles: ['Minimalist'],
      colors: ['#1C1C1C'],
      prices: [1099],
      extra: { seller: 'Myntra', original_price: 2199, product_url: 'https://www.google.com/shopping/product/4887' },
    },
  ];
  return specs.map(rowOf);
}

function initialOffers(): Offer[] {
  const base = { network: 'cuelinks', market: 'IN', source: null, listing_id: null, description: null, starts_at: null, last_seen_at: isoAgo(3600_000) };
  return [
    { ...base, id: 'cuelinks:IN:1', merchant: 'Myntra', merchant_domain: 'myntra.com', title: 'Flat 10% off on fashion', code: 'MYNTRA10', url: 'https://linksredirect.com/myntra10', discount_text: '10% off', min_spend: 999, currency: 'INR', ends_at: isoAgo(-3 * DAY) },
    { ...base, id: 'flipkart:IN:dotd', network: 'flipkart', merchant: 'Flipkart', merchant_domain: 'flipkart.com', source: 'flipkart', title: 'Min. 50% off women’s western wear', code: null, url: 'https://dl.flipkart.com/dl/offers/western', discount_text: null, min_spend: null, currency: null, ends_at: isoAgo(-DAY) },
    // An expired and a stale offer: the app must never show these.
    { ...base, id: 'cuelinks:IN:old', merchant: 'Ajio', merchant_domain: 'ajio.com', title: 'EXPIRED OFFER', code: 'OLD', url: 'https://linksredirect.com/old', discount_text: null, min_spend: null, currency: null, ends_at: isoAgo(DAY) },
    { ...base, id: 'cuelinks:IN:stale', merchant: 'Ajio', merchant_domain: 'ajio.com', title: 'STALE OFFER', code: 'STALE', url: 'https://linksredirect.com/stale', discount_text: null, min_spend: null, currency: null, ends_at: null, last_seen_at: isoAgo(30 * 3600_000) },
  ];
}

export interface FakeBackend {
  /** Starts listening on BACKEND_PORT (the port the test build is compiled against). */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** All listings, for building expectations. */
  rows(): Row[];
  /** Changes today's price of a listing (as the next marketplace check would). */
  setPrice(id: string, price: number): void;
  /** While offline, every request fails like a dropped connection. */
  setOffline(offline: boolean): void;
  /** Restores the initial listings and offers. */
  reset(): void;
  readonly stats: { catalogRequests: number; liveChecks: string[] };
}

export function createFakeBackend(): FakeBackend {
  let rows = initialRows();
  let offers = initialOffers();
  const fullHistory = new Map<string, PricePoint[]>([['flipkart:IN:BLZ1', historyOf(yearOfPrices())]]);
  let offline = false;
  const stats = { catalogRequests: 0, liveChecks: [] as string[] };

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, accept, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  const server = http.createServer((req, res) => {
    if (offline) {
      req.socket.destroy();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.apikey !== ANON_KEY) return send(401, { message: 'No API key found in request' });

    const url = new URL(req.url ?? '/', BACKEND_URL);
    const path = url.pathname;
    const eq = (name: string) => (url.searchParams.get(name) ?? '').replace(/^eq\./, '');

    switch (path) {
      case '/rest/v1/catalog_items': {
        stats.catalogRequests++;
        const or = url.searchParams.get('or') ?? '';
        const market = /market\.eq\.([A-Z]{2})/.exec(or)?.[1];
        const tracked = (/id\.in\.\((.*)\)\)$/.exec(or)?.[1] ?? '').split(',').map((s) => s.replace(/^"|"$/g, ''));
        return send(
          200,
          rows.filter((r) => (r.available && (!market || r.market === market)) || tracked.includes(r.id)),
        );
      }
      case '/rest/v1/price_points': {
        const id = eq('listing_id');
        const points = fullHistory.get(id) ?? rows.find((r) => r.id === id)?.price_history ?? [];
        return send(200, points.map((p) => ({ observed_on: p.date, price: p.price })));
      }
      case '/rest/v1/catalog_status': {
        const count = (source: string) => rows.filter((r) => r.source === source && r.available).length;
        return send(200, [
          { source: 'flipkart', name: 'Flipkart', attribution: null, last_success_at: isoAgo(2 * 3600_000), available_listings: count('flipkart'), markets: ['IN'] },
          { source: 'amazon', name: 'Amazon', attribution: 'As an Amazon Associate, VibeVault earns from qualifying purchases.', last_success_at: isoAgo(3 * 3600_000), available_listings: count('amazon'), markets: ['IN'] },
          { source: 'ebay', name: 'eBay', attribution: null, last_success_at: isoAgo(1.5 * 3600_000), available_listings: count('ebay'), markets: ['IN'] },
          { source: 'google_shopping', name: 'Google Shopping', attribution: null, last_success_at: isoAgo(5 * 3600_000), available_listings: count('google_shopping'), markets: ['IN'] },
          { source: 'etsy', name: 'Etsy', attribution: 'The term "Etsy" is a trademark of Etsy, Inc.', last_success_at: null, available_listings: 0, markets: [] },
        ]);
      }
      case '/rest/v1/available_markets':
        return send(200, [{ market: 'IN', listings: rows.length, sources: ['amazon', 'ebay', 'flipkart', 'google_shopping'] }]);
      case '/rest/v1/fx_latest': {
        const today = dateKey(Date.now());
        return send(200, [
          { currency: 'INR', per_eur: 98.4, observed_on: today },
          { currency: 'USD', per_eur: 1.06, observed_on: today },
          { currency: 'GBP', per_eur: 0.84, observed_on: today },
        ]);
      }
      case '/rest/v1/active_offers':
        // Like the active_offers view: only in-date offers re-confirmed by their feed in the last 26 hours.
        return send(
          200,
          offers.filter((o) => {
            const ends = o.ends_at ? Date.parse(String(o.ends_at)) : Infinity;
            const seen = Date.parse(String(o.last_seen_at));
            return o.market === eq('market') && ends > Date.now() && Date.now() - seen < 26 * 3600_000;
          }),
        );
      case '/rest/v1/prediction_track_record':
        return send(200, [
          { horizon_days: 14, source: null, resolved: 812, dropped: 300, brier: 0.162, brier_base_rate: 0.233, wait_calls: 210, wait_correct: 151, buy_calls: 402, buy_correct: 356, since: '2026-10-01', last_resolved: dateKey(Date.now()) },
        ]);
      case '/rest/v1/prediction_calibration':
        return send(200, []);
      case '/functions/v1/live-item': {
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const id = (JSON.parse(body || '{}') as { id?: string }).id ?? '';
          stats.liveChecks.push(id);
          const row = rows.find((r) => r.id === id);
          if (!row) return send(404, { error: 'Listing not found.' });
          row.last_checked_at = new Date().toISOString();
          send(200, { item: row, checked: row.source === 'google_shopping' ? 'unsupported' : 'live' });
        });
        return;
      }
      default:
        return send(404, { message: 'not found' });
    }
  });

  return {
    stats,
    start: () =>
      new Promise((resolve, reject) => {
        server.once('error', (error: NodeJS.ErrnoException) =>
          reject(error.code === 'EADDRINUSE' ? new Error(`Port ${BACKEND_PORT} is in use — stop whatever is using it and run the tests again.`) : error),
        );
        server.listen(BACKEND_PORT, '127.0.0.1', () => resolve());
      }),
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    rows: () => rows,
    setPrice(id, price) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`No listing ${id}`);
      const today = dateKey(Date.now());
      const history = row.price_history.filter((p) => p.date !== today).concat({ date: today, price });
      row.price_history = history.slice(-30);
      row.current_price = price;
      row.stats = statsOf(history.map((p) => p.price));
      row.last_checked_at = new Date().toISOString();
      row.prediction = null; // a price change makes the old prediction stale
    },
    setOffline(value) {
      offline = value;
      if (value) server.closeAllConnections();
    },
    reset() {
      rows = initialRows();
      offers = initialOffers();
      offline = false;
    },
  };
}
