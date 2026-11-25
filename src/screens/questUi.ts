// ============================================================
// VibeVault – Shared quest presentation constants
// ============================================================

import { Colors } from '../constants/theme';
import { QuestDifficulty, QuestType } from '../types';

export const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  Easy: Colors.success,
  Medium: Colors.warning,
  Hard: Colors.accent,
  Epic: Colors.primaryLight,
};

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  'mood-board': '🎨 Mood Board',
  'styling-challenge': '👗 Styling',
  'thrift-hunt': '🗺️ Thrift Hunt',
  sustainability: '🌿 Eco',
  community: '🤝 Community',
};
