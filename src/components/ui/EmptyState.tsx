import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle, StyleProp } from 'react-native';
import { radius, spacing } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { FishGlyph } from './FishGlyph';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  title: string;
  description?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** 自定义图形；默认低对比小鱼 Glyph（17.20：空状态默认静态） */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * 空状态（14 空状态系统）：空状态不是错误，是在给下一段钓鱼记忆留位置。
 * 文案使用「还没有 / 会收藏在这里 / 留下 / 遇见」语气。
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  style,
}) => {
  const { profile } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: profile.surface.accentSoft },
        ]}
      >
        {icon ?? <FishGlyph size={34} color={profile.surface.accent} opacity={0.85} />}
      </View>
      <Text style={[styles.title, { color: profile.surface.textPrimary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: profile.surface.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          variant="ghost"
          style={styles.action}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
  } as ViewStyle,
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  } as ViewStyle,
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  } as TextStyle,
  description: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.sm,
  } as TextStyle,
  action: {
    marginTop: spacing.lg,
    minWidth: 160,
  } as ViewStyle,
});
