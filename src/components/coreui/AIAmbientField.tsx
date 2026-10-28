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
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { MorningLakeScene } from './MorningLakeScene';
import { WaterLightFrame } from '../WaterLightFrame';
import { FishContourGlow } from '../FishContourGlow';
import type { NormalizedFishBoxInput } from '../fishContourEngine';

/**
 * AIAmbientField —— 识别处理页环境层。
 *
 * 权威文档（design/pages/recognition）：
 *   · Recognition_Design_Closure_V1_2.md —— 三状态产品模型
 *   · spec/Recognition_State_Timeline_Spec_V1_3.md —— 图片识别中 → 已定位到鱼体 → 鱼种识别中
 *   · processing/motion/Recognition_Processing_Motion_Spec_V1_2.md —— 节拍/强度/速度
 *   · processing/spec/Recognition_Processing_Visual_Spec_V1_1.md —— 色彩令牌
 *   · processing/accessibility/Recognition_Reduce_Motion_V1.md —— 减弱动态
 *
 * 2026-10 边缘动效修订（先替 AI Edge Field V1 四能量岛为 edge-aura 光环，
 * 再按本地特效 demo 更换为水光光场，并接回真实 bbox 鱼体轮廓光）：
 *   · L2-L5 识别过程边缘动画为「四周水光识别动效」移植（demo AI--main /
 *     FishCatchWaterOverlay 效果02，详见 WaterLightFrame / waterLightEngine）：
 *     贴屏内缘的有机水光环（三层 bloom 呼吸流转，深湖青 / 琥珀金 / 雾蓝
 *     缠绕）+ 底部湖水焦散与晨光光斑 + 沿环漂移光珠与底边中点水纹装饰；
 *     入场 1.2s 自下而上点亮解锁。
 *   · L6 鱼体轮廓光（demo Fish Contour Glow V1.3 移植，详见 FishContourGlow /
 *     fishContourEngine）：原生 detectorRun 的真实鱼体 bbox 映射到屏幕，
 *     有机鱼形四层光学描边 —— 0-1000ms 生长、1600-1850ms 识别确认高光、
 *     1400ms 起日光金流光巡航。轮廓在「已定位到鱼体」状态揭示（由
 *     RecognizingScreen 门控传入），替代旧椭圆鱼焦点预留。
 *   · 保留结构不动：全屏照片（视觉主导）、中性暗角、状态强度链
 *     （StateStrength 1.00 → 0.80 → 0.62）、RESOLVE 冻结停表 + 淡出。
 *
 * 三状态（V1.2 State Timeline，恰好三个用户可见状态）：
 *   图片识别中 ≥900ms → 已定位到鱼体 ≥600ms → 鱼种识别中 ≥1250ms
 *   → RESOLVE 200ms（动效停表冻结段位，ResolveStrength=(1-p)² 整体淡出）
 *
 * Reduce Motion：水光与轮廓光静态呈现于入场完成位（180ms 静态淡入，无流动）。
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** 状态卡与光场冻结色彩令牌（Visual Spec V1.1「Color / alpha tokens」） */
export const AI_BLUE_CORE = '#BFEAF2';
export const AI_BLUE_HOT = '#D8F5FA';
export const AI_GOLD_CORE = '#F6D99B';
export const AI_GOLD_HOT = '#FFE7AE';
export const STATUS_BG = 'rgba(26,44,53,0.85)';
export const STATUS_TEXT_SECONDARY = '#BFD0D7';

/** 识别处理三状态（V1.2 State Timeline） */
export type AIPhase = 'imageRecognizing' | 'fishLocated' | 'speciesRecognizing';

/** 状态最小可见节拍（Motion Spec V1.2 §1；名义完整故事 900+600+1250+200=2950ms） */
export const AI_STATE_MIN_MS: Record<AIPhase, number> = {
  imageRecognizing: 900,
  fishLocated: 600,
  speciesRecognizing: 1250,
};

/**
 * StateStrength 目标：边缘水光全程是视觉主角，后段轻微收束叙事
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

/** 中性暗角（照片中心 55% 不动、仅压暗外围衬托边缘光，非规格禁止的色彩罩） */
const VIGNETTE_COLOR = '#06141A';

interface AIAmbientFieldProps {
  /** 当前产品状态（V1.2 三状态） */
  phase: AIPhase;
  /** 刚拍下的照片（本地 file:// URI，L1 视觉主导、无处理色罩） */
  photoUri: string | null;
  /**
   * 真实检测鱼体 bbox（归一化；原生 detectorRun 结果，由 RecognizingScreen
   * 在「已定位到鱼体」状态门控后传入）。缺省不渲染轮廓光。
   */
  fishBox?: NormalizedFishBoxInput | null;
  /** 照片像素尺寸（EXIF 归一后；bbox → 屏幕映射基准）。缺省不渲染轮廓光 */
  photoPixelSize?: { width: number; height: number } | null;
  /** 收场淡出（ResolveStrength=(1-p)²；0=正常，1=完全淡出；仅作用 L2-L7，照片不动） */
  resolveOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  /** RESOLVE 已开始：动效停表冻结段位（Motion Contract §7） */
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
  fishBox = null,
  photoPixelSize = null,
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

  /* ── 入场：常态由水光自带 1.2s 自下而上点亮承担，无需旧版 420ms 分层
     编排；Reduce Motion 改 180ms 静态淡入。 ── */
  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      entry.setValue(0);
      Animated.timing(entry, { toValue: 1, duration: 180, easing: EASE_V12, useNativeDriver: true }).start();
    }
  }, [reduceMotion, entry]);

  /* ── StateStrength：1.00 → 0.80(260ms) → 0.62(280ms) 插值（2026-10 修订）；
     初值直接取首状态目标（入场由点亮承担，不双重渐入）；
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

        {/* L2-L5. 识别过程边缘动效（2026-10 更换为水光光场）：
            四周水光环 + 底部焦散光斑 + 流光点缀；入场 = 1.2s 自下而上
            点亮解锁；StateStrength 承载三状态收束叙事；frozen（RESOLVE）
            停表冻结段位。 */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: strength }]} pointerEvents="none">
          <Animated.View
            style={[StyleSheet.absoluteFill, reduceMotion ? { opacity: entry } : undefined]}
            pointerEvents="none"
          >
            <WaterLightFrame width={size.w} height={size.h} paused={frozen} />
          </Animated.View>
        </Animated.View>

        {/* L6. 鱼体轮廓光（demo Fish Contour Glow V1.3 移植）：真实检测
            bbox 的有机鱼形四层光学描边，「已定位到鱼体」状态的视觉主角；
            不随边缘水光强度链（有自己的生长/确认/巡航时间线）；
            frozen（RESOLVE）停表冻结段位。 */}
        {fishBox && photoPixelSize ? (
          <FishContourGlow
            width={size.w}
            height={size.h}
            fishBox={fishBox}
            photoWidth={photoPixelSize.width}
            photoHeight={photoPixelSize.height}
            photoFit={photoFit}
            paused={frozen}
          />
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  photo: { width: '100%', height: '100%' } as ImageStyle,
  /* BG_CAPTURE 无照片兜底：背景系统 V1 冻结值 #102D35 */
  noPhoto: { backgroundColor: '#102D35' } as ViewStyle,
});
