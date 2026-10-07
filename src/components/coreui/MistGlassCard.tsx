import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { GlassLevel, coreGlass, coreRadius } from '../../constants/coreUi';

/**
 * MistGlassCard —— 玻璃容器（glass_tokens.json）。
 *
 * 只允许 level=A/B/C 三级，内部读取 Token；
 * 页面不得直接传任意 alpha/radius 自造“页面私有毛玻璃”。
 *  - A：主内容、识别信息、主要记忆卡（white 0.72-0.80）
 *  - B：故事、次级统计、辅助信息（white 0.55-0.68）
 *  - C：overlay / pill、Hero 轻量文字保护
 * Glass 的目标是可读性与空气感，而不是展示毛玻璃特效。
 */

interface MistGlassCardProps {
  level?: GlassLevel;
  /** 圆角（默认 R_LG 内容卡；Hero 用 coreRadius.xl） */
  radius?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const MistGlassCard: React.FC<MistGlassCardProps> = ({
  level = 'A',
  radius = coreRadius.lg,
  padding = 0,
  style,
  children,
}) => {
  const glass = coreGlass[level];
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: glass.bg,
          borderColor: glass.border,
          borderRadius: radius,
          shadowColor: glass.shadow === 'transparent' ? 'transparent' : glass.shadow,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  } as ViewStyle,
});
