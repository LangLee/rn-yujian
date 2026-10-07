import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { coreGlass, coreRadius } from '../../constants/coreUi';

interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 更实的表面（GLASS_A 主内容面；默认 GLASS_B 次级面） */
  strong?: boolean;
  /** 关闭内边距，由调用方控制 */
  noPadding?: boolean;
}

/**
 * Glass Card（glass_tokens.json：仅 A/B/C 三级）。
 * strong → GLASS_A（主内容）；默认 → GLASS_B（故事/次级统计）。
 * 圆角用共享 R_LG 内容卡档；玻璃服务于可读性，不成为主角。
 */
export const GlassCard: React.FC<GlassCardProps> = ({ children, style, strong, noPadding }) => {
  const glass = strong ? coreGlass.A : coreGlass.B;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: glass.bg,
          borderColor: glass.border,
          shadowColor: glass.shadow,
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
    borderRadius: coreRadius.lg,
    borderWidth: 1,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  padding: {
    padding: 16,
  },
});
