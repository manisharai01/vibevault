// Every screen, button and flow of VibeVault, driven like a person would in the web build.
// Each screen is also audited: no control may appear twice and every control needs a name.

import type { FakeBackend } from './fakeBackend.ts';
import type { Harness } from './harness.ts';

declare global {
  interface Window {
    __opened: string[];
    __shared?: { title?: string; text?: string };
  }
}

const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export async function runFlows(h: Harness, base: string, backend: FakeBackend) {
  const { page } = h;
  const rows = backend.rows();
  const total = rows.length;
  const womenAndUnisex = rows.filter((r) => r.department !== 'men').length;
  const countText = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

  const opened = () => page.evaluate(() => window.__opened.slice());
  const expectOpened = async (prefix: string) => {
    const urls = await opened();
    if (!urls.some((u) => u.startsWith(prefix))) throw new Error(`Expected ${prefix}… to open; opened: ${urls.join(', ') || 'nothing'}`);
  };
  const next = async () => {
    await h.tapLabel('Next question');
    await h.pause(400);
  };
  /** Labels of the listing cards on screen, top to bottom. */
  const cardLabels = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="button"][aria-label]')]
        .filter((el) => el.checkVisibility({ checkOpacity: true }) && !el.closest('[aria-hidden="true"]'))
        .map((el) => el.getAttribute('aria-label')!)
        .filter((l) => / on [^,]+(, \d+% match|, deal score \d+)?$/.test(l) && !/^(Save|Remove) /.test(l)),
    );
  const selected = (text: string) =>
    page.evaluate(
      (t) =>
        [...document.querySelectorAll('[aria-selected="true"]')].some(
          (el) => (el as HTMLElement).innerText.trim() === t && el.checkVisibility({ checkOpacity: true }) && !el.closest('[aria-hidden="true"]'),
        ),
      text,
    );
  const expectSelected = async (text: string) => {
    for (let i = 0; i < 20; i++) {
      if (await selected(text)) return;
      await h.pause(100);
    }
    throw new Error(`Expected "${text}" to be selected`);
  };
  /** Scrolls the screen's main scroll view to the bottom (RN-web scroll views are divs). */
  const scrollToBottom = () =>
    page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('div')].filter(
        (el) => el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY !== 'hidden' && el.checkVisibility() && !el.closest('[aria-hidden="true"]'),
      );
      scrollers.sort((a, b) => b.clientHeight - a.clientHeight);
      scrollers[0]?.scrollTo({ top: scrollers[0].scrollHeight });
    });

  // ------------------------------------------------------------------ Discover (no profile yet)
  h.step = 'discover';
  await page.goto(base, { waitUntil: 'networkidle0' });
  await h.expectText('Live prices from real marketplaces, ranked for you.');
  await h.expectText('Live prices from Flipkart, Amazon, eBay, Google Shopping');
  await h.expectText('Find your vibe in 2 minutes');
  await h.expectText(countText(total));
  await h.audit('Discover');
  await h.shot('discover');

  await h.tapExact('Lowest Price');
  await expectSelected('Lowest Price');
  const cheapest = (await cardLabels())[0];
  if (!cheapest?.startsWith('Gold Hoop Earrings, ₹399')) throw new Error(`Lowest Price should list the ₹399 earrings first, got ${cheapest}`);
  await h.tapExact('Newest');
  await expectSelected('Newest');
  await h.tapExact('Best Deal Now');
  await expectSelected('Best Deal Now');

  await h.tapLabel('Category: Shoes');
  await h.expectText(countText(rows.filter((r) => r.category === 'Shoes').length));
  await h.tapExact('Clear filters');
  await h.expectText(countText(total));
  await h.tapLabel('Marketplace: eBay');
  await h.expectText(countText(1));
  await h.tapLabel('Condition: New');
  await h.expectText('No items match your filters');
  await h.audit('Discover (no results)'); // only one "Clear filters"
  await h.tapExact('Clear filters');
  await h.expectText(countText(total));
  await h.tapLabel('Condition: Pre-owned');
  await h.expectText(countText(1));
  await h.tapLabel('Condition: All');
  await h.type('Search listings', 'blazer');
  await h.expectText(countText(1));
  await h.tapLabel('Clear search');
  await h.expectText(countText(total));

  await h.tapLabel('Save Women White Linen Shirt to wishlist');
  await h.expectLabel('Remove Women White Linen Shirt from wishlist');

  // Coupons are issued per country: until one is chosen, Deals asks for it.
  h.step = 'deals-no-country';
  await h.tab('Deals');
  await h.tapText('Coupons (0)');
  await h.expectText('Choose your country for coupons');
  await h.audit('Deals: coupons without a country');
  await h.tapExact('Choose country');
  await h.expectText('Where do you shop?'); // the country picker on Profile
  await h.audit('Profile: country picker from Deals');
  await h.tapExact('Close');
  await h.expectText('Shopping Settings');
  await h.tab('Deals');
  await h.tapExact('Top deals');
  await h.tab('Discover');

  await h.tapText('Find your vibe in 2 minutes');

  // ------------------------------------------------------------------ Style Profiler
  h.step = 'profiler';
  await h.expectText('Where do you shop?');
  await h.expectText('LIVE PRICES NOW'); // text-transform: uppercase
  await h.audit('Profiler: country');
  await h.tapExact(`${flag('IN')} India`);
  await next();
  await h.expectText('Which sections should we style you from?');
  await h.tapExact("👗 Women's");
  await next();
  await h.expectText('At a party, you are usually');
  await h.tapLabel('Previous question');
  await h.expectText('Which sections should we style you from?');
  await next();
  for (const answer of ['Quietly people-watching', 'Wait to see if it lasts', 'Planned the night before', 'You always look so put-together', 'Helpful', 'A café, a book']) {
    await h.tapText(answer);
    await next();
  }
  await h.expectText('Which colours do you love wearing?');
  for (const colour of ['Black', 'White', 'Beige & cream']) await h.tapLabel(colour);
  await next();
  await h.expectText('Any colours you never wear?');
  await h.expectLabel('Skip'); // optional question, nothing chosen yet
  await h.tapLabel('Black'); // already loved: can't also be avoided
  if (await page.evaluate(() => document.querySelector('[aria-label="Black"]')?.getAttribute('aria-checked') === 'true')) {
    throw new Error('A loved colour could be marked as avoided');
  }
  await h.tapLabel('Yellow & orange');
  await next();
  await h.tapText('Fitted / slim');
  await next();
  await h.tapText('Work & office');
  await next();
  await h.expectText('What do you usually spend on one piece, at most?');
  await h.expectText('Suggestions are the 25th–90th percentile');
  await h.audit('Profiler: budget');
  const suggestion = await page.evaluate(
    () => [...document.querySelectorAll('[role="radio"]')].map((el) => (el as HTMLElement).innerText.trim()).find((t) => t.startsWith('Up to ')) ?? null,
  );
  if (!suggestion) throw new Error('No budget suggestions from live prices');
  await h.tapExact(suggestion);
  await h.tapExact('No limit');
  await h.type('Budget per piece in INR', '2000');
  await next();
  await h.expectText('How much do you prefer pre-owned pieces?');
  await h.tapLabel('75 — Strong preference');
  await h.expectText('Strong preference');
  await next();
  await h.expectText('Would you wear these?');
  await h.audit('Profiler: taste check');
  await h.shot('taste-check');
  const tasteItems = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="I\'d wear it: "]')].map((el) => el.getAttribute('aria-label')!.slice("I'd wear it: ".length)),
  );
  if (tasteItems.length < 4) throw new Error('The taste check shows fewer than 4 listings');
  for (const [i, title] of tasteItems.slice(0, 4).entries()) await h.tapLabel(i < 3 ? `I'd wear it: ${title}` : `Not for me: ${title}`);
  await h.tapLabel('See my style profile');
  await h.pause(600);
  await h.expectText('Your Style Profile');
  await h.expectText('Your Style DNA');
  await h.expectText('Your answers say you');
  await h.expectText(`India · INR`);
  await h.expectText('Up to ₹2,000');
  await h.audit('My Vibe: results');
  await h.shot('style-profile');

  const topMatch = await page.evaluate(
    () => [...document.querySelectorAll('[aria-label$="% match"]')].find((el) => el.checkVisibility({ checkOpacity: true }) && !el.closest('[aria-hidden="true"]'))?.getAttribute('aria-label') ?? null,
  );
  if (!topMatch) throw new Error('No top matches on the results');
  await h.tapLabel(topMatch);
  await h.expectLabel('Go back');
  await h.expectText(topMatch.replace(/, \d+% match$/, ''));
  await h.tapLabel('Go back');
  await h.expectText('Live prices from Flipkart'); // Discover, profiled
  await h.tab('My Vibe');
  await h.tapText('See outfits built for you');
  await h.expectText('Your Stylist');
  await h.tab('My Vibe');
  await h.tapText('Retake the Profiler');
  await h.expectText('Where do you shop?');
  await h.audit('Profiler: retake');
  await h.tapExact('Cancel');
  await h.expectText('Your Style Profile');

  // ------------------------------------------------------------------ Stylist
  h.step = 'stylist';
  await h.tab('Stylist');
  await h.expectText('Look 1 of');
  await h.audit('Stylist: outfits');
  await h.shot('stylist');
  await h.tapLabel('Occasion: Work & office');
  await h.pause(300);
  if (await page.evaluate(() => document.body.innerText.includes('Not enough pieces for a full look'))) {
    await h.tapExact('Browse Discover');
    await h.expectText('Live prices from Flipkart');
    await h.tab('Stylist');
  }
  await h.tapLabel('Occasion: Any occasion');
  await h.tapLabel('Style: Minimalist');
  await h.expectText('Look 1 of');
  await h.tapLabel('Style: Any style');
  await h.expectText('Look 1 of');
  await h.tapText('Next look');
  await h.expectText('Look 2 of');
  for (let i = 0; i < 8 && !(await page.evaluate(() => document.body.innerText.includes('Back to look 1'))); i++) await h.tapText('Next look');
  await h.tapText('Back to look 1');
  await h.expectText('Look 1 of');
  await h.tapLabel('Share look');
  const shared = await page.evaluate(() => window.__shared?.text ?? '');
  if (!shared.includes('My VibeVault look')) throw new Error('Share did not hand the look to the share sheet');
  const piece = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((el) => !el.closest('[aria-hidden="true"]')).map((el) => el.getAttribute('aria-label')!).find((l) => /^(Top|Bottom|Dress \/ one-piece|Layer|Shoes|Bag|Accessory): /.test(l)) ?? null);
  if (!piece) throw new Error('The look has no pieces');
  await h.tapLabel(piece);
  await h.expectLabel('Go back');
  await h.tapLabel('Go back');
  await h.tapText('Capsule wardrobe');
  await h.expectText('for the whole capsule');
  await h.audit('Stylist: capsule');
  await h.shot('capsule');
  const capsulePiece = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((el) => !el.closest('[aria-hidden="true"]')).map((el) => el.getAttribute('aria-label')!).find((l) => /^(Top|Bottom|Dress \/ one-piece|Layer|Shoes|Bag|Accessory): /.test(l)) ?? null);
  if (!capsulePiece) throw new Error('The capsule has no pieces');
  await h.tapLabel(capsulePiece);
  await h.tapLabel('Go back');
  await h.tapText('Outfits');
  await h.expectText('Look 1 of');
  await h.expectNoText('Men White Oxford Shirt'); // women's sections only

  // ------------------------------------------------------------------ Item page
  h.step = 'item';
  await h.tab('Discover');
  await h.tapExact('Best Match'); // available once there's a style profile
  await expectSelected('Best Match');
  await h.tapLabelPrefix('Women White Linen Shirt, ');
  await h.expectText('Live price from Flipkart');
  await h.audit('Item: overview');
  await h.shot('item');
  await h.tapLabel('Remove from wishlist');
  await h.expectLabel('Save to wishlist');
  await h.tapLabel('Save to wishlist');
  await h.expectLabel('Remove from wishlist');
  await h.tapExact('View on Flipkart');
  await expectOpened('https://dl.flipkart.com/dl/LIN1');

  await h.expectDialog(() => h.tapText('Log Purchase at ₹899'), /Purchase logged/);
  await h.expectText('Undo purchase');
  h.answerNextDialog('dismiss');
  await h.expectDialog(() => h.tapText('Undo purchase'), /Remove purchase\?/);
  await h.expectText('Undo purchase'); // cancelled: still logged
  await h.expectDialog(() => h.tapText('Undo purchase'), /Remove purchase\?/);
  await h.expectText('Log Purchase at ₹899');

  await h.tapExact('Price');
  await h.expectText('When to buy');
  await h.expectText('72% chance it gets at least 5% cheaper within 14 days.');
  await h.expectText('Typical lowest price over the next 14 days: ₹820');
  await h.expectText('"wait" was right 72% of 210 times');
  await h.expectText('Coupons & offers');
  await h.expectNoText('EXPIRED OFFER');
  await h.expectNoText('STALE OFFER');
  await h.audit('Item: price');
  await h.shot('when-to-buy');
  await h.type('Target price in INR', 'abc');
  await h.expectDialog(() => h.tapExact('Set Alert'), /Invalid price/);
  await h.type('Target price in INR', '950', { replace: true });
  await h.expectDialog(() => h.tapExact('Set Alert'), /must be below the current price/);
  await h.type('Target price in INR', '', { replace: true });
  await h.expectDialog(() => h.tapExact('Set Alert'), /Price alert set/); // empty = the suggested target
  await h.expectText('Alert set for ₹820 or less');
  await h.tapExact('Remove alert');
  await h.type('Target price in INR', '850');
  await h.expectDialog(() => h.tapExact('Set Alert'), /Price alert set/);
  await h.expectText('Alert set for ₹850 or less');
  await h.tapLabelPrefix('Flipkart: Min. 50% off');
  await expectOpened('https://dl.flipkart.com/dl/offers/western');
  for (const [label, url] of [
    ['Amazon', 'https://www.amazon.in/s?k='],
    ['eBay', 'https://www.ebay.com/sch/'],
    ['Google Shopping', 'https://www.google.co.in/search?tbm=shop'],
  ] as const) {
    await h.tapLabel(`Search ${label} for this item`);
    await expectOpened(url);
  }
  await h.tapExact('Style Fit');
  await h.expectText('Why This Matches Your Vibe');
  await h.expectText('Your vibe');
  await h.audit('Item: style fit');
  await h.tapExact('Overview');
  await h.expectText('About This Item');
  await h.tapExact('Style Fit');
  await scrollToBottom();
  await h.pause(400);
  await h.audit('Item: scrolled'); // the top bar fades in; still one back button
  await h.tapLabel('Go back');
  await h.expectText('Live prices from Flipkart');

  h.step = 'item-seasonal';
  await h.type('Search listings', 'Blazer');
  await h.tapLabelPrefix('Women Camel Wool Blazer, ');
  await h.tapExact('Price');
  await h.expectText('it was cheapest in October');
  await h.shot('seasonal');
  await h.tapLabel('Go back');
  await h.tapLabel('Clear search');

  h.step = 'item-store-offer';
  await h.type('Search listings', 'Roadster');
  await h.tapLabelPrefix('Roadster Women Black Slim Fit Jeans, ');
  await h.expectText("Price from Google Shopping's regular update");
  await h.tapExact('View at Myntra');
  await expectOpened('https://www.google.com/shopping/product/4887');
  await h.tapLabel('Go back');
  await h.tapLabel('Clear search');

  h.step = 'item-preowned';
  await h.type('Search listings', 'Trucker');
  await h.tapLabelPrefix("Levi's Vintage Trucker Denim Jacket, ");
  await h.expectText('≈ ₹');
  await h.expectText('Pre-owned');
  await h.expectDialog(() => h.tapText('Log Purchase at $42.50'), /Nice find/);
  await h.tapLabel('Go back');
  await h.tapLabel('Clear search');

  // ------------------------------------------------------------------ Deals
  h.step = 'deals';
  await h.tab('Deals');
  await h.expectText('Best Deals Right Now');
  await h.audit('Deals');
  await h.tapLabel('Marketplace: eBay');
  const ebayDeals = await cardLabels();
  if (ebayDeals.length !== 1 || !ebayDeals[0].startsWith("Levi's")) throw new Error(`eBay filter shows ${ebayDeals.join(' | ')}`);
  await h.tapLabel('Marketplace: All marketplaces');
  await h.tapLabelPrefix('Women White Linen Shirt, ');
  await h.expectText('Live price from Flipkart');
  await h.tapLabel('Go back');
  await h.expectText('When VibeVault said "wait"');

  await h.tapText('Coupons (2)');
  await h.expectText('MYNTRA10');
  await h.expectNoText('STALE OFFER');
  await h.expectNoText('EXPIRED OFFER');
  await h.audit('Deals: coupons');
  await h.shot('coupons');
  await h.tapLabelPrefix('Myntra: Flat 10% off');
  await h.expectText('Copied ✓');
  await expectOpened('https://linksredirect.com/myntra10');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  if (clipboard !== null && clipboard !== 'MYNTRA10') throw new Error(`Clipboard holds "${clipboard}", not the coupon code`);
  await h.tapLabelPrefix('Flipkart: Min. 50% off');
  await expectOpened('https://dl.flipkart.com/dl/offers/western');
  await h.tapExact('Top deals');
  await h.expectText('Best Deals Right Now');

  await h.tapText('Alerts (1)');
  await h.expectText('Now ₹899 → target ₹850');
  await h.audit('Deals: alerts');
  await h.tapLabel('Women White Linen Shirt alert');
  await h.expectText('Alert set for ₹850 or less');
  await h.tapLabel('Go back');
  await h.tapLabel('Delete alert for Women White Linen Shirt');
  await h.expectText('No price alerts yet');
  await h.audit('Deals: no alerts');
  await h.tapExact('Top deals');
  await h.expectText('Best Deals Right Now');

  // ------------------------------------------------------------------ Price-drop alerts
  h.step = 'alerts';
  await h.tab('Discover');
  await h.type('Search listings', 'Turtleneck');
  await h.tapLabelPrefix('Women Black Ribbed Turtleneck, ');
  await h.tapExact('Price');
  await h.type('Target price in INR', '700');
  await h.expectDialog(() => h.tapExact('Set Alert'), /Price alert set/);
  await h.tapLabel('Go back');
  await h.tapLabel('Clear search');
  // The price drops; the app's next refresh (prices older than 15 minutes) finds it.
  backend.setPrice('flipkart:IN:TRT1', 690);
  await h.shiftClock(20);
  h.answerNextDialog('dismiss'); // "Not now": the Deals tab keeps a badge
  await h.expectDialog(() => h.reload(), /Price drop alert/);
  await h.expectText('Target hit', 1000).then(
    () => {
      throw new Error('Dismissing the alert should not open the alerts list');
    },
    () => undefined,
  );
  const badge = await page.evaluate(() => [...document.querySelectorAll('a,[role="tab"],[role="button"]')].find((el) => (el as HTMLElement).innerText.includes('Deals') && el.getBoundingClientRect().top > window.innerHeight - 120)?.textContent ?? '');
  if (!/1/.test(badge)) throw new Error(`The Deals tab should show a badge for the hit alert, shows "${badge}"`);
  await h.tab('Deals');
  await h.tapText('Alerts (1)');
  await h.expectText('Target hit — ₹690');
  await h.audit('Deals: alert hit');
  await h.tab('Discover');
  await h.type('Search listings', 'Puff Sleeve');
  await h.tapLabelPrefix('Women Pink Puff Sleeve Blouse, ');
  await h.tapExact('Price');
  await h.type('Target price in INR', '950');
  await h.expectDialog(() => h.tapExact('Set Alert'), /Price alert set/);
  await h.tapLabel('Go back');
  await h.tapLabel('Clear search');
  backend.setPrice('flipkart:IN:BLS1', 900);
  await h.shiftClock(40);
  await h.expectDialog(() => h.reload(), /Price drop alert/); // "View" opens the alerts list
  await h.expectText('Target hit — ₹900');

  // ------------------------------------------------------------------ Wishlist
  h.step = 'wishlist';
  await h.tab('Profile');
  await h.tapText('Wishlist (1)');
  await h.expectText('❤️ Wishlist');
  await h.audit('Wishlist');
  await h.tapLabelPrefix('Women White Linen Shirt, ');
  await h.expectText('Live price from Flipkart');
  await h.tapLabel('Go back');
  await h.tapLabel('Go back');
  await h.expectText('Shopping Settings');
  await h.tapText('Wishlist (1)');
  await h.tapLabel('Remove Women White Linen Shirt from wishlist');
  await h.expectText('No saved items yet');
  await h.audit('Wishlist: empty');
  await h.tapText('Browse Discover');
  await h.expectText('Live prices from Flipkart');

  // ------------------------------------------------------------------ Quests
  h.step = 'quests';
  await h.tab('Quests');
  await h.expectText('Style Quests');
  await h.audit('Quests');
  for (const filter of ['🆕 New', '⏳ Active', '✅ Done', '📋 All']) {
    await h.tapExact(filter);
    await expectSelected(filter);
  }
  await h.tapLabelPrefix('Budget Detective, ');
  await h.expectText('Quest Details');
  await h.audit('Quest detail');
  await h.tapText('Open Deal Detector');
  await h.expectText('Price Alerts');
  await h.tab('Quests');
  await h.expectText('Budget Detective');
  await h.expectDialog(() => h.tapText('Start Quest'), /Quest started/);
  for (let stepNo = 1; stepNo <= 4; stepNo++) await h.tapText(`Done: step ${stepNo} of 5`);
  await h.expectDialog(() => h.tapText('Done: step 5 of 5'), /Quest complete!.*Deal Detective/);
  await h.expectText('Quest Completed!');
  await h.tapLabel('Go back');
  await h.tapExact('✅ Done');
  await h.expectText('Budget Detective');
  await h.tapExact('📋 All');
  await h.tapLabelPrefix('Build Your Vibe Board, ');
  await h.tapText('Open the Stylist');
  await h.expectText('Your Stylist');
  await h.tab('Quests');
  await h.tapLabel('Go back');
  await h.tapLabelPrefix('Hidden Gems Explorer, ');
  await h.tapText('Find thrift stores near me');
  await expectOpened('https://www.google.com/maps/search/');
  await h.tapLabel('Go back');

  // ------------------------------------------------------------------ Profile
  h.step = 'profile';
  await h.tab('Profile');
  // The Profile tab is still showing the (now empty) Wishlist from earlier.
  await h.expectText('No saved items yet');
  await h.tapLabel('Go back');
  await h.expectText('Shopping Settings');
  await h.audit('Profile');
  await h.shot('profile');
  await h.tapLabelPrefix('Display name ');
  await h.expectText('Display name');
  await h.audit('Profile: name editor');
  await h.type('Display name', '', { replace: true });
  await h.expectDialog(() => h.tapExact('Save'), /Name required/);
  await h.type('Display name', 'Asha Test');
  await h.tapExact('Save');
  await h.expectText('Asha Test');
  await h.tapLabelPrefix('Display name ');
  await h.type('Display name', 'Someone Else', { replace: true });
  await h.tapExact('Cancel');
  await h.expectText('Asha Test');
  await h.expectNoText('Someone Else');

  await h.tapExact('Country');
  await h.expectText('Where do you shop?');
  await h.audit('Profile: country picker');
  await h.tapExact(`${flag('US')} United States`);
  await h.expectText(`${flag('US')} United States ›`);
  await h.tab('Discover');
  await h.expectText('No live listings for United States yet');
  await h.audit('Discover: no listings for the country');
  await h.tapExact('Refresh');
  await h.expectText('No live listings for United States yet');
  await h.tab('Profile');
  await h.tapExact('Country');
  await h.tapExact(`${flag('IN')} India`);
  await h.tab('Discover');
  await h.expectText(countText(womenAndUnisex));
  await h.tab('Profile');

  await h.tapExact('Currency for totals & budget');
  await h.expectText('Currency');
  await h.tapExact('Close');
  await h.expectText('INR ›');
  await h.tapExact('Currency for totals & budget');
  await h.tapExact('USD');
  await h.expectText('USD ›');
  await h.tapExact('Currency for totals & budget');
  await h.tapExact('INR');
  await h.expectText('INR ›');

  await h.tapExact("Men's");
  await h.tab('Discover');
  await h.expectText(countText(rows.filter((r) => r.department !== 'women').length));
  await h.tab('Profile');
  await h.tapExact('Both');
  await h.tab('Discover');
  await h.expectText(countText(total));
  await h.tab('Profile');
  await h.tapExact("Women's");

  await h.tapText("Levi's Vintage Trucker Denim Jacket");
  await h.expectText('Logged on');
  await h.tapLabel('Go back');
  await h.expectDialog(() => h.tapLabelPrefix('First Find, common, earned'), /First Find/);
  await h.expectDialog(() => h.tapLabelPrefix('Price Prophet, epic, earned'), /Price Prophet/);

  h.answerNextDialog('dismiss');
  await h.expectDialog(() => h.tapText('Reset all data'), /Reset all data\?/);
  await h.expectText('Asha Test'); // cancelled
  await h.expectDialog(() => h.tapText('Reset all data'), /Reset all data\?/);
  await h.pause(300);
  await h.expectNoText('Asha Test');
  await h.tab('My Vibe');
  await h.expectText('Where do you shop?');
  await h.tab('Stylist');
  await h.tapText('Take the Style Profiler so looks follow your style');
  await h.expectText('Where do you shop?');

  // ------------------------------------------------------------------ Offline
  h.step = 'offline';
  h.allowNetworkErrors = true;
  await h.tab('Discover');
  backend.setOffline(true);
  await h.shiftClock(80); // cached prices are now stale, so the app tries the server
  await h.reload();
  await h.expectText('Offline — showing prices saved');
  await h.audit('Discover: offline');
  backend.setOffline(false);
  await h.tapText('Tap to retry');
  await h.expectText('Live prices from Flipkart');

  await page.evaluate(() => localStorage.clear());
  backend.setOffline(true);
  await h.reload();
  await h.expectText('Couldn’t load live prices');
  await h.audit('Discover: offline, nothing saved');
  backend.setOffline(false);
  await h.tapExact('Try again');
  await h.expectText(countText(total));
  h.allowNetworkErrors = false;

  // ------------------------------------------------------------------ Small and large screens
  for (const [name, width, height] of [
    ['small phone', 320, 568],
    ['tablet', 820, 1180],
  ] as const) {
    h.step = name;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await h.reload();
    await h.expectText(countText(total));
    await h.audit(`Discover (${name})`);
    await h.shot(`discover-${name.replace(' ', '-')}`);
    await h.tapLabelPrefix('Women White Linen Shirt, ');
    await h.expectText('View on Flipkart');
    await h.audit(`Item (${name})`);
    await h.shot(`item-${name.replace(' ', '-')}`);
    await h.tapLabel('Go back');
    for (const tab of ['My Vibe', 'Stylist', 'Deals', 'Quests', 'Profile']) {
      await h.tab(tab);
      await h.audit(`${tab} (${name})`);
    }
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
}
