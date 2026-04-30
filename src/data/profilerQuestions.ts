// ============================================================
// VibeVault – Style Profiler Questions
// ============================================================

import { ProfileQuestion } from '../types';

export const PROFILER_QUESTIONS: ProfileQuestion[] = [
  {
    id: 'q1_personality',
    question: 'How would you describe your social energy?',
    type: 'single',
    options: [
      { label: '🏠 Homebody – I recharge alone', value: 'introvert' },
      { label: '🎉 Social Butterfly – I thrive in crowds', value: 'extrovert' },
      { label: '⚖️ Balanced – Depends on my mood', value: 'creative' },
    ],
  },
  {
    id: 'q2_thinking',
    question: 'When making decisions, you tend to rely on…',
    type: 'single',
    options: [
      { label: '📊 Logic & data', value: 'analytical' },
      { label: '🎨 Gut feeling & creativity', value: 'creative' },
      { label: '📖 Traditions & proven ways', value: 'traditional' },
      { label: '🚀 Innovation & experimentation', value: 'avant-garde' },
    ],
  },
  {
    id: 'q3_music',
    question: 'Select all music genres you enjoy:',
    type: 'multi',
    options: [
      { label: '🎵 Pop', value: 'pop' },
      { label: '🎸 Rock', value: 'rock' },
      { label: '🎤 Hip-Hop', value: 'hip-hop' },
      { label: '🎷 Jazz', value: 'jazz' },
      { label: '🎹 Electronic', value: 'electronic' },
      { label: '🎻 Classical', value: 'classical' },
      { label: '🌿 Indie', value: 'indie' },
      { label: '🎶 R&B', value: 'r&b' },
    ],
  },
  {
    id: 'q4_media',
    question: 'Your go-to movie/show genres:',
    type: 'multi',
    options: [
      { label: '💥 Action', value: 'action' },
      { label: '💕 Romance', value: 'romance' },
      { label: '🚀 Sci-Fi', value: 'sci-fi' },
      { label: '📹 Documentary', value: 'documentary' },
      { label: '🌸 Anime', value: 'anime' },
      { label: '😂 Comedy', value: 'comedy' },
      { label: '🔪 Thriller', value: 'thriller' },
    ],
  },
  {
    id: 'q5_color',
    question: 'Which color palette speaks to you?',
    type: 'single',
    options: [
      { label: '⬛ Monochrome & neutrals', value: 'minimalist' },
      { label: '🌈 Bold & vibrant', value: 'streetwear' },
      { label: '🌅 Earth tones & warm', value: 'bohemian' },
      { label: '🍂 Muted & vintage', value: 'vintage' },
      { label: '🖤 Dark & moody', value: 'dark-academia' },
      { label: '💜 Pastels & soft', value: 'cottagecore' },
    ],
  },
  {
    id: 'q6_weekend',
    question: 'Your ideal weekend activity?',
    type: 'single',
    options: [
      { label: '📚 Reading at a café', value: 'dark-academia' },
      { label: '🛹 Skating or street art', value: 'streetwear' },
      { label: '🥾 Nature hike', value: 'cottagecore' },
      { label: '🏋️ Gym or sports', value: 'athleisure' },
      { label: '🎨 Art gallery or museum', value: 'avant-garde' },
      { label: '🛍️ Thrift shopping', value: 'vintage' },
    ],
  },
  {
    id: 'q7_sustainability',
    question: 'How important is sustainability to you?',
    type: 'slider',
    min: 0,
    max: 100,
  },
  {
    id: 'q8_budget',
    question: 'Your typical clothing budget per item?',
    type: 'single',
    options: [
      { label: '💰 Under $10', value: 'budget-low' },
      { label: '💵 $10 – $30', value: 'budget-mid' },
      { label: '💳 $30 – $60', value: 'budget-high' },
      { label: '💎 $60+', value: 'budget-premium' },
    ],
  },
];
