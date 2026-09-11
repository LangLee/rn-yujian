/**
 * CaptureButton — 主拍照入口按钮（还原设计稿快门结构）。
 *
 * 层次（由外到内）：
 *  1. 柔白光晕（随 Idle Breath 明暗，直径 = size + max(20, size*0.28)）
 *  2. 银白→淡金金属渐变外环（89% 直径）
 *  3. 环内深色细缝（~82% 直径）
 *  4. 半透明磨砂深灰玻璃内盘（77% 直径）+ 内侧白色高光描边
 *  5. 实心相机图标（白色，36% 直径）
 *
 * 特性：
 *  - 呼吸 Idle Breath（scale 1 → 1.022，周期 3.6s）
 *  - Press feedback（scale 0.965）
 *  - Reduce Motion 安全
 */
import React, { useCallback, useEffect, useId, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { motion } from '../constants/tokens';
import { useTheme } from '../contexts/ThemeContext';

interface CaptureButtonProps {
  onPress: () => void;
  /** 磨砂外盘直径，默认 96 */
  size?: number;
  disabled?: boolean;
  /** 是否开启呼吸动画，默认 true */
  breath?: boolean;
  /** 呼吸周期（ms），默认 motion.breath */
  breathPeriodMs?: number;
  /** 呼吸峰值缩放，默认 1.022 */
  breathScaleTo?: number;
  /** Ionicons 图标名，默认实心 camera */
  icon?: string;
  /** 图标相对 size 的缩放，默认 0.36 */
  iconRatio?: number;
  /** 容器外部样式 */
  style?: StyleProp<ViewStyle>;
  /** 无障碍标签 */
  accessibilityLabel?: string;
}

export const CaptureButton: React.FC<CaptureButtonProps> = ({
  onPress,
  size = 96,
  disabled,
  breath = true,
  breathPeriodMs = motion.breath,
  breathScaleTo = 1.022,
  icon = 'camera',
  iconRatio = 0.36,
  style,
  accessibilityLabel = '拍照识别',
}) => {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ringId = `capRing${uid}`;

  const breathScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.14)).current;

  /** 光晕直径略大于外盘，给呼吸扩散留空间；随尺寸按比例收缩，避免小按钮带过大光晕 */
  const D = size + Math.max(20, Math.round(size * 0.28));
  const ringWidth = Math.max(2, size * 0.048);

  useEffect(() => {
    if (!breath || disabled || reduceMotion) {
      breathScale.setValue(1);
      glowOpacity.setValue(0.22);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breathScale, {
            toValue: breathScaleTo,
            duration: breathPeriodMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.32,
            duration: breathPeriodMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(breathScale, {
            toValue: 1,
            duration: breathPeriodMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.14,
            duration: breathPeriodMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, disabled, reduceMotion, breathScale, glowOpacity, breathPeriodMs, breathScaleTo]);

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

  return (
    <Animated.View
      style={[
        styles.container,
        { width: D, height: D, transform: [{ scale: breathScale }] },
        style,
      ]}
    >
      {/* 柔白呼吸光晕 */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

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
          <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
            <Svg width={size} height={size} style={styles.rings} pointerEvents="none">
              <Defs>
                <LinearGradient id={ringId} x1="0.1" y1="0" x2="0.9" y2="1">
                  <Stop offset="0" stopColor="#F5F2E9" />
                  <Stop offset="0.5" stopColor="#DCD5C2" />
                  <Stop offset="1" stopColor="#B4AC93" />
                </LinearGradient>
              </Defs>
              {/* 银白→淡金金属渐变外环 */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={size * 0.445}
                stroke={`url(#${ringId})`}
                strokeWidth={ringWidth}
                fill="none"
              />
              {/* 环内深色细缝 */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={size * 0.407}
                stroke="rgba(30,44,50,0.5)"
                strokeWidth={1}
                fill="none"
              />
              {/* 半透明磨砂深灰玻璃内盘 */}
              <Circle cx={size / 2} cy={size / 2} r={size * 0.385} fill="rgba(28,42,48,0.32)" />
              {/* 内盘白色高光描边 */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={size * 0.371}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={1}
                fill="none"
              />
            </Svg>
            <Icon name={icon} size={Math.round(size * iconRatio)} color="#F6FAF8" />
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
    backgroundColor: 'rgba(243,247,246,0.55)',
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
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,42,48,0.10)',
    shadowColor: '#0D2B35',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  } as ViewStyle,
  rings: {
    ...StyleSheet.absoluteFillObject,
  } as ViewStyle,
});
