import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from './ui';
import { font, spacing } from '../constants/tokens';
import { useTheme } from '../contexts/ThemeContext';

export const HEADER_HIT = 40; // 统一的左右按钮命中区尺寸
export const HEADER_ICON = 24; // 统一的返回图标字号
export const HEADER_ACTION_ICON = 21; // 统一的右侧操作图标字号

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  /** 右侧操作区：传入按钮节点，未传时渲染占位以保证标题居中 */
  right?: React.ReactNode;
  titleColor?: string;
  subtitleColor?: string;
  backColor?: string;
  style?: ViewStyle;
}

/** 全应用统一的页面顶部栏：返回键 + 居中标题 + 右侧操作 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  titleColor,
  subtitleColor,
  backColor,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useTheme();

  const tintColor = backColor ?? titleColor ?? profile.surface.textPrimary;
  const sub = subtitleColor ?? profile.surface.textSecondary;

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm },
        style,
      ]}>
      {onBack ? (
        <PressableScale onPress={onBack} scaleTo={0.9} style={styles.hit} accessibilityLabel="返回">
          <Ionicons name="chevron-back" size={HEADER_ICON} color={tintColor} />
        </PressableScale>
      ) : (
        <View style={styles.hit} />
      )}
      <View style={styles.titleBlock}>
        {!!title && (
          <Text style={[styles.title, { color: titleColor ?? profile.surface.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
        )}
        {!!subtitle && <Text style={[styles.subtitle, { color: sub }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={styles.right}>{right ?? null}</View>
    </View>
  );
}

/** 右侧图标按钮：与返回按钮同尺寸命中区，保证对齐 */
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
  const { profile } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.9} style={styles.hit} disabled={disabled} accessibilityLabel={name}>
      <Ionicons name={name} size={HEADER_ACTION_ICON} color={color ?? profile.surface.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    minHeight: HEADER_HIT,
  },
  hit: {
    width: HEADER_HIT,
    height: HEADER_HIT,
    borderRadius: HEADER_HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: HEADER_HIT,
    minHeight: HEADER_HIT,
    gap: spacing.xs,
  },
});
