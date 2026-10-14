import React from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { AppIcon, AppIconName } from '../icons/AppIcon';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import { PressableScale } from './PressableScale';

/**
 * 账号与隐私 · 共享设置表面（Mist Glass / settings surface authority）。
 *
 * 冻结稿构图：白色大圆角卡片承载分组行；行为「可选圆角方形图标块 +
 * 单一清晰标签 + 右侧值/状态/开关/箭头」，最小 44dp 触控目标；
 * 分组小标题为安静辅助层级，不作卡片标题
 * （My_Page_Spec_V2 §6 / Data_Privacy_Home_Spec_V1 §3）。
 */

/** 行图标块色板（数据与隐私冻结稿：每行柔和底色圆角方块） */
export const ROW_ICON_TINTS = {
  teal: { bg: 'rgba(15,122,120,0.12)', fg: '#0F7A78' },
  blue: { bg: 'rgba(59,110,158,0.12)', fg: '#3B6E9E' },
  green: { bg: 'rgba(93,140,102,0.14)', fg: '#5D8C66' },
  amber: { bg: 'rgba(214,165,65,0.16)', fg: '#B08430' },
  slate: { bg: 'rgba(116,136,151,0.14)', fg: '#748897' },
  red: { bg: 'rgba(194,91,78,0.12)', fg: '#C25B4E' },
} as const;

export type RowIconTint = keyof typeof ROW_ICON_TINTS;

/** 分组小标题（安静的辅助层级） */
export const SettingsGroupLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text style={styles.groupLabel}>{label}</Text>
);

/** 白色设置卡（分组容器；行间用 RowDivider 分隔） */
export const SettingsCard: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({
  children,
  style,
}) => <View style={[styles.card, style]}>{children}</View>;

/** 行分隔线：与文字左对齐（有图标块时与标签对齐） */
export const RowDivider: React.FC<{ indent?: number }> = ({ indent = 0 }) => (
  <View style={[styles.divider, { marginLeft: indent }]} />
);

interface SettingsRowProps {
  /** 图标语义名（icon_library_v0_1） */
  icon?: AppIconName;
  tint?: RowIconTint;
  label: string;
  /** 行内说明（仅必要处克制使用） */
  description?: string;
  /** 右侧状态/值文案（如 使用期间 / 读取中… / yujian_2025） */
  value?: string;
  /** 右侧「即将推出」等弱徽标（Deferred 行） */
  badge?: string;
  /** 右侧开关（AI 模型改进等；显示开关时右侧不渲染箭头） */
  switchValue?: boolean;
  switchDisabled?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  /** 危险语气（退出当前账号：低强调红色文字行） */
  danger?: boolean;
  /** 隐藏右侧箭头（如不可进入的信息型行） */
  hideChevron?: boolean;
  /** 无障碍标签覆写 */
  accessibilityLabel?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  tint = 'teal',
  label,
  description,
  value,
  badge,
  switchValue,
  switchDisabled,
  onSwitchChange,
  onPress,
  disabled,
  danger = false,
  hideChevron,
  accessibilityLabel,
}) => {
  const tintSpec = ROW_ICON_TINTS[tint];
  const hasSwitch = switchValue !== undefined;
  const interactive = Boolean(onPress) && !disabled;

  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: tintSpec.bg }]}>
          <AppIcon name={icon} size={19} color={tintSpec.fg} />
        </View>
      ) : null}
      <View style={styles.labelBlock}>
        <Text
          style={[styles.label, danger && styles.labelDanger]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      {value !== undefined ? (
        <Text style={[styles.value, danger && styles.valueDanger]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {hasSwitch ? (
        <Switch
          value={switchValue}
          disabled={switchDisabled}
          onValueChange={onSwitchChange}
          trackColor={{ false: 'rgba(23,59,75,0.18)', true: '#0F7A78' }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="rgba(23,59,75,0.18)"
          accessibilityLabel={`${label}开关`}
        />
      ) : hideChevron ? null : (
        <AppIcon
          name="chevron_right"
          size={16}
          color={disabled ? 'rgba(116,136,151,0.4)' : 'rgba(11,45,75,0.38)'}
        />
      )}
    </View>
  );

  if (!interactive) {
    return <View accessibilityLabel={accessibilityLabel ?? label}>{body}</View>;
  }
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={hasSwitch ? { checked: switchValue } : undefined}
    >
      {body}
    </PressableScale>
  );
};

const dangerColor = '#C25B4E';

const styles = StyleSheet.create({
  groupLabel: {
    fontSize: fs(12),
    fontWeight: '500',
    color: coreColors.mistBlueGray,
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  } as TextStyle,
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.10)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    overflow: 'hidden',
  } as ViewStyle,
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  } as ViewStyle,
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  labelBlock: {
    flex: 1,
    justifyContent: 'center',
  } as ViewStyle,
  label: {
    fontSize: fs(15),
    fontWeight: '500',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  labelDanger: {
    color: dangerColor,
    fontWeight: '600',
  } as TextStyle,
  description: {
    fontSize: fs(12),
    lineHeight: 17,
    color: coreColors.mistBlueGray,
    marginTop: 2,
  } as TextStyle,
  value: {
    fontSize: fs(13),
    color: coreColors.mistBlueGray,
    maxWidth: 150,
  } as TextStyle,
  valueDanger: {
    color: 'rgba(194,91,78,0.8)',
  } as TextStyle,
  badge: {
    backgroundColor: 'rgba(116,136,151,0.14)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  } as ViewStyle,
  badgeText: {
    fontSize: fs(11),
    fontWeight: '500',
    color: coreColors.mistBlueGray,
  } as TextStyle,
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(11,45,75,0.08)',
  } as ViewStyle,
});
