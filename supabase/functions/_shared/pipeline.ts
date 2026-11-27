// Turns a marketplace listing into a catalogue row: decides department, category and
// style tags from the marketplace's own data and text, and drops listings that aren't
// adult fashion. The search that found a listing only fills in what the text doesn't say.

import { classifyCategory, classifyStyles, colorsFromText, detectDepartment, isNotFashion } from './normalize.ts';
import {
  listingId,
  STYLE_ARCHETYPES,
  type Category,
  type Department,
  type IngestRow,
  type NormalizedListing,
  type StyleArchetype,
} from './types.ts';

export interface ListingHint {
  /** Category the search (or the stored row) was for. */
  category: Category;
  /** Department the search (or the stored row) was for. */
  department: Department;
  /** Style the search was for, plus styles already stored for the row. */
  archetypes: StyleArchetype[];
}

export type Prepared = { row: IngestRow } | { rejected: 'kids' | 'not-fashion' };

export function prepareListing(listing: NormalizedListing, hint: ListingHint): Prepared {
  if (isNotFashion(listing.title, listing.categoryText)) return { rejected: 'not-fashion' };

  const stated = listing.department ?? detectDepartment(listing.categoryText, listing.title);
  if (stated === 'kids') return { rejected: 'kids' };

  const category = classifyCategory(listing.title, listing.categoryText) ?? hint.category;
  const styles = new Set<StyleArchetype>([
    ...hint.archetypes,
    ...classifyStyles(listing.title, listing.description, listing.categoryText),
  ]);

  return {
    row: {
      id: listingId(listing),
      source: listing.source,
      market: listing.market,
      source_item_id: listing.sourceItemId,
      title: listing.title,
      description: listing.description,
      brand: listing.brand,
      image_url: listing.imageUrl,
      product_url: listing.productUrl,
      category,
      department: stated ?? hint.department,
      style_archetypes: STYLE_ARCHETYPES.filter((s) => styles.has(s)),
      condition: listing.condition,
      size: listing.size,
      colors: colorsFromText(listing.colorText, listing.title),
      seller: listing.seller,
      currency: listing.currency,
      current_price: listing.price,
      original_price: listing.originalPrice,
      available: listing.available,
      listed_at: listing.listedAt,
    },
  };
}
