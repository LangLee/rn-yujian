import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  LayoutChangeEvent,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { MorningLakeScene } from './MorningLakeScene';
import { EdgeAuraFrame } from '../EdgeAuraFrame';

/**
 * AIAmbientField —— 识别处理页环境层。
 *
 * 权威文档（design/pages/recognition）：
 *   · Recognition_Design_Closure_V1_2.md —— 三状态产品模型
 *   · spec/Recognition_State_Timeline_Spec_V1_3.md —— 图片识别中 → 已定位到鱼体 → 鱼种识别中
 *   · processing/motion/Recognition_Processing_Motion_Spec_V1_2.md —— 节拍/强度/速度
 *   · processing/spec/Recognition_Processing_Visual_Spec_V1_1.md —— 色彩令牌/鱼焦点几何
 *   · processing/accessibility/Recognition_Reduce_Motion_V1.md —— 减弱动态
 *
 * 2026-10 边缘动效修订（用户拍板，替换 AI Edge Field V1 四能量岛光场）：
 *   · 识别过程的边缘动画改为 edge-aura 方案（edge-aura.js.org 引擎移植，
 *     详见 EdgeAuraFrame / edgeAuraEngine）：贴整屏边缘流动的有机光环——
 *     亮芯 + 内长尾羽化沿屏幕边缘 8s/圈流动，环形噪声调制粗细呼吸，
 *     入场自底边中点点亮扫过半环（替代旧 420ms 分层入场编排）；
 *     色板保持渔见清晨湖畔色（湖水青 → 鱼鳞薄荷 → 湖雾白 → 晨金结 → 回青）。
 *   · 保留结构不动：全屏照片（视觉主导）、中性暗角、状态强度链
 *     （StateStrength 1.00 → 0.80 → 0.62）、RESOLVE 冻结停表 + 淡出、
 *     鱼焦点预留（SHOW_FISH_FOCUS，待真实 bbox 接入）。
 *
 * 三状态（V1.2 State Timeline，恰好三个用户可见状态）：
 *   图片识别中 ≥900ms → 已定位到鱼体 ≥600ms → 鱼种识别中 ≥1250ms
 *   → RESOLVE 200ms（光环停表冻结段位，ResolveStrength=(1-p)² 整体淡出）
 *
 * Reduce Motion：光环静态呈现于入场完成位（180ms 静态淡入，无流动）。
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** 状态卡与光场冻结色彩令牌（Visual Spec V1.1「Color / alpha tokens」） */
export const AI_BLUE_CORE = '#BFEAF2';
export const AI_BLUE_HOT = '#D8F5FA';
export const AI_GOLD_CORE = '#F6D99B';
export const AI_GOLD_HOT = '#FFE7AE';
export const STATUS_BG = 'rgba(26,44,53,0.85)';
export const STATUS_TEXT_SECONDARY = '#BFD0D7';

/** 鱼焦点冻结色：光晕基色 / 轮廓热金（Visual Spec Fish focus geometry） */
const FISH_HALO_BASE = '#FFD98A';
const FISH_CONTOUR_HOT = AI_GOLD_HOT;

/** 识别处理三状态（V1.2 State Timeline） */
export type AIPhase = 'imageRecognizing' | 'fishLocated' | 'speciesRecognizing';

/** 状态最小可见节拍（Motion Spec V1.2 §1；名义完整故事 900+600+1250+200=2950ms） */
export const AI_STATE_MIN_MS: Record<AIPhase, number> = {
  imageRecognizing: 900,
  fishLocated: 600,
  speciesRecognizing: 1250,
};

/**
 * StateStrength 目标：光环全程是视觉主角，后段轻微收束叙事
 * （0.58/0.36 的「为鱼让位」版本随四岛光场一并废弃）。
 */
export const AI_STATE_STRENGTH: Record<AIPhase, number> = {
  imageRecognizing: 1.0,
  fishLocated: 0.8,
  speciesRecognizing: 0.62,
};
/** 状态过渡插值时长（Motion Spec V1.2 §4） */
const TRANSITION_MS: Record<AIPhase, number> = {
  imageRecognizing: 420,
  fishLocated: 260,
  speciesRecognizing: 280,
};
/** V1.2 统一缓动 cubic-bezier(0.22, 1, 0.36, 1) */
const EASE_V12 = Easing.bezier(0.22, 1, 0.36, 1);

/** 鱼焦点暂缓开关（用户 2026-10：中间鱼体亮光先不实现；真实 bbox 接入后开启） */
const SHOW_FISH_FOCUS = false;

/** 中性暗角（照片中心 55% 不动、仅压暗外围衬托边缘光，非规格禁止的色彩罩） */
const VIGNETTE_COLOR = '#06141A';

/** 0↔1 正弦呼吸循环（native driver：opacity / transform） */
function breatheLoop(v: Animated.Value, ms: number): Animated.CompositeAnimation {
  const half = ms / 2;
  return Animated.loop(
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]),
  );
}

/**
 * 鱼焦点几何（Visual Spec「Fish focus geometry」，真实检测 bbox 映射）：
 * radiusX = bbox宽×0.62+14dp；radiusY = bbox高×0.72+14dp；径向外延 1.18×；
 * 内部透明不填充鱼体；周界椭圆 1.2dp 金色响应。
 */
export interface FishFocus {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

interface AIAmbientFieldProps {
  /** 当前产品状态（V1.2 三状态） */
  phase: AIPhase;
  /** 刚拍下的照片（本地 file:// URI，L1 视觉主导、无处理色罩） */
  photoUri: string | null;
  /** 鱼焦点（真实检测 bbox 归一化映射；缺省为中心偏置 Level C 兜底） */
  fishFocus?: FishFocus;
  /** 收场淡出（ResolveStrength=(1-p)²；0=正常，1=完全淡出；仅作用 L2-L7，照片不动） */
  resolveOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  /** RESOLVE 已开始：光环停表冻结段位（Motion Contract §7） */
  frozen?: boolean;
  /**
   * 照片适配：cover = 相机流（铺满裁切）；contain = 相册流
   * （完整居中、不改比例，letterbox 露深色底 + 全幅环境层）。
   */
  photoFit?: 'cover' | 'contain';
}

export const AIAmbientField: React.FC<AIAmbientFieldProps> = ({
  phase,
  photoUri,
  fishFocus = { cx: 0.5, cy: 0.42, halfW: 0.3, halfH: 0.1 },
  resolveOpacity = 1,
  frozen = false,
  photoFit = 'cover',
}) => {
  const { reduceMotion } = useTheme();
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

  /* ── 实测视口尺寸：模块级 Dimensions 在部分真机（系统导航条/安全区差异）
     与实际 flex 布局有出入，光环按实测尺寸铺满。 ── */
  const [size, setSize] = useState({ w: SCREEN_W, h: SCREEN_H });
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width: w, height: h } = e.nativeEvent.layout;
      setSize((prev) => (Math.abs(w - prev.w) > 0.5 || Math.abs(h - prev.h) > 0.5 ? { w, h } : prev));
    },
    [],
  );

  /* ── 入场：常态由光环自带 kindle 点亮扫过（0.85s 自底边中点扫半环）承担，
     无需旧版 420ms 分层编排；Reduce Motion 改 180ms 静态淡入。 ── */
  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      entry.setValue(0);
      Animated.timing(entry, { toValue: 1, duration: 180, easing: EASE_V12, useNativeDriver: true }).start();
    }
  }, [reduceMotion, entry]);

  /* ── StateStrength：1.00 → 0.80(260ms) → 0.62(280ms) 插值（2026-10 修订）；
     初值直接取首状态目标（入场由 kindle 承担，不双重渐入）；
     Reduce Motion 用 180ms alpha 插值（ReduceMotion §10）。 ── */
  const strength = useRef(new Animated.Value(AI_STATE_STRENGTH[phase])).current;
  useEffect(() => {
    Animated.timing(strength, {
      toValue: AI_STATE_STRENGTH[phase],
      duration: reduceMotion ? 180 : TRANSITION_MS[phase],
      easing: EASE_V12,
      useNativeDriver: true,
    }).start();
  }, [phase, reduceMotion, strength]);

  /* ── 鱼焦点（状态 2/3 的视觉主角，预留未启用）：OUTLINE 揭示 360ms；
     CLASSIFYING 轮廓呼吸 0.36↔0.42/1900ms。Reduce Motion：180ms 揭示至静态中值。 ── */
  const focusActive = phase === 'fishLocated' || phase === 'speciesRecognizing';
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!focusActive) {
      reveal.setValue(0);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: reduceMotion ? 180 : 360,
      easing: EASE_V12,
      useNativeDriver: true,
    }).start();
  }, [focusActive, reduceMotion, reveal]);

  const breath = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduceMotion || frozen || phase !== 'speciesRecognizing') {
      breath.setValue(0.5);
      return;
    }
    const loop = breatheLoop(breath, 1900);
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, frozen, phase, breath]);

  /* 光晕峰 ≤0.18；轮廓 OUTLINE 揭示至 0.42，CLASSIFYING 呼吸 0.36↔0.42 */
  const haloAlpha = Animated.multiply(
    reveal,
    breath.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.18] }),
  );
  const contourAlpha = Animated.multiply(
    reveal,
    breath.interpolate({ inputRange: [0, 1], outputRange: [0.72, 0.85] }),
  );

  const frx = fishFocus.halfW * 2 * size.w * 0.62 + 14;
  const fry = fishFocus.halfH * 2 * size.h * 0.72 + 14;
  const fcx = fishFocus.cx * size.w;
  const fcy = fishFocus.cy * size.h;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {/* L0. 相册流 letterbox 底衬：通用识别结果背景（同一个清晨湖畔世界，
          BG_CONTENT），透过 contain 照片的透明留边露出，与结果页无缝衔接；
          相机流全屏铺满、底衬永不可见，不渲染省开销。 */}
      {photoFit === 'contain' && <MorningLakeScene level="content" />}
      {/* L1. 全屏照片：立即可见、无处理色罩（照片始终视觉主导）。
          相机流 cover 铺满；相册流 contain 完整居中不改比例。 */}
      {photoUri ? (
        <Image source={{ uri: photoUri }} resizeMode={photoFit} style={[StyleSheet.absoluteFill, styles.photo]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPhoto]} />
      )}

      {/* L2-L7 收场淡出层（照片不随淡出） */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: resolveOpacity }]} pointerEvents="none">
        {/* 中性暗角：中心 55% 完全不动、仅压暗外围（亮景可读性，非色彩罩） */}
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
          <Defs>
            <RadialGradient id={`vig${uid}`} cx="50%" cy="46%" rx="50%" ry="50%">
              <Stop offset="0.55" stopColor={VIGNETTE_COLOR} stopOpacity="0" />
              <Stop offset="0.8" stopColor={VIGNETTE_COLOR} stopOpacity="0.22" />
              <Stop offset="1" stopColor={VIGNETTE_COLOR} stopOpacity="0.46" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#vig${uid})`} />
        </Svg>

        {/* L2-L5. 识别过程边缘动效（2026-10 替换为 edge-aura 光环）：
            贴整屏边缘流动的有机光环；入场 = 自底边中点点亮扫过半环；
            StateStrength 承载三状态收束叙事；frozen（RESOLVE）停表冻结段位。 */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: strength }]} pointerEvents="none">
          <Animated.View
            style={[StyleSheet.absoluteFill, reduceMotion ? { opacity: entry } : undefined]}
            pointerEvents="none"
          >
            <EdgeAuraFrame width={size.w} height={size.h} paused={frozen} />
          </Animated.View>
        </Animated.View>

        {/* L6. 鱼焦点（状态 2/3 视觉主角，不随边缘光环强度链）。
            用户要求先不实现 —— 待原生检测 bbox 事件接入后置 true 启用
            （届时用真实 bbox 映射替换中心偏置兜底）。 */}
        {SHOW_FISH_FOCUS && focusActive && (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: haloAlpha }]} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
                <Defs>
                  <RadialGradient id={`halo${uid}`} cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0.55" stopColor={FISH_HALO_BASE} stopOpacity="0" />
                    <Stop offset="0.85" stopColor={FISH_HALO_BASE} stopOpacity="1" />
                    <Stop offset="1" stopColor={FISH_HALO_BASE} stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Ellipse cx={fcx} cy={fcy} rx={frx * 1.18} ry={fry * 1.18} fill={`url(#halo${uid})`} />
              </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: contourAlpha }]} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
                {/* 轮廓柔光：12dp @ 55%×核心（关键帧03：金色能量描边+外发光） */}
                <Ellipse cx={fcx} cy={fcy} rx={frx} ry={fry} fill="none" stroke={FISH_CONTOUR_HOT} strokeWidth={12} strokeOpacity={0.55} />
                {/* 周界椭圆核心：2.2dp 金色响应 */}
                <Ellipse cx={fcx} cy={fcy} rx={frx} ry={fry} fill="none" stroke={FISH_CONTOUR_HOT} strokeWidth={2.2} />
              </Svg>
            </Animated.View>
          </>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  photo: { width: '100%', height: '100%' } as ImageStyle,
  /* BG_CAPTURE 无照片兜底：背景系统 V1 冻结值 #102D35 */
  noPhoto: { backgroundColor: '#102D35' } as ViewStyle,
});
