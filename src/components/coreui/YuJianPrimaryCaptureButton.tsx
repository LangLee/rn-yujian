import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageStyle,
  Pressable,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import {
  CAPTURE_TOUCH_SIZE,
  CAPTURE_VISUAL_SIZE,
  coreMotion,
} from '../../constants/coreUi';

import captureBase from '../../assets/coreui/capture_base.png';
import captureGoldRim from '../../assets/coreui/capture_gold_rim.png';
import captureBreathGlow from '../../assets/coreui/capture_breath_glow.png';

/**
 * YuJianPrimaryCaptureButton —— 共享品牌拍摄入口（Camera_Button.md 冻结视觉）。
 *
 * 层次（由外到内）：
 *  1. breath_glow：淡金呼吸环（scale 1→1.015，5000ms）
 *  2. base：白色实心核心 + 细 MorningGold 描边 + 深蓝灰相机图形（冻结 PNG）
 *  3. gold_rim：金环弧段持续绕环旋转（~2.8s/圈，产品确认常转）
 *
 * 共享原则：Empty Home / Normal Home / 主拍摄入口统一使用本组件，
 * 禁止页面各自复制近似版本（NormalHomeCameraButton 等属于系统分叉）。
 */

interface YuJianPrimaryCaptureButtonProps {
  onPress: () => void;
  /** 视觉直径 dp（冻结参考 ~168px@1080 画布）；触控区恒 ≥64dp */
  size?: number;
  disabled?: boolean;
  /** 是否开启呼吸 / 扫光动效（默认开启；Reduce Motion 自动停用） */
  motionEnabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const YuJianPrimaryCaptureButton: React.FC<YuJianPrimaryCaptureButtonProps> = ({
  onPress,
  size = CAPTURE_VISUAL_SIZE,
  disabled,
  motionEnabled = true,
  accessibilityLabel = '拍照识别',
  style,
}) => {
  const { reduceMotion } = useTheme();
  const animate = motionEnabled && !disabled && !reduceMotion;

  /* 呼吸：~5000ms，max scale 1.015（仅微弱呼吸，不明显缩放） */
  const breathScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate) {
      breathScale.setValue(1);
      return;
    }
    const { durationMs, maxScale } = coreMotion.emptyHome.cameraBreath;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, {
          toValue: maxScale,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathScale, {
          toValue: 1,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, breathScale]);

  /* 金环：持续绕环旋转（产品确认改为常转；原冻结合同为 9s 间隔扫光）。
     周期取扫光时长的 2 倍（~2.8s/圈）：保持"活的"品牌感又不至于像加载动画。 */
  const rimRotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) {
      rimRotate.setValue(0);
      return;
    }
    rimRotate.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rimRotate, {
        toValue: 1,
        duration: coreMotion.emptyHome.cameraGoldRim.sweepMs * 2,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, rimRotate]);

  const rimAngle = rimRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  /* 轻按压反馈 */
  const pressScale = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 0.97,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [pressScale]);
  const handlePressOut = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  const glowSize = Math.round(size * 1.16);
  const hitSlop = Math.max(0, Math.round((CAPTURE_TOUCH_SIZE - size) / 2));

  return (
    <Animated.View
      style={[styles.container, { width: glowSize, height: glowSize, transform: [{ scale: breathScale }] }, style]}
    >
      {/* 淡金呼吸环 */}
      <Image
        source={captureBreathGlow}
        style={{
          position: 'absolute',
          width: glowSize,
          height: glowSize,
          opacity: animate ? 0.85 : 0.6,
        } as ImageStyle}
      />
      <Animated.View style={[styles.pressLayer, { transform: [{ scale: pressScale }] }]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          hitSlop={{ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={styles.hitbox}
        >
          {/* 白色核心 + 金色细描边 + 深蓝灰相机图形（冻结 base） */}
          <Image source={captureBase} style={{ width: size, height: size } as ImageStyle} />
          {/* 金环弧段扫光 */}
          {animate && (
            <Animated.Image
              source={captureGoldRim}
              style={[
                styles.rimSweep,
                { width: size, height: size, transform: [{ rotate: rimAngle }] },
              ] as StyleProp<ImageStyle>}
            />
          )}
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
  pressLayer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  hitbox: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  rimSweep: {
    ...StyleSheet.absoluteFillObject,
  } as ImageStyle,
});
