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
 * 使用 Empty Home V2.2 冻结 raster 母版（runtime_manifest 登记 SHA256）：
 *  1. breath_glow：暖金呼吸光晕（alpha 随呼吸周期起伏，5000ms）
 *  2. base：白核 + 深藏青相机图形 + 暖金外环（冻结 PNG，含金属渐变高光）
 *  3. gold_rim：亮金弧段扫光（9000ms 周期：首延 3000ms → 1400ms 内从
 *     -110° 扫 360°，alpha = sin(π·progress) 淡入淡出，YuJianMotion 冻结值）
 *
 * 尺寸换算：base 母版 208px 中按钮圆盘约占 0.87（其余为光晕余量），
 * 故图层渲染直径 = size × 208/184 ≈ 1.13 × size，与 Android 参考实现
 * （visualSize 200 / touch 208）对齐。
 *
 * 共享原则：Empty Home / Normal Home / 主拍摄入口统一使用本组件，
 * 禁止页面各自复制近似版本。
 */

/** base 图层直径相对视觉直径的放大比（208 母版 / ~184 圆盘） */
const BITMAP_SCALE = 208 / 184;

/**
 * 金弧贴合校正：gold_rim 母版的弧段轨道半径 ~96px，而 base 金环带中心
 * ~85px（80–90）。弧段按此比例以中心收缩后精确骑在金环带上旋转，
 * 否则弧段悬浮于金环外侧，视觉上与按钮脱节（不匀称）。
 */
const RIM_FIT_SCALE = 85 / 96.5;

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

  /* ── 呼吸：5000ms，scale 1→1.015→1；光晕 alpha 同步起伏 ────── */
  const breathScale = useRef(new Animated.Value(1)).current;
  const glowAlpha = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (!animate) {
      breathScale.setValue(1);
      glowAlpha.setValue(0.4);
      return;
    }
    const { durationMs, maxScale } = coreMotion.emptyHome.cameraBreath;
    const loop = Animated.loop(
      Animated.parallel([
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
        Animated.sequence([
          Animated.timing(glowAlpha, {
            toValue: 0.85,
            duration: durationMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(glowAlpha, {
            toValue: 0.35,
            duration: durationMs / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, breathScale, glowAlpha]);

  /* ── 金弧扫光：9000ms 周期 = 首延 3000ms + 扫 1400ms + 静默 4600ms。
     progress 0→1 期间从 -110° 扫过 360°，alpha = sin(π·progress) 淡入淡出
     （YuJianMotion.captureRimSweepSpec 冻结曲线）。 */
  const sweepProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) {
      sweepProgress.setValue(0);
      return;
    }
    const { firstDelayMs, sweepMs, repeatIntervalMs } = coreMotion.emptyHome.cameraGoldRim;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(firstDelayMs),
        Animated.timing(sweepProgress, {
          toValue: 1,
          duration: sweepMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, repeatIntervalMs - firstDelayMs - sweepMs)),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, sweepProgress]);

  const sweepAngle = sweepProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-110deg', '250deg'],
  });
  const sweepAlpha = sweepProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  /* ── 轻按压反馈 ─────────────────────────────────────────────── */
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

  const bitmapSize = Math.round(size * BITMAP_SCALE);
  const containerSize = bitmapSize;
  const hitSlop = Math.max(0, Math.round((CAPTURE_TOUCH_SIZE - size) / 2));

  return (
    <Animated.View
      style={[styles.container, { width: containerSize, height: containerSize, transform: [{ scale: breathScale }] }, style]}
    >
      {/* 暖金呼吸光晕（alpha 随呼吸周期起伏） */}
      <Animated.Image
        source={captureBreathGlow}
        style={[StyleSheet.absoluteFill, { width: bitmapSize, height: bitmapSize, opacity: animate ? glowAlpha : 0.4 }] as ImageStyle}
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
          style={[styles.hitbox, disabled && styles.disabled]}
        >
          {/* 白核 + 深藏青相机图形 + 暖金外环（冻结 base 母版） */}
          <Image
            source={captureBase}
            style={{ width: bitmapSize, height: bitmapSize } as ImageStyle}
          />
          {/* 亮金弧段扫光（-110° 起，扫 360°，sin 淡入淡出；
              RIM_FIT_SCALE 使弧段轨道贴合金环带） */}
          {animate && (
            <Animated.Image
              source={captureGoldRim}
              style={[
                styles.rimSweep,
                {
                  width: bitmapSize,
                  height: bitmapSize,
                  opacity: sweepAlpha,
                  transform: [{ rotate: sweepAngle }, { scale: RIM_FIT_SCALE }],
                },
              ] as ImageStyle}
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
  disabled: { opacity: 0.55 } as ViewStyle,
  rimSweep: {
    ...StyleSheet.absoluteFillObject,
  } as ImageStyle,
});
