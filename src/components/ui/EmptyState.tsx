import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { radius, spacing, typeScale } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { FishGlyph } from './FishGlyph';
import { PrimaryButton } from './PrimaryButton';
import { EmptyIllustration, EmptyStateVariant } from './EmptyIllustration';

export type { EmptyStateVariant };

interface EmptyStateProps {
  title: string;
  description?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** 次操作：主按钮下方的轻量文字按钮 */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** 按钮下方的注脚小字（如「这张照片还在，不会丢失」） */
  footnote?: string | null;
  /** 场景图案；设置后图案与文案、操作融合为一张柔和大卡片 */
  variant?: EmptyStateVariant;
  /** 自定义图形；默认低对比小鱼 Glyph（17.20：空状态默认静态） */
  icon?: React.ReactNode;
  /** 图案模式卡片宽度，默认 328 */
  cardWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * 空状态（14 空状态系统）：空状态不是错误，是在给下一段钓鱼记忆留位置。
 * 文案使用「还没有 / 会收藏在这里 / 留下 / 遇见」语气。
 * 图案模式：核心图案为 new001 水彩贴纸插画（透明底 PNG，固定配色），
 * 叠在跟随主题的玻璃卡片上，与水景背景协调。
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  footnote,
  variant,
  icon,
  cardWidth = 328,
  style,
}) => {
  const { profile } = useTheme();

  const content = (
    <>
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
          variant="secondaryMuted"
          // 相机图标只用于拍照类操作，清空/返回等操作保持纯文字
          icon={actionLabel.includes('拍照') ? 'camera' : undefined}
          style={styles.action}
        />
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable onPress={onSecondaryAction} hitSlop={8} style={styles.secondaryAction}>
          <Text style={[styles.secondaryActionLabel, { color: profile.surface.accent }]}>
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}
      {footnote ? (
        <Text style={[styles.footnote, { color: profile.surface.textSecondary }]}>{footnote}</Text>
      ) : null}
    </>
  );

  if (variant) {
    return (
      <View style={[styles.outer, style]}>
        <View
          style={[
            styles.card,
            // styles.cardShadow,
            {
              width: cardWidth,
              maxWidth: '100%',
              // 跟随主题的玻璃实表面（浅色 0.78-0.82 / 夜晚 0.74），透出水景背景
              backgroundColor: profile.surface.glassStrong,
              borderColor: profile.surface.glassBorder,
            },
          ]}
        >
          <View style={styles.artWrap}>
            <EmptyIllustration variant={variant} />
          </View>
          {content}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconWrap, { backgroundColor: profile.surface.accentSoft }]}>
        {icon ?? <FishGlyph size={34} color={profile.surface.accent} opacity={0.85} />}
      </View>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
  } as ViewStyle,
  outer: {
    alignSelf: 'stretch',
    alignItems: 'center',
  } as ViewStyle,
  /** 图案融合大卡片 */
  card: {
    borderRadius: radius.l,
    borderWidth: 1,
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  } as ViewStyle,
  cardShadow: {
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  } as ViewStyle,
  /** 核心图案区：透明底水彩 PNG */
  artWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
    // 显式宽度：minWidth + PressableScale 内层 width:'100%' 会形成百分比循环，
    // 宽度解析塌缩成圆形按钮；固定 200pt 保证长条胶囊且整体居中
    width: 200,
  } as ViewStyle,
  /** 次操作：主按钮下方的轻量文字按钮 */
  secondaryAction: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  } as ViewStyle,
  secondaryActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  } as TextStyle,
  footnote: {
    marginTop: spacing.md,
    fontSize: typeScale.caption,
    lineHeight: 18,
    textAlign: 'center',
  } as TextStyle,
});
