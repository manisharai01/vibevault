// Every marketplace VibeVault can read prices from. Each one is active only when its API
// keys are set (see supabase/functions/.env.example).

import type { HistoryDefinition, ProviderDefinition } from '../types.ts';
import { aliexpressDefinition } from './aliexpress.ts';
import { amazonDefinition } from './amazon.ts';
import { ebayDefinition } from './ebay.ts';
import { etsyDefinition } from './etsy.ts';
import { flipkartDefinition } from './flipkart.ts';
import { impactDefinition } from './impact.ts';
import { keepaDefinition } from './keepa.ts';
import { serpapiDefinition } from './serpapi.ts';

export const PROVIDERS: ProviderDefinition[] = [
  flipkartDefinition,
  amazonDefinition,
  ebayDefinition,
  aliexpressDefinition,
  etsyDefinition,
  impactDefinition,
  serpapiDefinition,
];

/** Price-history archives used to backfill listings' history. */
export const ARCHIVES: HistoryDefinition[] = [keepaDefinition];
