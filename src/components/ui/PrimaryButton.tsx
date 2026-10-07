import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { fs } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { HapticLevel } from '../../utils/haptics';

/**
 * Action Button V1.1 · FROZEN（design/system/components/action_button）。
 *
 * 三档语义：PRIMARY > SECONDARY_STRONG > SECONDARY_MUTED。
 * 共享几何：高 56dp / 圆角 28dp / 最小水平内边距 24dp /
 * 标签 16sp·Semibold 600·单行 / 可选前导图标 18-20dp / 图标↔标签 8dp。
 * 按压 90ms scale 1→0.985 ease-out，释放 120ms 回弹，无弹跳；
 * 禁用不降整体透明度，使用各自冻结禁用面。
 * 金色禁止用于普通动作；每屏最多一个 PRIMARY。
 */

type SpecVariant = 'primary' | 'secondaryStrong' | 'secondaryMuted' | 'danger';

/** 旧变体名 → V1.1 规范变体的迁移映射（调用方应逐步改用规范名） */
const LEGACY_VARIANT_MAP: Record<string, SpecVariant> = {
  ghost: 'secondaryStrong',
  soft: 'secondaryMuted',
  glass: 'secondaryStrong',
  gold: 'primary',
  goldline: 'primary',
};

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 保存成功 Crossfade「✓ 已保存」（宽度不变，属业务反馈） */
  saved?: boolean;
  savedLabel?: string;
  /**
   * primary：Deep Lake Teal 实底（完成页面主任务）；
   * secondaryStrong：Mist/LakeWhite 弱面（有意义的备选）；
   * secondaryMuted：低优先恢复/退路（无 Loading 形态）；
   * danger：危险 CTA（规范外的既有业务例外，沿用危险红实底）。
   * 兼容旧名：ghost→secondaryStrong / soft→secondaryMuted /
   * glass·gold·goldline→primary·secondaryStrong（金变体已按 V1.1 禁令收敛）。
   */
  variant?: SpecVariant | 'ghost' | 'soft' | 'glass' | 'gold' | 'goldline';
  haptic?: HapticLevel | null;
  /** 左侧前导图标（Ionicons 名称，18-20dp） */
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

const SPEC = {
  primary: {
    fill: '#0F7A78',
    fillPressed: '#0C6D6B',
    fillDisabled: '#D9E4E3',
    label: '#FFFFFF',
    labelDisabled: '#91A5A6',
    edge: 'rgba(255,255,255,0.10)',
    spinner: '#FFFFFF',
    shadow: { color: 'rgba(11,45,75,1)', opacity: 0.10, radius: 6, height: 2, elevation: 2 },
  },
  secondaryStrong: {
    fill: 'rgba(247,250,251,0.88)',
    fillPressed: '#EAF3F1',
    fillDisabled: '#F2F5F5',
    label: '#0B2D4B',
    labelDisabled: '#A0ADAF',
    edge: 'rgba(15,122,120,0.26)',
    edgePressed: 'rgba(15,122,120,0.36)',
    edgeDisabled: '#E3E9E9',
    spinner: '#0F7A78',
    shadow: { color: 'rgba(11,45,75,1)', opacity: 0.05, radius: 4, height: 1, elevation: 1 },
  },
  secondaryMuted: {
    fill: 'rgba(247,250,251,0.45)',
    fillPressed: 'rgba(247,250,251,0.90)',
    fillDisabled: '#F2F5F5',
    label: '#748897',
    labelPressed: '#657D8A',
    labelDisabled: '#A0ADAF',
    edge: 'rgba(116,136,151,0.18)',
    edgeDisabled: '#E3E9E9',
    spinner: '#748897',
    shadow: null,
  },
  danger: {
    fill: '#C25B4E',
    fillPressed: '#B04E42',
    fillDisabled: '#D9E4E3',
    label: '#FFFFFF',
    labelDisabled: '#91A5A6',
    edge: 'rgba(255,255,255,0.10)',
    spinner: '#FFFFFF',
    shadow: { color: 'rgba(11,45,75,1)', opacity: 0.10, radius: 6, height: 2, elevation: 2 },
  },
} as const;

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  disabled,
  loading,
  saved,
  savedLabel = '已保存',
  variant = 'primary',
  haptic = null,
  icon,
  style,
}) => {
  const { reduceMotion } = useTheme();
  const spec = SPEC[(LEGACY_VARIANT_MAP[variant] ?? variant) as SpecVariant];

  const [pressed, setPressed] = useState(false);
  const isActive = !disabled && !loading && !saved;
  const showPressed = pressed && isActive;

  /* 按压：90ms scale → 0.985 ease-out；释放 120ms 回 1.0；Reduce Motion 仅保留色彩反馈 */
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const to = showPressed && !reduceMotion ? 0.985 : 1;
    Animated.timing(scale, {
      toValue: to,
      duration: showPressed ? 90 : 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [showPressed, reduceMotion, scale]);

  /* 保存成功 Crossfade（宽度不变） */
  const savedOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (saved) {
      Animated.parallel([
        Animated.timing(labelOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(savedOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      savedOpacity.setValue(0);
      labelOpacity.setValue(1);
    }
  }, [saved, labelOpacity, savedOpacity]);

  const fill = disabled
    ? spec.fillDisabled
    : showPressed
      ? spec.fillPressed
      : spec.fill;
  const labelColor =
    disabled
      ? spec.labelDisabled
      : showPressed && 'labelPressed' in spec
        ? spec.labelPressed!
        : spec.label;
  const edgeColor = disabled
    ? ('edgeDisabled' in spec ? spec.edgeDisabled : undefined)
    : showPressed && 'edgePressed' in spec
      ? spec.edgePressed!
      : spec.edge;

  /* SECONDARY_MUTED 无 Loading 形态：等待由目标流程接管，仅锁重复点击 */
  const showSpinner = loading && spec !== SPEC.secondaryMuted;

  const shadowStyle = spec.shadow
    ? {
        shadowColor: spec.shadow.color,
        shadowOpacity: showPressed ? spec.shadow.opacity * 0.7 : spec.shadow.opacity,
        shadowRadius: spec.shadow.radius,
        shadowOffset: { width: 0, height: spec.shadow.height },
        elevation: spec.shadow.elevation,
      }
    : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled || loading || saved}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      style={style}
    >
      <Animated.View
        style={[
          styles.button,
          shadowStyle,
          {
            backgroundColor: fill,
            borderColor: edgeColor ?? 'transparent',
            transform: [{ scale }],
          },
        ]}
      >
        {showSpinner ? (
          <ActivityIndicator size="small" color={spec.spinner} />
        ) : (
          <View style={styles.labelStack} pointerEvents="none">
            <Animated.View style={[styles.labelLayer, { opacity: labelOpacity }]}>
              <View style={styles.labelRow}>
                {icon ? (
                  <Icon name={icon} size={18} color={labelColor} style={styles.labelIcon} />
                ) : null}
                <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </Animated.View>
            <Animated.View style={[styles.labelLayer, { opacity: savedOpacity }]}>
              <View style={styles.savedRow}>
                <Icon name="checkmark" size={16} color={labelColor} />
                <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
                  {savedLabel}
                </Text>
              </View>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  /** V1.1 共享几何：56dp 高 / 28dp 圆角 / ≥24dp 水平内边距 */
  button: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  } as ViewStyle,
  labelStack: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  /** 图标 + 文字水平排列，整体居中；图标↔标签 8dp */
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  label: {
    fontSize: fs(16),
    fontWeight: '600',
  } as TextStyle,
  labelIcon: {
    marginRight: 8,
  } as ViewStyle,
});
