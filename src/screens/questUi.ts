// ============================================================
// VibeVault – Shared quest presentation constants
// ============================================================

import { Colors } from '../constants/theme';
import { QuestDifficulty, QuestType } from '../types';

export const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  Easy: Colors.buy,
  Medium: Colors.wait,
  Hard: Colors.offer,
  Epic: Colors.ink,
};

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  'mood-board': 'Mood board',
  'styling-challenge': 'Styling',
  'thrift-hunt': 'Thrift hunt',
  sustainability: 'Sustainability',
  community: 'Community',
};
