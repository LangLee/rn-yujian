import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  LayoutChangeEvent,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import {
  BackgroundLevel,
  backgroundSalience,
  coreMotion,
  emptyHomeAnchors,
  makeCoverMapper,
  PARTICLE_COUNT,
  REF_CANVAS_HEIGHT,
  REF_CANVAS_WIDTH,
} from '../../constants/coreUi';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

import sceneBase from '../../assets/coreui/scene_base.jpg';
import sceneBaseLake from '../../assets/coreui/scene_base_lake.jpg';
import fishingRod from '../../assets/coreui/fishing_rod.png';
import fishingBobber from '../../assets/coreui/fishing_bobber.png';
import fishingRippleMask from '../../assets/coreui/fishing_ripple_mask.png';
import atmosphereCloud from '../../assets/coreui/atmosphere_cloud.png';
import atmosphereSunBeam from '../../assets/coreui/atmosphere_sun_beam.png';
import atmosphereParticle from '../../assets/coreui/atmosphere_particle.png';

/**
 * MorningLakeScene —— Core UI V1 环境层（同一个清晨湖畔世界）。
 *
 * 分层（layer_contract.json）：
 *   scene_base → cloud → sun_ambient → rod → line → ripple → bobber
 * 渲染顺序保证 lake → ripple → bobber；涟漪恒为 1 个。
 *
 * - 场景按 cover 等比铺满（居中裁切），锚点元素用 refX/refY 严格对齐参考坐标；
 * - level 控制背景存在感：hero 100% / content ~75% / data ~55%（盖白纱，不换世界）；
 * - 动效全部来自 motion_tokens.json，alive, not animated；Reduce Motion 时静态呈现。
 */

interface MorningLakeSceneProps {
  /** 背景存在感层级（BG_ENV_HERO / BG_CONTENT / BG_DATA） */
  level?: BackgroundLevel;
  /**
   * 覆盖 level 对应的存在感默认值（0-1，越大白纱越薄）。
   * 用于同一 level 下按页面设计稿微调，如账号路径 BG_CONTENT
   * 顶部近全强度（仅轻纱）；不传则用 backgroundSalience[level]。
   */
  salience?: number;
  /**
   * 背景源变体（morning_lake_v1 treatment_contract）：
   * - sunrise：Empty Home 专用 Sunrise Hero 源（可见太阳、晨光金）
   * - lake：共享 Morning_Lake_Master_V1 清晨晨雾湖（普通主页 / 内容页 / 数据页默认）
   */
  variant?: 'sunrise' | 'lake';
  /** 是否渲染钓竿 + 鱼线 + 鱼漂 + 涟漪（仅 Empty Home） */
  fishing?: boolean;
  /** 是否渲染云 / 晨光 / 粒子氛围层 */
  atmosphere?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * 钓线几何（参考画布 1080×1920，cubic_bezier_slack）：
 * 起点严格锚定竿尖像素（rod 锚点 (0,950) + 竿尖像素 (399,23)），
 * 控制点取弦下方 ~18% 弦长的松弛下垂，终点藏于鱼漂身后（line_terminates_
 * behind_or_below_contact）。矢量绘制保证衔接零偏差且颜色可控。
 */
const LINE_START: [number, number] = [399, 973];
const LINE_CP1: [number, number] = [438, 1056];
const LINE_CP2: [number, number] = [491, 1135];
const LINE_END: [number, number] = [530, 1170];

export const MorningLakeScene: React.FC<MorningLakeSceneProps> = ({
  level = 'hero',
  salience,
  variant = 'lake',
  fishing = false,
  atmosphere = false,
  style,
}) => {
  const { reduceMotion } = useTheme();

  /* ── cover 几何：以容器实测尺寸为准 ─────────────────────────────
     Dimensions window 高度在 edge-to-edge 下可能与根视图差一个导航栏
     inset（模块初始化时尤甚），用它算 cover 会把场景算短、底部露出兜底色。
     首帧用模块兜底值，onLayout 后以真实容器尺寸重算。 */
  const [cover, setCover] = useState(() => makeCoverMapper(SCREEN_W, SCREEN_H));
  const coverSize = useRef({ w: SCREEN_W, h: SCREEN_H });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    const last = coverSize.current;
    if (Math.abs(width - last.w) < 0.5 && Math.abs(height - last.h) < 0.5) return;
    coverSize.current = { w: width, h: height };
    setCover(makeCoverMapper(width, height));
  };

  /* ── 鱼漂：Y 轴 ±3 参考px，4600ms 循环 ───────────────────────── */
  const bobberY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!fishing || reduceMotion) return;
    const { keyframes } = coreMotion.emptyHome.bobber;
    // keyframes 为绝对位移 [ms, y]，按段推进到各自绝对值
    const segments = keyframes.slice(1).map(([t, y], i) =>
      Animated.timing(bobberY, {
        toValue: cover.s(y),
        duration: t - keyframes[i][0],
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    const loop = Animated.loop(Animated.sequence(segments));
    loop.start();
    return () => loop.stop();
  }, [fishing, reduceMotion, bobberY, cover]);

  /* ── 涟漪：仅 1 个，scale 1→1.22 / alpha 依 token 提亮，3200ms 循环 ── */
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleAlpha = useRef(new Animated.Value(coreMotion.emptyHome.ripple.alphaFrom)).current;
  useEffect(() => {
    if (!fishing || reduceMotion) return;
    const { durationMs, scaleFrom, scaleTo, alphaFrom, alphaTo } = coreMotion.emptyHome.ripple;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(rippleScale, {
          toValue: scaleTo,
          duration: durationMs,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rippleAlpha, {
          toValue: alphaTo,
          duration: durationMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      rippleScale.setValue(scaleFrom);
      rippleAlpha.setValue(alphaFrom);
    };
  }, [fishing, reduceMotion, rippleScale, rippleAlpha]);

  /* ── 云：极慢漂移（基线 ~60s），不可成为显性移动层 ───────────── */
  const cloudX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!atmosphere || reduceMotion) return;
    const drift = cover.s(12);
    const half = coreMotion.emptyHome.cloud.baselineCycleMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cloudX, {
          toValue: drift,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(cloudX, {
          toValue: -drift,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(cloudX, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [atmosphere, reduceMotion, cloudX, cover]);

  /* ── 晨光束：4800ms 呼吸，max alpha 0.18 ────────────────────── */
  const beamAlpha = useRef(new Animated.Value(0.05)).current;
  useEffect(() => {
    if (!atmosphere || reduceMotion) return;
    const { durationMs, maxAlpha } = coreMotion.emptyHome.sunBeam;
    const half = durationMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beamAlpha, {
          toValue: maxAlpha,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(beamAlpha, {
          toValue: 0.04,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [atmosphere, reduceMotion, beamAlpha]);

  /** 粒子：6-12 粒轻浮尘，各自 8-16s 缓慢漂浮，透明度 ≤0.18 */
  const particles = React.useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        key: `p${i}`,
        /* 分布在晨光区域（左上）附近 */
        left: cover.x(30 + ((i * 97) % 260)),
        top: cover.y(90 + ((i * 151) % 420)),
        size: cover.s(10 + ((i * 7) % 12)),
        duration: 8000 + ((i * 2600) % 8000),
        drift: cover.s(6 + ((i * 5) % 10)),
        rise: cover.s(10 + ((i * 9) % 18)),
      })),
    [cover],
  );

  const veilOpacity = 1 - (salience ?? backgroundSalience[level]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.layer, style, { backgroundColor: variant === 'sunrise' ? '#72643C' : '#5B6F6B' }]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      {/* 场景底图：cover 等比（可能溢出屏幕边缘，被容器裁掉）。
          变体按 treatment_contract：sunrise=Empty Home 专用；lake=共享晨雾湖母版 */}
      <Image
        source={variant === 'sunrise' ? sceneBase : sceneBaseLake}
        style={{
          position: 'absolute',
          left: cover.x(0),
          top: cover.y(0),
          width: cover.s(REF_CANVAS_WIDTH),
          height: cover.s(REF_CANVAS_HEIGHT),
        } as ImageStyle}
        resizeMode="stretch"
        fadeDuration={0}
      />

      {/* 背景存在感：content/data 层盖同一世界的白纱（不换背景图） */}
      {veilOpacity > 0.01 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F2F6F7', opacity: veilOpacity }]} />
      )}

      {atmosphere && (
        <>
          {/* 云（极慢漂移） */}
          <Animated.Image
            source={atmosphereCloud}
            style={{
              position: 'absolute',
              left: cover.x(70),
              top: cover.y(120),
              width: cover.s(620),
              height: cover.s(180),
              opacity: 0.5,
              transform: [{ translateX: cloudX }],
            } as ImageStyle}
          />
          {/* 晨光束（呼吸） */}
          <Animated.Image
            source={atmosphereSunBeam}
            style={{
              position: 'absolute',
              left: cover.x(-30),
              top: cover.y(40),
              width: cover.s(340),
              height: cover.s(520),
              opacity: beamAlpha,
              tintColor: '#FFE0A8',
            } as ImageStyle}
          />
          {/* 浮尘粒子 */}
          {particles.map((p) => (
            <Particle key={p.key} particle={p} reduceMotion={reduceMotion} />
          ))}
        </>
      )}

      {fishing && (
        <>
          {/* 钓竿 */}
          <Image
            source={fishingRod}
            style={{
              position: 'absolute',
              left: cover.x(emptyHomeAnchors.rod.x),
              top: cover.y(emptyHomeAnchors.rod.y),
              width: cover.s(emptyHomeAnchors.rod.w),
              height: cover.s(emptyHomeAnchors.rod.h),
            } as ImageStyle}
          />
          {/* 鱼线：矢量松弛曲线，起点严格锚定竿尖、终点藏于鱼漂身后。
              柔和白（近白偏湖色，不过曝），渲染于钓竿之上、涟漪/鱼漂之下；
              鱼漂 ±3px 浮动由漂体自身遮挡吸收。 */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path
              d={
                `M ${cover.x(LINE_START[0])} ${cover.y(LINE_START[1])} ` +
                `C ${cover.x(LINE_CP1[0])} ${cover.y(LINE_CP1[1])}, ` +
                `${cover.x(LINE_CP2[0])} ${cover.y(LINE_CP2[1])}, ` +
                `${cover.x(LINE_END[0])} ${cover.y(LINE_END[1])}`
              }
              stroke="#E9F1F2"
              strokeWidth={Math.max(1, cover.s(1.5))}
              strokeLinecap="round"
              strokeOpacity={0.8}
              fill="none"
            />
          </Svg>
          {/* 涟漪：位于鱼漂下层（render order: lake → ripple → bobber） */}
          <Animated.Image
            source={fishingRippleMask}
            style={{
              position: 'absolute',
              left: cover.x(emptyHomeAnchors.ripple.x),
              top: cover.y(emptyHomeAnchors.ripple.y),
              width: cover.s(emptyHomeAnchors.ripple.w),
              height: cover.s(emptyHomeAnchors.ripple.h),
              tintColor: '#FFFFFF',
              opacity: reduceMotion ? 0.24 : rippleAlpha,
              transform: [
                {
                  translateX: cover.s(emptyHomeAnchors.ripple.w / 2),
                },
                { scale: reduceMotion ? 1.06 : rippleScale },
                { translateX: cover.s(-emptyHomeAnchors.ripple.w / 2) },
              ],
            } as ImageStyle}
          />
          {/* 鱼漂：仅 Y 轴浮动 */}
          <Animated.Image
            source={fishingBobber}
            style={{
              position: 'absolute',
              left: cover.x(emptyHomeAnchors.bobber.x),
              top: cover.y(emptyHomeAnchors.bobber.y),
              width: cover.s(emptyHomeAnchors.bobber.w),
              height: cover.s(emptyHomeAnchors.bobber.h),
              transform: [{ translateY: bobberY }],
            } as ImageStyle}
          />
        </>
      )}
    </View>
  );
};

/* ─── 浮尘粒子：单粒缓慢漂浮 ──────────────────────────────────────────────── */

interface ParticleSpec {
  left: number;
  top: number;
  size: number;
  duration: number;
  drift: number;
  rise: number;
}

const Particle: React.FC<{ particle: ParticleSpec; reduceMotion: boolean }> = ({
  particle,
  reduceMotion,
}) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: particle.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: particle.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, particle.duration, reduceMotion]);

  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0, particle.drift],
  });
  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -particle.rise],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.05, 0.16, 0.05],
  });

  return (
    <Animated.Image
      source={atmosphereParticle}
      style={{
        position: 'absolute',
        left: particle.left,
        top: particle.top,
        width: particle.size,
        height: particle.size,
        tintColor: '#FFE9C0',
        opacity: reduceMotion ? 0.08 : opacity,
        transform: reduceMotion ? undefined : [{ translateX }, { translateY }],
      } as ImageStyle}
    />
  );
};

const styles = StyleSheet.create({
  layer: {
    overflow: 'hidden',
  } as ViewStyle,
});
