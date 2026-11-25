// ============================================================
// VibeVault – Navigation ref for navigating outside screens
// ============================================================

import { createNavigationContainerRef } from '@react-navigation/native';
import { RootTabParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootTabParamList>();
