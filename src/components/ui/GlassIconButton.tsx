import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { AppIcon, AppIconName } from '../icons/AppIcon';
import { motion } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export interface GlassIconButtonProps {
  /** 触发回调 */
  onPress: () => void;
  /** 按钮直径（玻璃圆外圈），默认 88 */
  size?: number;
  /** 图标语义名（icon_library_v0_1），默认 camera */
  icon?: AppIconName;
  /** 自定义图标节点（优先级高于 icon） */
  iconNode?: React.ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否开启呼吸动画，默认 true */
  breath?: boolean;
  /** 外圈描边色，默认金色 */
  ringColor?: string;
  /** 容器外部样式 */
  style?: StyleProp<ViewStyle>;
  /** 无障碍标签 */
  accessibilityLabel?: string;
}

/**
 * GlassIconButton — 可复用玻璃圆形图标按钮。
 *
 * 层级：
 *  呼吸光晕（最底层，铺满容器）
 *  └─ 金色外环 + 白玻璃圆（outerGlass）
 *      └─ 内圈（core）
 *          └─ 图标 / 自定义节点
 *
 * 特性：
 *  - 呼吸 Idle Breath（scale 1.000 → 1.020，周期 3.6s）
 *  - Press feedback（scale 0.965，100ms）
 *  - Reduce Motion 安全
 *  - icon / iconNode 两种方式注入图标
 */
export const GlassIconButton: React.FC<GlassIconButtonProps> = ({
  onPress,
  size = 88,
  icon = 'camera',
  iconNode,
  disabled,
  breath = true,
  ringColor,
  style,
  accessibilityLabel = '操作',
}) => {
  const { profile, reduceMotion } = useTheme();

  const breathScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.16)).current;

  /** 呼吸光圈直径 = size + 32，提供足够光晕扩散空间 */
  const D = size + 32;

  const gold = ringColor ?? '#D6A541';
  const glass = profile.isDark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.44)';
  const glassCore = profile.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.58)';
  const iconColor = profile.isDark ? '#EAF4F2' : '#0B2D4B';

  // 呼吸动画
  useEffect(() => {
    if (!breath || disabled || reduceMotion) {
      breathScale.setValue(1);
      glowOpacity.setValue(0.24);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breathScale, {
            toValue: 1.022,
            duration: motion.breath / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.38,
            duration: motion.breath / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(breathScale, {
            toValue: 1,
            duration: motion.breath / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.16,
            duration: motion.breath / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, disabled, reduceMotion, breathScale, glowOpacity]);

  // 按压反馈
  const pressScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: motion.pressScaleStrong,
      duration: motion.instant,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [pressScale]);
  const handlePressOut = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: motion.instant + 40,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  const innerSize = size - 22;

  return (
    <Animated.View
      style={[
        styles.container,
        { width: D, height: D, transform: [{ scale: breathScale }] },
        style,
      ]}
    >
      {/* 呼吸光晕 */}
      <Animated.View
        style={[
          styles.glow,
          {
            backgroundColor: profile.backdrop.glowColor,
            opacity: glowOpacity,
          },
        ]}
      />

      {/* 按压层 */}
      <Animated.View style={[styles.pressLayer, { transform: [{ scale: pressScale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          style={styles.hitbox}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {/* 外圈：金色描边玻璃圆 */}
          <View
            style={[
              styles.outerGlass,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: glass,
                borderColor: gold,
              },
            ]}
          >
            {/* 内圈：更实的玻璃圆 + 细白边 */}
            <View
              style={[
                styles.core,
                {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2,
                  backgroundColor: glassCore,
                  borderColor: 'rgba(255,255,255,0.6)',
                },
              ]}
            >
              {iconNode ?? (
                <AppIcon
                  name={icon}
                  size={size * 0.33}
                  color={iconColor}
                />
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  glow: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
  } as ViewStyle,
  pressLayer: {
    position: 'absolute',
    inset: 0,
  } as ViewStyle,
  hitbox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  outerGlass: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#0D2B35',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  } as ViewStyle,
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  } as ViewStyle,
});
