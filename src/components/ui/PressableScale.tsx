import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../../constants/tokens';
import { HapticLevel, hapticForLevel } from '../../utils/haptics';

interface PressableScaleProps extends PressableProps {
  /** 按压缩放目标（17.37：普通卡片 0.990 内、重要按钮 0.960-0.975） */
  scaleTo?: number;
  /** 按下时触觉等级；默认不震（S0） */
  haptic?: HapticLevel | null;
  /** 禁用时不缩放不响应 */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * 统一按压反馈容器（17.37 Press State / Scroll Contract）：
 * Alpha 1.00 → 0.94-0.97 / Scale 最多 1.000 → 0.990，80-120ms，禁止游戏式弹跳。
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  scaleTo = motion.pressScale,
  haptic = null,
  disabled,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (disabled) {
      scale.stopAnimation();
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.instant,
        useNativeDriver: true,
      }).start();
    }
  }, [disabled, scale]);

  const handlePressIn = useCallback(
    (event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      Animated.timing(scale, {
        toValue: scaleTo,
        duration: motion.instant,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      onPressIn?.(event);
    },
    [scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.instant + 40,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      onPressOut?.(event);
    },
    [scale, onPressOut],
  );

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={
        haptic
          ? (event) => {
              hapticForLevel(haptic);
              rest.onPress?.(event);
            }
          : rest.onPress
      }
      style={style}
      {...rest}
    >
      {/* 不锁 width:'100%'：固定尺寸图标按钮靠父级 alignItems:center 居中图标，
          卡片类内容走 Yoga 默认 cross-axis stretch 撑满（锁 100% 会让图标贴左）。
          style 的 flexDirection/gap 等只作用于本层，多子元素横排需在 children 内自包行容器。 */}
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
};
