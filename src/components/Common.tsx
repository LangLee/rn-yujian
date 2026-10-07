import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { palette } from '../constants/colors';
import { fs } from '../constants/tokens';

interface TagChipProps {
  text: string;
  emphasized?: boolean;
  style?: ViewStyle;
}

/** 标签 Chip（Core Visual System V1 色板：分类强调用 Deep Lake Teal 弱面）。 */
export const TagChip: React.FC<TagChipProps> = ({ text, emphasized = false, style }) => (
  <View
    style={[
      styles.chip,
      { backgroundColor: emphasized ? palette.softWater : palette.cardWhite },
      style,
    ]}
  >
    <Text style={emphasized ? styles.chipTextEmphasized : styles.chipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  chip: {
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 8,
  } as ViewStyle,
  chipText: {
    color: palette.deepInk,
    fontSize: fs(12),
    fontWeight: '500',
  } as TextStyle,
  chipTextEmphasized: {
    color: palette.waterTeal,
    fontSize: fs(12),
    fontWeight: '600',
  } as TextStyle,
});
