// Coupon and offer feeds (official merchant and affiliate-network APIs). Each one is active
// only when its keys are set (see supabase/functions/.env.example).

import type { OfferSourceDefinition } from '../types.ts';
import { admitadDefinition } from './admitad.ts';
import { awinDefinition } from './awin.ts';
import { cuelinksDefinition } from './cuelinks.ts';
import { flipkartOffersDefinition } from './flipkart.ts';

export const OFFER_SOURCES: OfferSourceDefinition[] = [flipkartOffersDefinition, cuelinksDefinition, admitadDefinition, awinDefinition];
