// ============================================================
// VibeVault – Style Profiler questions
// Personality questions measure six clothing-related traits
// (see services/styleEngine.ts for how each answer counts); the
// rest ask directly about colours, fit, occasions and budget, and
// the taste check asks about real listings.
// ============================================================

import { ProfileQuestion } from '../types';

/** Bumped when the questions change, so older profiles are asked to update. */
export const PROFILER_VERSION = 2;

export const QUESTION_IDS = {
  country: 'country',
  shopFor: 'shop_for',
  social: 'social',
  trends: 'trends',
  routine: 'routine',
  compliment: 'compliment',
  rules: 'rules',
  freeDay: 'free_day',
  colorsLove: 'colors_love',
  colorsAvoid: 'colors_avoid',
  fit: 'fit',
  occasions: 'occasions',
  budget: 'budget',
  sustainability: 'sustainability',
  taste: 'taste',
} as const;

export const DEFAULT_SUSTAINABILITY_ANSWER = 50;
/** Real listings shown in the taste check. */
export const TASTE_CHECK_SIZE = 8;

export const PROFILER_QUESTIONS: ProfileQuestion[] = [
  {
    id: QUESTION_IDS.country,
    question: 'Where do you shop?',
    help: 'You’ll see prices from marketplaces that sell to this country, converted to its currency.',
    type: 'country',
  },
  {
    id: QUESTION_IDS.shopFor,
    question: 'Which sections should we style you from?',
    type: 'single',
    options: [
      { label: "👗 Women's", value: 'women' },
      { label: "👔 Men's", value: 'men' },
      { label: '✨ Both', value: 'all' },
    ],
  },
  {
    id: QUESTION_IDS.social,
    question: 'At a party, you are usually…',
    type: 'single',
    options: [
      { label: '🎉 In the middle of everything', value: 'center' },
      { label: '💬 Deep in a chat with a few people', value: 'small-group' },
      { label: '🏡 The one who made everyone feel welcome', value: 'host' },
      { label: '👀 Quietly people-watching', value: 'observer' },
    ],
  },
  {
    id: QUESTION_IDS.trends,
    question: 'A new trend is everywhere. You…',
    type: 'single',
    options: [
      { label: '🚀 Were wearing it before it blew up', value: 'first' },
      { label: '🔀 Try it your own way', value: 'adapt' },
      { label: '⏳ Wait to see if it lasts', value: 'wait' },
      { label: '🙅 Stick with what you know works', value: 'never' },
    ],
  },
  {
    id: QUESTION_IDS.routine,
    question: 'Getting ready in the morning is…',
    type: 'single',
    options: [
      { label: '📋 Planned the night before', value: 'planned' },
      { label: '🙂 Quick — I have my go-tos', value: 'go-tos' },
      { label: '🎨 Different every day, depending on my mood', value: 'mood' },
      { label: '😴 Whatever is comfy and clean', value: 'comfy' },
    ],
  },
  {
    id: QUESTION_IDS.compliment,
    question: 'Which compliment would make your day?',
    type: 'single',
    options: [
      { label: '✨ “You always look so put-together”', value: 'put-together' },
      { label: '🦄 “Nobody dresses like you”', value: 'unique' },
      { label: '😎 “You look effortlessly cool”', value: 'cool' },
      { label: '🌸 “You look so warm and lovely”', value: 'warm' },
      { label: '☁️ “You look so relaxed and comfy”', value: 'comfy' },
    ],
  },
  {
    id: QUESTION_IDS.rules,
    question: 'Dress codes are…',
    type: 'single',
    options: [
      { label: '👍 Helpful — I like knowing what fits in', value: 'helpful' },
      { label: '🤷 Fine, I follow them', value: 'fine' },
      { label: '✂️ Meant to be bent a little', value: 'bend' },
      { label: '🔥 Made to be broken', value: 'break' },
    ],
  },
  {
    id: QUESTION_IDS.freeDay,
    question: 'Your perfect free day?',
    type: 'single',
    options: [
      { label: '🏋️ Workout, then brunch', value: 'active' },
      { label: '📚 A café, a book, an old bookshop', value: 'cafe' },
      { label: '🎤 A gig or the city at night', value: 'city' },
      { label: '🌿 Somewhere green, outdoors', value: 'nature' },
      { label: '🖼️ A gallery or a design market', value: 'gallery' },
      { label: '🛍️ Digging through thrift shops', value: 'thrift' },
    ],
  },
  {
    id: QUESTION_IDS.colorsLove,
    question: 'Which colours do you love wearing?',
    help: 'Pick as many as you like.',
    type: 'colors',
  },
  {
    id: QUESTION_IDS.colorsAvoid,
    question: 'Any colours you never wear?',
    help: 'Optional — we’ll keep these out of your outfits.',
    type: 'colors',
    optional: true,
  },
  {
    id: QUESTION_IDS.fit,
    question: 'How do you like your clothes to fit?',
    type: 'single',
    options: [
      { label: '📐 Fitted / slim', value: 'fitted' },
      { label: '👕 Regular', value: 'regular' },
      { label: '🌊 Relaxed', value: 'relaxed' },
      { label: '🧥 Oversized', value: 'oversized' },
    ],
  },
  {
    id: QUESTION_IDS.occasions,
    question: 'What do you dress for most?',
    help: 'Pick all that apply.',
    type: 'multi',
    options: [
      { label: '💼 Work & office', value: 'work' },
      { label: '🎒 Everyday & college', value: 'everyday' },
      { label: '🌙 Nights out & dates', value: 'evening' },
      { label: '🪔 Festive & weddings', value: 'festive' },
      { label: '🏃 Gym & sport', value: 'active' },
      { label: '🥾 Travel & outdoors', value: 'outdoors' },
    ],
  },
  {
    id: QUESTION_IDS.budget,
    question: 'What do you usually spend on one piece, at most?',
    help: 'Suggestions come from today’s live prices in your country.',
    type: 'budget',
  },
  {
    id: QUESTION_IDS.sustainability,
    question: 'How much do you prefer pre-owned pieces?',
    type: 'slider',
    min: 0,
    max: 100,
    step: 25,
    minLabel: 'No preference',
    maxLabel: 'Strongly',
  },
  {
    id: QUESTION_IDS.taste,
    question: 'Would you wear these?',
    help: 'Real listings from your marketplaces. Your answers teach your profile what you actually like.',
    type: 'taste',
  },
];
