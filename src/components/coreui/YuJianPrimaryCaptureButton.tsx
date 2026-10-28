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
import { CAPTURE_VISUAL_SIZE, coreMotion } from '../../constants/coreUi';

import captureBase from '../../assets/coreui/capture_base.png';
import captureGoldRim from '../../assets/coreui/capture_gold_rim.png';
import captureBreathGlow from '../../assets/coreui/capture_breath_glow.png';

/**
 * YuJianPrimaryCaptureButton —— 共享品牌拍摄入口（Camera_Button.md 冻结视觉）。
 *
 * 使用 Empty Home V2.3 冻结 raster 母版（SHA256 501abcc5…9ca327）：
 *  1. breath_glow：暖金呼吸光晕（alpha 随呼吸周期起伏，5000ms）
 *  2. base：白核 + 深藏青相机图形 + 暖金外环 + 母版自带柔和投影（冻结 PNG）
 *  3. gold_rim：亮金弧段扫光（9000ms 周期：首延 3000ms → 1400ms 内从
 *     -110° 扫 360°，alpha = sin(π·progress) 淡入淡出，YuJianMotion 冻结值）
 *
 * 尺寸换算（208px 母版实测）：V2.3 base 圆盘直径 198px（金环外缘 r≈99，
 * 其外 r≤103 为自带投影余量）；base 图层按 208/198 渲染使圆盘视觉直径
 * 恰为 size。呼吸光晕出图于 V2.2 母版（184px 圆盘时代），按 208/184 渲染
 * 以保持冻结的光晕外溢几何，容器亦取该尺寸，版式占位与 V2.2 完全一致。
 * （旧 184px 圆盘母版备份于 capture_base1.png，SHA256 2d15c1bf…bec69d）
 *
 * 共享原则：Empty Home / Normal Home / 主拍摄入口统一使用本组件，
 * 禁止页面各自复制近似版本。
 */

/** 母版画布边长（px） */
const MASTER_CANVAS = 208;

/** base 圆盘（白核 + 金环，不含投影）直径 198px → 渲染直径 = size × 208/198 */
const BITMAP_SCALE = MASTER_CANVAS / 198;

/** 呼吸光晕按其出图母版（184px 圆盘）比例渲染，保持冻结的光晕外溢几何 */
const GLOW_SCALE = MASTER_CANVAS / 184;

/**
 * 金弧贴合校正：gold_rim 母版的弧段轨道中心 r≈96.4px，V2.3 base 金环带
 * 中心 r≈96.2px（带 93–100）——两者同轨，校正比 ≈ 1。保留参数以备母版
 * 再更替：若环带内移，弧段需按此比例以中心收缩后才能骑在金环带上旋转，
 * 否则弧段悬浮于金环外侧，视觉上与按钮脱节（不匀称）。
 */
const RIM_FIT_SCALE = 96.2 / 96.4;

/** 触控区下限：视觉直径 + 8dp 边距，且恒 ≥64dp（组件契约） */
const MIN_TOUCH_SIZE = 64;

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
     （YuJianMotion.captureRimSweepSpec 冻结曲线）。

     实现须为「单一 native timing 跑满整周期 + 关键帧插值」：Animated.delay
     在 RN 0.83 是 useNativeDriver:false 的 JS 动画，loop(sequence([delay,
     timing, delay])) 因混驱退化为 JS 线程重启，而重启只重置动画对象、不回滚
     AnimatedValue——首圈结束后 progress 停在 1，此后每圈 1→1 空转，扫光只
     出现一次。单一 timing 走 native loop（_startNativeLoop 携带 iterations），
     native 端每轮自动归零，可无限循环。 */
  const rimSpec = coreMotion.emptyHome.cameraGoldRim;
  const sweepProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) {
      sweepProgress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(sweepProgress, {
        toValue: 1,
        duration: rimSpec.repeatIntervalMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, rimSpec, sweepProgress]);

  /* 关键帧：周期内 [t0, t1] 为扫光窗（t0 = 首延/周期，t1 = (首延+扫程)/周期），
     窗外 alpha=0 静默；窗内 alpha 以 sin(π·u) 的四段折线逼近（视觉无差） */
  const t0 = rimSpec.firstDelayMs / rimSpec.repeatIntervalMs;
  const t1 = (rimSpec.firstDelayMs + rimSpec.sweepMs) / rimSpec.repeatIntervalMs;
  const w = (t1 - t0) / 4;

  const sweepAngle = sweepProgress.interpolate({
    inputRange: [t0, t1],
    outputRange: ['-110deg', '250deg'],
  });
  const sweepAlpha = sweepProgress.interpolate({
    inputRange: [0, t0, t0 + w, t0 + 2 * w, t0 + 3 * w, t1, 1],
    outputRange: [0, 0, 0.71, 1, 0.71, 0, 0],
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

  /** 圆盘（base/rim 图层）渲染直径：换算后视觉圆盘恰为 size */
  const discSize = Math.round(size * BITMAP_SCALE);
  /** 光晕为最大图层，容器取其尺寸——版式占位与 V2.2 一致，圆盘居中略收 */
  const glowSize = Math.round(size * GLOW_SCALE);
  const containerSize = glowSize;
  /** 逐实例计算触控区：size + 8 且 ≥64dp（全局常量仅适用于 ~168 主入口，
      直接套用会把小尺寸 FAB 的触控区虚扩到 176dp，遮挡周边元素） */
  const hitSlop = Math.max(0, Math.round((Math.max(MIN_TOUCH_SIZE, size + 8) - size) / 2));

  return (
    <Animated.View
      style={[styles.container, { width: containerSize, height: containerSize, transform: [{ scale: breathScale }] }, style]}
    >
      {/* 暖金呼吸光晕（alpha 随呼吸周期起伏，按 V2.2 出图比例渲染） */}
      <Animated.Image
        source={captureBreathGlow}
        style={[StyleSheet.absoluteFill, { width: glowSize, height: glowSize, opacity: animate ? glowAlpha : 0.4 }] as ImageStyle}
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
          {/* 白核 + 深藏青相机图形 + 暖金外环 + 自带投影（V2.3 冻结 base 母版） */}
          <Image
            source={captureBase}
            style={{ width: discSize, height: discSize } as ImageStyle}
          />
          {/* 亮金弧段扫光（-110° 起，扫 360°，sin 淡入淡出；
              RIM_FIT_SCALE 使弧段轨道贴合金环带） */}
          {animate && (
            <Animated.Image
              source={captureGoldRim}
              style={[
                styles.rimSweep,
                {
                  width: discSize,
                  height: discSize,
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
