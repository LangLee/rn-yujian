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
import { font, motion, radius } from '../../constants/tokens';
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
   * glass：参考稿保存按钮 —— 白玻璃底 + 深青衬线字 */
  variant?: 'primary' | 'ghost' | 'danger' | 'glass';
  haptic?: HapticLevel | null;
  serif?: boolean;
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
        : 'transparent';
  const textColor =
    variant === 'ghost'
      ? profile.surface.textSecondary
      : variant === 'danger'
        ? palette.qualityInvalid
        : variant === 'glass'
          ? profile.surface.textPrimary
          : isDisabled
            ? profile.surface.textSecondary
            : '#FFFFFF';
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
          { backgroundColor: background, borderColor },
          variant !== 'ghost' && styles.shadow,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : variant === 'ghost' ? (
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        ) : (
          <View style={styles.labelStack} pointerEvents="none">
            <Animated.View
              style={[styles.labelLayer, { opacity: labelOpacity }]}
            >
              <Text
                style={[
                  styles.label,
                  serif && styles.labelSerif,
                  { color: textColor },
                ]}
              >
                {label}
              </Text>
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
  shadow: {
    shadowColor: '#173B4B',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  label: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  labelSerif: {
    fontFamily: font.serif,
    fontSize: 18,
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
});

void radius;
