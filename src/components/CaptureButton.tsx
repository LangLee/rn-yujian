import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { motion } from '../constants/tokens';
import { useTheme } from '../contexts/ThemeContext';

interface CaptureButtonProps {
  onPress: () => void;
  /** 直径（玻璃圆） */
  size?: number;
  disabled?: boolean;
  /** Idle Breath：Scale 1.000 → 1.020 → 1.000，约 3600ms（17.5） */
  breath?: boolean;
  icon?: string;
}

/**
 * 大圆相机按钮（参考稿：白玻璃圆 + 金色外环 + 白色相机 glyph）。
 * 呼吸光圈用 inset 0 与固定尺寸容器完全同心；整体（光圈 + 按钮）一起呼吸。
 * Reduce Motion 时 Scale 固定 1.000、Highlight 固定（17.25）。
 */
export const CaptureButton: React.FC<CaptureButtonProps> = ({
  onPress,
  size = 88,
  disabled,
  breath = true,
  icon = 'camera-outline',
}) => {
  const { profile, reduceMotion } = useTheme();
  const breathScale = useRef(new Animated.Value(1)).current;
  const highlight = useRef(new Animated.Value(0.16)).current;

  const D = size + 30; // 呼吸光圈直径

  useEffect(() => {
    if (!breath || disabled || reduceMotion) {
      breathScale.setValue(1);
      highlight.setValue(0.24);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breathScale, {
            toValue: 1.02,
            duration: motion.breath / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(highlight, {
            toValue: 0.36,
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
          Animated.timing(highlight, {
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
  }, [breath, disabled, reduceMotion, breathScale, highlight]);

  // 按压缩放（Press in 100ms → 0.965，松开回弹）
  const pressScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 0.965,
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

  const glass = profile.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)';
  const glassCore = profile.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.52)';
  const iconColor = profile.isDark ? '#EAF4F2' : '#1F4A56';
  const gold = '#C9A96A';

  return (
    // 固定尺寸容器 = 光圈直径；光圈与按钮命中区都 inset 0 铺满容器 → 严格同心
    <Animated.View
      style={[
        styles.container,
        { width: D, height: D, transform: [{ scale: breathScale }] },
      ]}
    >
      <Animated.View
        style={[
          styles.highlight,
          {
            backgroundColor: profile.backdrop.glowColor,
            opacity: highlight,
          },
        ]}
      />
      <Animated.View style={[styles.pressLayer, { transform: [{ scale: pressScale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          style={styles.hitbox}
          accessibilityRole="button"
          accessibilityLabel="拍照"
        >
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
            <View
              style={[
                styles.core,
                {
                  width: size - 22,
                  height: size - 22,
                  borderRadius: (size - 22) / 2,
                  backgroundColor: glassCore,
                  borderColor: 'rgba(255,255,255,0.55)',
                },
              ]}
            >
              <Icon name={icon} size={size * 0.34} color={iconColor} />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  /** 固定同心容器 */
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 光圈铺满固定容器（inset 0），与按钮永远同心 */
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    opacity: 0.16,
  },
  /** 按压层同样 inset 0，按钮在其中绝对居中 */
  pressLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hitbox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlass: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#173B4B',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
