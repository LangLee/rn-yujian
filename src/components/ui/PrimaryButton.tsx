import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { font, fs, motion, radius } from '../../constants/tokens';
import { palette } from '../../constants/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { PressableScale } from './PressableScale';
import { HapticLevel } from '../../utils/haptics';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 保存成功 Crossfade「✓ 已保存」（17.12） */
  saved?: boolean;
  savedLabel?: string;
  /** primary：水青实底；ghost：细描边胶囊；danger：危险 CTA；
   * glass：参考稿保存按钮 —— 白玻璃底 + 深青衬线字；
   * gold：低置信度参考稿 —— 金色渐变胶囊 + 白衬线字；
   * soft：浅青绿实底胶囊 + 深字（空状态卡片内轻量 CTA） */
  variant?: 'primary' | 'ghost' | 'danger' | 'glass' | 'gold' | 'soft';
  haptic?: HapticLevel | null;
  serif?: boolean;
  /** 左侧图标（Ionicons 名称，如 camera-outline），与文字水平排列居中 */
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Primary CTA（4.3）：水青主按钮；同屏最多 1 个强 CTA。
 * Secondary 用 ghost（细描边胶囊），不得与主 CTA 同权重。
 */
export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  disabled,
  loading,
  saved,
  savedLabel = '已保存',
  variant = 'primary',
  haptic = null,
  serif = false,
  icon,
  style,
}) => {
  const { profile } = useTheme();
  const savedOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (saved) {
      Animated.parallel([
        Animated.timing(labelOpacity, {
          toValue: 0,
          duration: motion.fast,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(savedOpacity, {
          toValue: 1,
          duration: motion.fast,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      savedOpacity.setValue(0);
      labelOpacity.setValue(1);
    }
  }, [saved, labelOpacity, savedOpacity]);

  const isDisabled = Boolean(disabled || loading || saved);
  const background =
    variant === 'primary'
      ? isDisabled
        ? profile.surface.accentSoft
        : profile.surface.accent
      : variant === 'glass'
        ? profile.isDark
          ? 'rgba(255,255,255,0.14)'
          : 'rgba(255,255,255,0.62)'
        : variant === 'soft'
          ? profile.surface.accentSoft
          : 'transparent';
  const textColor =
    variant === 'ghost'
      ? profile.surface.textSecondary
      : variant === 'danger'
        ? palette.qualityInvalid
        : variant === 'glass'
          ? profile.surface.textPrimary
          : variant === 'soft'
            ? profile.surface.textPrimary
            : isDisabled
              ? profile.surface.textSecondary
              : '#FFFFFF';

  const goldBadge = variant === 'gold' ? (
    <View style={[StyleSheet.absoluteFillObject, styles.goldLayer]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="btnGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E7CF96" />
            <Stop offset="1" stopColor={palette.accentGold} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#btnGold)" />
      </Svg>
    </View>
  ) : null;
  const borderColor =
    variant === 'ghost'
      ? profile.surface.glassBorder
      : variant === 'glass'
        ? profile.isDark
          ? 'rgba(255,255,255,0.24)'
          : 'rgba(255,255,255,0.85)'
        : 'transparent';

  return (
    <PressableScale
      scaleTo={motion.pressScaleStrong}
      haptic={haptic}
      disabled={isDisabled}
      onPress={onPress}
      style={style}
    >
      <View
        style={[
          styles.button,
          (variant === 'glass' || variant === 'gold') && styles.glassShape,
          variant === 'soft' && styles.softShape,
          { backgroundColor: background, borderColor },
          variant !== 'ghost' && variant !== 'soft' && styles.shadow,
        ]}
      >
        {goldBadge}
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : variant === 'ghost' ? (
          <View style={styles.labelRow}>
            {icon ? (
              <Icon name={icon} size={17} color={textColor} style={styles.labelIcon} />
            ) : null}
            <Text style={[styles.label, { color: textColor }]}>{label}</Text>
          </View>
        ) : (
          <View style={styles.labelStack} pointerEvents="none">
            <Animated.View
              style={[styles.labelLayer, { opacity: labelOpacity }]}
            >
              <View style={styles.labelRow}>
                {icon ? (
                  <Icon name={icon} size={17} color={textColor} style={styles.labelIcon} />
                ) : null}
                <Text
                  style={[
                    styles.label,
                    serif && styles.labelSerif,
                    { color: textColor },
                  ]}
                >
                  {label}
                </Text>
              </View>
            </Animated.View>
            <Animated.View
              style={[styles.labelLayer, { opacity: savedOpacity }]}
            >
              <View style={styles.savedRow}>
                <Icon name="checkmark" size={16} color={textColor} />
                <Text
                  style={[styles.label, serif && styles.labelSerif, { color: textColor }]}
                >
                  {savedLabel}
                </Text>
              </View>
            </Animated.View>
          </View>
        )}
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  } as ViewStyle,
  /** 参考稿保存按钮：加高胶囊（白玻璃底 + 深青衬线字） */
  glassShape: {
    height: 56,
    borderRadius: 28,
  } as ViewStyle,
  /** 空状态轻量 CTA：矮一档的实底胶囊（浅青绿底 + 深字） */
  softShape: {
    height: 46,
    borderRadius: 23,
  } as ViewStyle,
  goldLayer: {
    overflow: 'hidden',
    borderRadius: 28,
  } as ViewStyle,
  shadow: {
    shadowColor: '#173B4B',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  label: {
    fontSize: fs(16),
    fontWeight: '600',
  } as TextStyle,
  labelSerif: {
    fontFamily: font.serif,
    fontSize: fs(20),
    fontWeight: '700',
    letterSpacing: 4,
  } as TextStyle,
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
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  /** 图标 + 文字水平排列，在按钮内整体居中 */
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  labelIcon: {
    marginRight: 6,
  } as ViewStyle,
});

void radius;
