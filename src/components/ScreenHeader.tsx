import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';

/**
 * Top Navigation V1 · FROZEN（design/system/components/top_navigation）。
 *
 * - 默认 BACK_TITLE / BACK_TITLE_ACTIONS：内容最小高 56dp、水平外边距 8dp、
 *   Back 44×44dp 命中区 + 22dp 圆角轮廓箭头、Back→标题 8dp、
 *   标题 20sp·Medium 500·行高 26sp·DeepLakeBlue·左对齐·单行省略；
 *   右侧 Utility 动作 44dp 命中区、22dp 图标，透明容器、无分割线。
 * - titleOnly（TITLE_ONLY，根级页）：最小高 64dp、水平内边距 16dp、
 *   标题 28sp·Medium 500·行高 34sp·左对齐。
 * - 图标按压遵循 Icon Action V1：无缩放/旋转/弹跳，仅色调变化（90ms），
 *   ON_LIGHT 按下变 Deep Lake Teal #0F7A78。
 * - 状态栏 inset 由本组件统一处理（宿主页可再叠加 style）。
 */

export const HEADER_HIT = 44; // Icon Action V1：最小触控目标 44×44dp
export const HEADER_ICON = 22; // NAVIGATION Back glyph 22dp
export const HEADER_ACTION_ICON = 22; // UTILITY glyph 20-22dp

/** Icon Action V1 / ON_LIGHT */
const GLYPH_DEFAULT = 'rgba(11,45,75,0.88)';
const GLYPH_PRESSED = '#0F7A78';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  /** 右侧 Utility 动作区（Icon Action V1 / UTILITY，1-2 个） */
  right?: React.ReactNode;
  /** TITLE_ONLY 根级页变体（28sp 标题、无 Back） */
  titleOnly?: boolean;
  /** ON_MEDIA 表面上的色调覆写（默认 ON_LIGHT DeepLakeBlue） */
  titleColor?: string;
  backColor?: string;
  style?: ViewStyle;
}

export function ScreenHeader({
  title,
  onBack,
  right,
  titleOnly = false,
  titleColor,
  backColor,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const titleTone = titleColor ?? coreColors.deepLakeBlue;
  /* 运行时为单栈导航：根级页（TITLE_ONLY 排印档）保留 Back 以便返回；
     Top Navigation V1 的几何/排印仍按冻结合同执行 */
  const hasBack = Boolean(onBack);

  return (
    <View
      style={[
        styles.bar,
        titleOnly && styles.barTitleOnly,
        { paddingTop: insets.top + 8, paddingBottom: 8 },
        style,
      ]}>
      {hasBack ? <BackButton onPress={onBack!} color={backColor ?? titleTone} /> : null}
      <View style={[styles.titleBlock, hasBack && styles.titleBlockAfterBack]}>
        {!!title && (
          <Text
            style={[
              titleOnly ? styles.titleOnlyText : styles.title,
              { color: titleTone },
            ]}
            numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** Back：Icon Action V1 / NAVIGATION —— 44dp 目标、22dp glyph、按压仅变色 */
function BackButton({ onPress, color }: { onPress: () => void; color: string }) {
  const [pressed, setPressed] = useState(false);
  const tone = pressed ? GLYPH_PRESSED : color;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel="返回"
      style={styles.hit}>
      <Ionicons name="chevron-back" size={HEADER_ICON} color={tone} />
    </Pressable>
  );
}

/** 右侧图标按钮：44dp 命中区 + 22dp glyph，按压仅变色（无缩放） */
export function HeaderIconButton({
  name,
  onPress,
  color,
  disabled,
}: {
  name: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const tone = disabled
    ? 'rgba(116,136,151,0.38)'
    : pressed
      ? GLYPH_PRESSED
      : (color ?? GLYPH_DEFAULT);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={styles.hit}>
      <Ionicons name={name} size={HEADER_ACTION_ICON} color={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* BACK_TITLE(_ACTIONS)：min 56dp、外边距 8dp、透明底、无分割线 */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 56,
  } as ViewStyle,
  /* TITLE_ONLY：min 64dp、内边距 16dp、无 Back/无预留槽位 */
  barTitleOnly: {
    paddingHorizontal: 16,
    minHeight: 64,
  } as ViewStyle,
  hit: {
    width: HEADER_HIT,
    height: HEADER_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  /* 标题占据剩余宽度，左对齐；Back→标题 8dp，标题→动作区 ≥8dp */
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
  } as ViewStyle,
  titleBlockAfterBack: {
    marginLeft: 8,
  } as ViewStyle,
  title: {
    fontSize: fs(20),
    lineHeight: fs(26),
    fontWeight: '500',
  } as TextStyle,
  titleOnlyText: {
    fontSize: fs(28),
    lineHeight: fs(34),
    fontWeight: '500',
  } as TextStyle,
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  } as ViewStyle,
});
