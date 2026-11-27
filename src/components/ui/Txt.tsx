// ============================================================
// VibeVault – Text with the app's type scale
// ============================================================

import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { Type } from '../../constants/theme';

export type TextVariant = keyof typeof Type;

interface TxtProps extends TextProps {
  v?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

export default function Txt({ v = 'body', color, align, style, ...rest }: TxtProps) {
  return <Text {...rest} style={[Type[v], color ? { color } : null, align ? { textAlign: align } : null, style]} />;
}
