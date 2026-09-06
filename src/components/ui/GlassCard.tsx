import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { radius } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 更实的表面（用于列表行等需要可读性的位置） */
  strong?: boolean;
  /** 关闭内边距，由调用方控制 */
  noPadding?: boolean;
}

/**
 * Glass Card（4.3 通用组件）：
 * 轻背景、弱边界、无重阴影；夜晚自动切换深色玻璃（Night ≠ Dark Theme）。
 */
export const GlassCard: React.FC<GlassCardProps> = ({ children, style, strong, noPadding }) => {
  const { profile } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: strong ? profile.surface.glassStrong : profile.surface.glass,
          borderColor: profile.surface.glassBorder,
        },
        !noPadding && styles.padding,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.m,
    borderWidth: 1,
  },
  padding: {
    padding: 16,
  },
});
