import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Image,
  ImageStyle,
  StyleSheet,
  View,
  ViewStyle,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import ReAnimated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { MorningLakeScene } from './MorningLakeScene';

/**
 * AIAmbientField —— 识别处理页环境层。
 *
 * 权威文档（design/pages/recognition）：
 *   · Recognition_Design_Closure_V1_2.md —— 三状态产品模型
 *   · spec/Recognition_State_Timeline_Spec_V1_3.md —— 图片识别中 → 已定位到鱼体 → 鱼种识别中
 *   · processing/motion/Recognition_Processing_Motion_Spec_V1_2.md —— 节拍/强度/速度
 *   · processing/motion/AI_Edge_Field_V1_Motion_Contract.md —— 连续时钟
 *   · processing/components/AI_Edge_Field_V1_Static_Shape_Spec.md —— 四能量岛拓扑
 *   · processing/components/AI_Edge_Field_V1_Rendering_Contract.md —— 光学堆叠/统一 alpha 链
 *   · processing/spec/Recognition_Processing_Visual_Spec_V1_1.md —— 色彩令牌/鱼焦点几何
 *   · processing/accessibility/Recognition_Reduce_Motion_V1.md —— 减弱动态
 *
 * 2026-10 产品方向修订（用户拍板，优先于 V1.2 冻结合同的单亮段约束）：
 *   · 边缘是「贴边、饱满的一束流动细丝光环」：每角 8 条丝 = 主彗星
 *     （纤细暗尾 + 亮头 + 热节点亮尖）+ 5 条内侧细丝（7-37dp 阶梯偏置）
 *     + 2 条外侧丝（−5/−11dp，贴屏幕边、局部裁切），束宽约 48dp
 *     「胖带」；每条丝 = 锐核心 + 柔晕光环（远丝省略辉光层省开销）。
 *     主岛控制点收向角部 → 整束更贴边框（关键帧 01：贴边甚至裁切、
 *     带宽约屏宽 8-15%、角部丝线最密、底部最厚）。
 *   · 底边铺满（修掉「下方是尖尖的角」）：左右下两岛改为「沿侧缘下滑、
 *     贴底横扫」的贝塞尔（G_LL 扫到 x0.47 / B_LR 扫到 x0.56），B4 底部
 *     碎片拉长加强（x0.16-0.69），底边成为完整弧带且为全屏最厚。
 *   · 丝线内/外侧方向自动判定：t=0.5 处法线与「指向屏幕中心」方向点积
 *     取符号（修掉旧版 B_LR 伴生发丝偏出屏外的问题）。
 *   · 中间不框鱼体、不实现鱼体高亮（SHOW_FISH_FOCUS=false），边缘光场
 *     全程保持主角，后段 StateStrength 收窄为 1.00 → 0.80 → 0.62。
 *
 * 三状态（V1.2 State Timeline，恰好三个用户可见状态）：
 *   图片识别中 ≥900ms → 已定位到鱼体 ≥600ms → 鱼种识别中 ≥1250ms
 *   → RESOLVE 200ms（冻结段位、停粒子，ResolveStrength=(1-p)² 整体淡出）
 *
 * 彗星段（Comet）：主路径上「亮头在前、暗尾在后」的行进光丝。
 * 亮头走独立时钟通道，初始值内建 tailShift 相移、与暗尾同周期同时长，
 * 两者每帧等量位移严格锁定（亮头永远在暗尾前端）。
 *
 * 驱动方式（2026-10 真机结论修订）：RN Animated JS driver 在
 * RN0.83 Fabric + react-native-svg 15.x 上对 strokeDashoffset 完全不生效
 * （粒子等 native-driver opacity 动画正常）。流光改由 Reanimated
 * useFrameCallback（UI 线程逐帧时钟）+ useAnimatedProps（UI 线程直写
 * SVG 属性）驱动；相位用绝对时间公式 offset = -(o0 + fract(t/duration)·period)
 * 计算，无循环复位、无累计漂移，frozen 停帧即冻结段位。
 *
 * 统一 alpha 链（Rendering Contract §6）：
 *   FinalLayerAlpha = Base × IslandWeight × StateStrength × ResolveStrength × 入场分层
 * 岛权重（不对称，B_UR 唯一主导；下两岛微升支撑「底部最厚」）：B_UR 1.00 / G_UL 0.82 / G_LL 0.72 / B_LR 0.66
 *
 * 入场：420ms 分层建立（0-180ms 受光 / 80-320ms 主能量带 / 180-420ms 发丝·节点·粒子）。
 * Reduce Motion：静态呈现于冻结种子位（不启时钟）、粒子关闭。
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
 * StateStrength 目标。2026-10 修订：鱼焦点不启用，边缘光场全程是视觉主角，
 * 后段从「为鱼让位」的 0.58/0.36 收窄为 0.80/0.62（仍保留轻微收束叙事）。
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

/* ─── 四主岛：冻结贝塞尔（归一化坐标，Static Shape Spec §14 既有路径身份；
     2026-10：BLR/GLL 重铺为「侧缘下滑 + 贴底横扫」，底边成带不再收尖） ─── */
type Cubic = [number, number, number, number, number, number, number, number];

interface IslandDef {
  id: 'BUR' | 'GUL' | 'BLR' | 'GLL';
  pts: Cubic;
  /** 发丝核心线宽（Rendering Contract §4.4 层级保留，整体下调更纤细） */
  core: number;
  /** 行进种子（Motion Contract §2 Primary seeds） */
  seed: number;
  /** 彗星全长占自路径长度比 */
  streak: number;
  /** 岛权重（Rendering Contract §6，B_UR 唯一主导） */
  weight: number;
  blue: boolean;
  /** 近距丝线相位差（Motion Contract §3 Companion phase delta） */
  companionDelta: number;
  /** 远距丝线相位差（各岛独立，形成错落） */
  microDelta: number;
  /** B_UR 主热节点；G_UL 弱副节点 */
  node?: 'main' | 'weak';
}

const ISLANDS: IslandDef[] = [
  // B1 · 右上蓝岛（全屏唯一主导光场；控制点收向角部 → 弧更贴边）
  {
    id: 'BUR', pts: [0.78, -0.02, 0.96, 0.03, 1.03, 0.19, 0.97, 0.42],
    core: 1.1, seed: 0.0, streak: 0.74, weight: 1.0, blue: true,
    companionDelta: -0.055, microDelta: 0.085, node: 'main',
  },
  // G1 · 左上金岛
  {
    id: 'GUL', pts: [-0.02, 0.18, 0.02, 0.07, 0.09, 0.02, 0.25, -0.02],
    core: 1.0, seed: 0.12, streak: 0.68, weight: 0.82, blue: false,
    companionDelta: 0.065, microDelta: 0.13, node: 'weak',
  },
  // B3 · 右下蓝岛：右缘下滑后贴底横扫到 x0.56（底边成带）
  {
    id: 'BLR', pts: [1.02, 0.58, 0.96, 0.78, 0.82, 0.955, 0.56, 1.03],
    core: 1.0, seed: 0.47, streak: 0.62, weight: 0.66, blue: true,
    companionDelta: -0.06, microDelta: -0.1,
  },
  // G3 · 左下金岛：左缘下滑后贴底横扫到 x0.47（底边成带，底部最厚）
  {
    id: 'GLL', pts: [-0.01, 0.7, 0.05, 0.91, 0.24, 1.005, 0.47, 1.03],
    core: 1.0, seed: 0.64, streak: 0.64, weight: 0.72, blue: false,
    companionDelta: 0.05, microDelta: 0.16,
  },
];

/** 次级碎片（右中/左中/底部弧，行进亮段的弱点缀；B4 加强铺底） */
const FRAGMENTS: { pts: Cubic; core: number; phase: number; weightMul: number; blue: boolean }[] = [
  { pts: [1.01, 0.18, 0.92, 0.31, 0.95, 0.52, 1.02, 0.68], core: 1.0, phase: 0.23, weightMul: 0.45, blue: true }, // B2 右中
  { pts: [-0.02, 0.33, 0.04, 0.47, 0.02, 0.62, -0.01, 0.78], core: 0.95, phase: 0.88, weightMul: 0.4, blue: false }, // G2 左中
  { pts: [0.16, 1.035, 0.32, 0.965, 0.5, 0.955, 0.69, 1.015], core: 1.0, phase: 0.92, weightMul: 0.72, blue: true }, // B4 底部（拉长加强，底部最厚）
];

/* ─── 光学堆叠亮度（2026-10 第三轮修订：更贴边、更胖的丝线光带；
     对齐关键帧 01：贴边甚至裁切、带宽约屏宽 8-15%、每角 5-8 条丝紧密交织、
     每条丝 = 锐核心 + 3-5× 宽柔晕、底部最厚） ─── */
// 主彗星（柔晕加宽提亮 = 更多光环；核心保持纤细锐线）
const BLOOM_DP = 10;
const BLOOM_A = 0.08;
const STREAK_MID_DP = 3;
const STREAK_MID_A = 0.18;
const BRIGHT_MID_DP = 3.6;
const BRIGHT_MID_A = 0.28;
const BRIGHT_CORE_A = 0.72;
// 亮头占彗星全长比（其余为暗尾）
const HEAD_RATIO = 0.5;
// 静态极弱底衬（动效异常可见性兜底，<0.15 权重不读作边框）
const CARRIER_MID_DP = 2.5;
const CARRIER_MID_A = 0.09;
const CARRIER_CORE_W = 0.7;
const CARRIER_CORE_A = 0.13;
/**
 * 丝线束（每角 8 条丝 = 主彗星 + 5 内 + 2 外，束宽约 48dp「胖带」）：
 * 外侧两条（−5/−11dp）朝屏幕边缘方向，贴边、局部被裁切（关键帧 01 观感）；
 * 内侧 7/14/21/29/37dp 阶梯散开（变距 ±4-6dp，禁止恒定平行间距）。
 * 近距丝带辉光（光环），远距丝只留纤细核心省开销；越远越细越淡越慢
 * （5.4-7.4s 视差错落）。
 */
interface LaneSpec {
  off: number;
  amp: number;
  glowW: number;
  glowA: number;
  coreW: number;
  coreA: number;
  ratio: number;
  dur: number;
  outer: boolean;
  /** 远距/最外侧弱丝不画辉光层 */
  glow: boolean;
}
const LANES: LaneSpec[] = [
  { off: 7, amp: 4, glowW: 1.8, glowA: 0.2, coreW: 0.52, coreA: 0.44, ratio: 0.5, dur: 5700, outer: false, glow: true },
  { off: 14, amp: 4, glowW: 1.6, glowA: 0.16, coreW: 0.48, coreA: 0.36, ratio: 0.46, dur: 6000, outer: false, glow: true },
  { off: 21, amp: 5, glowW: 1.4, glowA: 0.13, coreW: 0.45, coreA: 0.29, ratio: 0.42, dur: 6300, outer: false, glow: false },
  { off: 29, amp: 5, glowW: 1.2, glowA: 0.1, coreW: 0.42, coreA: 0.23, ratio: 0.38, dur: 6800, outer: false, glow: false },
  { off: 37, amp: 6, glowW: 1.1, glowA: 0.08, coreW: 0.4, coreA: 0.18, ratio: 0.34, dur: 7400, outer: false, glow: false },
  { off: -5, amp: 3, glowW: 1.7, glowA: 0.17, coreW: 0.5, coreA: 0.38, ratio: 0.55, dur: 5400, outer: true, glow: true },
  { off: -11, amp: 4, glowW: 1.3, glowA: 0.11, coreW: 0.44, coreA: 0.26, ratio: 0.42, dur: 6900, outer: true, glow: false },
];
// 次级碎片伴生丝（中带/底带也成束）
const FRAG_LANE = { off: 8, amp: 3, glowW: 1.4, glowA: 0.13, coreW: 0.46, coreA: 0.32, ratio: 0.45, dur: 5900 };
// 次级碎片主段
const FRAG_STREAK_RATIO = 0.55;
const FRAG_MID_DP = 2.6;
const FRAG_MID_A = 0.2;
const FRAG_BRIGHT_A = 0.52;
// 热节点亮尖（亮头最前端的短亮段，带 alpha 呼吸）
const HEAD_A = 0.85;
const HEAD_MAX_PX = 18;
const HEAD_FRACTION = 0.4;
// 边缘受光带（关键帧四角光感；加宽加深 = 胖带的底层大光环）
const RECV_A = 0.22;
// 主彗星/碎片行进周期
const LOOP_MS = 5000;
const FRAG_LOOP_MS = 5300;

/** 鱼焦点暂缓开关（用户 2026-10：中间鱼体亮光先不实现;真实 bbox 接入后开启） */
const SHOW_FISH_FOCUS = false;

/** 中性暗角（照片中心 55% 不动、仅压暗外围衬托边缘光，非规格禁止的色彩罩） */
const VIGNETTE_COLOR = '#06141A';

function sampleCubic(c: Cubic, t: number): [number, number] {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [a * x0 + b * x1 + d * x2 + e * x3, a * y0 + b * y1 + d * y2 + e * y3];
}

/**
 * 丝线束内侧方向自动判定：t=0.5 处路径法线与「指向屏幕中心」方向的
 * 点积符号（+1 = 法线朝屏内）。偏置几何由此派生，杜绝手工 side 配错
 * 导致丝线被推出屏外（旧版 B_LR 即中招）。
 */
function inwardSide(pts: Cubic): 1 | -1 {
  const [x, y] = sampleCubic(pts, 0.5);
  const [nx, ny] = sampleCubic(pts, 0.51);
  let tx = nx - x;
  let ty = ny - y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  return -ty * (0.5 - x) + tx * (0.5 - y) >= 0 ? 1 : -1;
}

/** 预计算：SVG d 串、近似弧长（按实测布局尺寸映射，蒙板铺满真实视口） */
function buildPath(pts: Cubic, w: number, h: number) {
  const SAMPLES = 48;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const [x, y] = sampleCubic(pts, i / SAMPLES);
    xs.push(x * w);
    ys.push(y * h);
  }
  let length = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const X = (x: number) => (x * w).toFixed(1);
  const Y = (y: number) => (y * h).toFixed(1);
  const d = `M ${X(pts[0])} ${Y(pts[1])} C ${X(pts[2])} ${Y(pts[3])}, ${X(pts[4])} ${Y(pts[5])}, ${X(pts[6])} ${Y(pts[7])}`;
  return { d, length };
}

/**
 * 丝线几何：沿主路径法线偏置，偏距随 t 正弦变化（禁止恒定平行间距），
 * 起点终点与主带错开。side 由 inwardSide 派生（内侧为正方向）。
 */
function buildHairline(pts: Cubic, side: 1 | -1, baseOffset: number, amp: number, w: number, h: number) {
  const SAMPLES = 32;
  let d = '';
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const [x, y] = sampleCubic(pts, t);
    const [nx, ny] = sampleCubic(pts, Math.min(1, t + 0.01));
    let tx = (nx - x) * w;
    let ty = (ny - y) * h;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // 法线偏置沿曲线正弦变化；内侧为正
    const offset = side * (baseOffset + amp * Math.sin(t * Math.PI * 1.35 + 0.6));
    const px = x * w - ty * offset;
    const py = y * h + tx * offset;
    xs.push(px);
    ys.push(py);
    d += `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  let length = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { d, length };
}

/** 行进段图案（周期 = 路径全长 L：通道相位每周期位移 L，视觉位置无缝衔接） */
function segmentDash(pathLen: number, segRatio: number) {
  const segLen = segRatio * pathLen;
  return `${segLen.toFixed(1)} ${pathLen.toFixed(1)}`;
}

/**
 * 几何工厂：按实测布局尺寸一次性预计算（模块级 Dimensions 在部分真机上
 * 与实际视口有偏差——曾导致固定尺寸的 SVG 蒙板铺不到屏幕底部）。
 * 通道结构恒定（数量不随尺寸变化），hook 数量稳定。
 */
function buildGeometry(w: number, h: number) {
const islands = ISLANDS.map((f) => {
  const geo = buildPath(f.pts, w, h);
  const streakLen = f.streak * geo.length;
  const headLen = streakLen * HEAD_RATIO;
  const tailLen = streakLen - headLen;
  const side = inwardSide(f.pts);
  // 每角 8 条丝 = 主彗星 + 7 条伴生丝；相位各自大幅错开成流动束
  const cd = f.companionDelta;
  const md = f.microDelta;
  const laneDeltas = [cd, -cd * 1.7, md, -md * 0.8, cd * 2.4 + 0.04, -md * 1.4, md * 0.5 + 0.09];
  const lanes = LANES.map((L, li) => {
    const hair = buildHairline(f.pts, (L.outer ? -side : side) as 1 | -1, L.off, L.amp, w, h);
    return {
      d: hair.d,
      len: hair.length,
      dash: segmentDash(hair.length, L.ratio),
      o0: (f.seed + laneDeltas[li]) * hair.length,
      dur: L.dur,
    };
  });
  // 热节点亮尖：贴亮头最前端（主彗星通道 + (彗星长 - 亮尖长) 相位差）
  const nodeLen = f.node ? Math.min(HEAD_MAX_PX, headLen * HEAD_FRACTION) : 0;
  return {
    ...f,
    ...geo,
    streakDash: `${streakLen.toFixed(1)} ${geo.length.toFixed(1)}`,
    headDash: `${headLen.toFixed(1)} ${geo.length.toFixed(1)}`,
    tailShift: tailLen,
    lanes,
    nodeLen,
    nodeShift: streakLen - nodeLen,
  };
});

const fragments = FRAGMENTS.map((f) => {
  const geo = buildPath(f.pts, w, h);
  const side = inwardSide(f.pts);
  const laneHair = buildHairline(f.pts, side, FRAG_LANE.off, FRAG_LANE.amp, w, h);
  return {
    ...f,
    ...geo,
    fragDash: segmentDash(geo.length, FRAG_STREAK_RATIO),
    laneD: laneHair.d,
    laneDash: segmentDash(laneHair.length, FRAG_LANE.ratio),
    laneO0: (f.phase - 0.07) * laneHair.length,
    laneLen: laneHair.length,
  };
});

/**
 * 流光通道表（纯数值，可被 UI 线程 worklet 捕获）：
 *   offset(t) = -(o0 + fract(t / duration) × period)
 * o0 = 种子相位位移（px）、period = 路径全长（每周期位移）、duration = 周期时长。
 * 同 duration 的通道每帧等量位移 → 主彗星暗尾/亮头/亮尖严格锁定；
 * 不同 duration（丝线 5.7-7.2s / 碎片 5.3s）形成视差流动。
 * RESOLVE 冻结 = 停帧回调，值停在当前位置（Motion Contract §7）。
 */
interface FlowChannel {
  o0: number;
  period: number;
  duration: number;
}

  const channels: FlowChannel[] = [];
  const push = (o0: number, period: number, duration: number) =>
    channels.push({ o0, period, duration }) - 1;
  const idx = {
    primary: [] as number[],
    primaryBright: [] as number[],
    nodeHead: [] as number[],
    lanes: [] as number[][],
    fragment: [] as number[],
    fragmentLane: [] as number[],
  };
  islands.forEach((f) => {
    idx.primary.push(push(f.seed * f.length, f.length, LOOP_MS));
    // 主彗星亮头通道：内建 tailShift 相移（亮头永远在暗尾前端）
    idx.primaryBright.push(push(f.seed * f.length + f.tailShift, f.length, LOOP_MS));
    idx.nodeHead.push(f.node ? push(f.seed * f.length + f.nodeShift, f.length, LOOP_MS) : -1);
    idx.lanes.push(f.lanes.map((lane) => push(lane.o0, lane.len, lane.dur)));
  });
  fragments.forEach((f) => {
    idx.fragment.push(push(f.phase * f.length, f.length, FRAG_LOOP_MS));
    idx.fragmentLane.push(push(f.laneO0, f.laneLen, FRAG_LANE.dur));
  });
  return { islands, fragments, channels, idx };
}

/**
 * 稀疏粒子（Visual Spec「Particles」：1-2dp 常规 / 3-4dp 热；
 * 慢速局部漂移，绝不似彩纸屑）。锚位贴四岛与中带边缘。
 */
const PARTICLES = [
  { x: 0.9, y: 0.13, size: 3.2, gold: false, hot: true },   // B_UR 热粒
  { x: 0.81, y: 0.3, size: 2.1, gold: false, hot: false },
  { x: 0.12, y: 0.09, size: 2.2, gold: true, hot: false },  // G_UL
  { x: 0.21, y: 0.2, size: 2.0, gold: true, hot: false },
  { x: 0.88, y: 0.79, size: 2.0, gold: false, hot: false }, // B_LR
  { x: 0.7, y: 0.93, size: 1.9, gold: false, hot: false },
  { x: 0.09, y: 0.85, size: 2.1, gold: true, hot: false },  // G_LL
  { x: 0.32, y: 0.95, size: 1.9, gold: true, hot: false },
  { x: 0.97, y: 0.44, size: 1.8, gold: false, hot: false }, // B2 右中
  { x: 0.03, y: 0.55, size: 1.8, gold: true, hot: false },  // G2 左中
  { x: 0.5, y: 0.97, size: 2.2, gold: true, hot: false },    // 底部中（最厚带）
  { x: 0.84, y: 0.96, size: 2.0, gold: false, hot: false },  // 底部右
].map((p, i) => ({
  ...p,
  key: `dust${i}`,
  stagger: i * 431,
  pulseMs: 3200 + ((i * 379) % 2300),
  driftAmp: 9 + ((i * 13) % 8),
}));

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

/* Reanimated UI 线程直写 SVG strokeDashoffset（Fabric 上 JS driver 不生效的标准替代） */
const ReAnimatedPath = ReAnimated.createAnimatedComponent(Path);

interface FlowPathProps {
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  dash: string;
  offset: SharedValue<number>;
}

/** 行进丝线单元：静态几何走普通 props，dashoffset 由 UI 线程逐帧直写 */
const FlowPath: React.FC<FlowPathProps> = ({ d, stroke, strokeWidth, strokeOpacity, dash, offset }) => {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));
  return (
    <ReAnimatedPath
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeDasharray={dash}
      animatedProps={animatedProps}
      fill="none"
      strokeLinecap="round"
    />
  );
};

interface AIAmbientFieldProps {
  /** 当前产品状态（V1.2 三状态） */
  phase: AIPhase;
  /** 刚拍下的照片（本地 file:// URI，L1 视觉主导、无处理色罩） */
  photoUri: string | null;
  /** 鱼焦点（真实检测 bbox 归一化映射；缺省为中心偏置 Level C 兜底） */
  fishFocus?: FishFocus;
  /** 收场淡出（ResolveStrength=(1-p)²；0=正常，1=完全淡出；仅作用 L2-L7，照片不动） */
  resolveOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  /** RESOLVE 已开始：冻结段位/停粒子/停呼吸（Motion Contract §7） */
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
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  /* ── 实测视口尺寸：模块级 Dimensions 在部分真机（系统导航条/安全区差异）
     与实际 flex 布局有出入，固定尺寸的 SVG 蒙板会铺不到真实底部。
     几何/通道按实测尺寸构建；通道数量恒定 → hook 数量稳定。 ── */
  const [size, setSize] = useState({ w: SCREEN_W, h: SCREEN_H });
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width: w, height: h } = e.nativeEvent.layout;
      setSize((prev) => (Math.abs(w - prev.w) > 0.5 || Math.abs(h - prev.h) > 0.5 ? { w, h } : prev));
    },
    [],
  );
  const geo = useMemo(() => buildGeometry(size.w, size.h), [size.w, size.h]);

  /* ── 流光时钟（Reanimated useFrameCallback，UI 线程）：
     通道数量为模块常量 → hook 数量恒定；初始值即冻结种子位。
     绝对时间公式计算相位：无循环复位、无累计漂移、frozen 停帧即冻结。
     Reduce Motion / frozen：不启时钟，丝线静态停于种子位。 ── */
  const flowOffsets = geo.channels.map((c) => useSharedValue(-c.o0));
  const flowClock = useSharedValue(0);
  const flowLastTs = useSharedValue(-1);
  const flowActive = !reduceMotion && !frozen;
  const geoChannels = geo.channels;
  useFrameCallback(
    (info) => {
      'worklet';
      if (flowLastTs.value < 0) {
        flowLastTs.value = info.timestamp;
        return;
      }
      // dt 钳制：停帧恢复（reduceMotion 切换等）不产生大跳变
      const dt = Math.min(info.timestamp - flowLastTs.value, 100);
      flowLastTs.value = info.timestamp;
      flowClock.value += dt;
      const t = flowClock.value;
      for (let i = 0; i < geoChannels.length; i += 1) {
        const c = geoChannels[i];
        flowOffsets[i].value = -(c.o0 + ((t / c.duration) % 1) * c.period);
      }
    },
    flowActive,
  );

  /* 几何更新（实测尺寸就位）时同步静态种子位（时钟未启的 Reduce Motion 场景） */
  useEffect(() => {
    if (reduceMotion) {
      geoChannels.forEach((c, i) => {
        flowOffsets[i].value = -c.o0;
      });
    }
  }, [geoChannels, reduceMotion]);

  /* ── 入场分层编排（Motion Spec §3 / Motion Contract §5）：
     0-180ms 受光 / 80-320ms 主能量带 / 180-420ms 发丝·节点·粒子，
     整体 420ms cubic-bezier(0.22,1,0.36,1)；光场不得整帧弹出。
     Reduce Motion：单次 180ms 静态淡入，不分层。 ── */
  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: reduceMotion ? 180 : 420,
      easing: EASE_V12,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, entry]);

  /* 受光带呼吸:蓝/金独立超慢循环(±15%),光场"活着"但不制造注意脉冲 */
  const recvBreatheBlue = useRef(new Animated.Value(0)).current;
  const recvBreatheGold = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || frozen) {
      return;
    }
    const loops = [breatheLoop(recvBreatheBlue, 9000), breatheLoop(recvBreatheGold, 11000)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, frozen, recvBreatheBlue, recvBreatheGold]);
  const recvBlueStyle = {
    opacity: recvBreatheBlue.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
  };
  const recvGoldStyle = {
    opacity: recvBreatheGold.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
  };

  /* 热节点 alpha 呼吸（Motion Contract §8：节点可轻微呼吸不独立游走） */
  const nodeBreathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || frozen) {
      nodeBreathe.setValue(0.5);
      return;
    }
    const loop = breatheLoop(nodeBreathe, 4800);
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, frozen, nodeBreathe]);
  const nodeBreatheStyle = {
    opacity: nodeBreathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
  };

  const rampReceive = entry.interpolate({ inputRange: [0, 0.43, 1], outputRange: [0, 1, 1] });
  const rampPrimary = entry.interpolate({ inputRange: [0, 0.19, 0.76, 1], outputRange: [0, 0, 1, 1] });
  const rampDetail = entry.interpolate({ inputRange: [0, 0.43, 1], outputRange: [0, 0, 1] });

  /* ── StateStrength：1.00 → 0.80(260ms) → 0.62(280ms) 插值（2026-10 修订）；
     初值直接取首状态目标（入场渐显由 entry 承担，不双重渐入）；
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

  /* ── 鱼焦点（状态 2/3 的视觉主角）：OUTLINE 揭示 360ms；CLASSIFYING
     轮廓呼吸 0.36↔0.42/1900ms。Reduce Motion：180ms 揭示至静态中值。 ── */
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

        {/* ── AI Edge Field（统一 alpha 链：Base×IslandWeight 已烘焙进静态 alpha，
              StateStrength/入场分层/Resolve 由包裹层透明度承载） ── */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: strength }]} pointerEvents="none">
          {/* L2. Local Receiving Light：各岛贴边局部受光带（深 8-16% 柔渐隐，
              局部照明而非全幅色罩；条带只覆盖本岛活动区，Quiet Gaps 保持留白） */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampReceive }]} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, recvBlueStyle]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
              <Defs>
                {/* B_UR：顶缘右段 + 右缘上段（岛活动区 top x0.72-1 / right y0-0.42） */}
                <LinearGradient id={`rcBt${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.h * 0.2}>
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 1.0} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcBr${uid}`} gradientUnits="userSpaceOnUse" x1={size.w} y1="0" x2={size.w * 0.82} y2="0">
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 1.0} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                {/* B_LR：右缘下段（right y0.55-1）+ 底缘右段（bottom x0.5-1） */}
                <LinearGradient id={`rcBRr${uid}`} gradientUnits="userSpaceOnUse" x1={size.w} y1="0" x2={size.w * 0.81} y2="0">
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 0.54} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcBRb${uid}`} gradientUnits="userSpaceOnUse" x1={size.w} y1={size.h} x2={size.w * 0.78} y2={size.h * 0.84}>
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 0.5} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x={size.w * 0.58} y="0" width={size.w * 0.42} height={size.h * 0.2} fill={`url(#rcBt${uid})`} />
              <Rect x={size.w * 0.83} y="0" width={size.w * 0.17} height={size.h * 0.42} fill={`url(#rcBr${uid})`} />
              <Rect x={size.w * 0.84} y={size.h * 0.54} width={size.w * 0.16} height={size.h * 0.46} fill={`url(#rcBRr${uid})`} />
              <Rect x={size.w * 0.7} y={size.h * 0.86} width={size.w * 0.3} height={size.h * 0.14} fill={`url(#rcBRb${uid})`} />
            </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, recvGoldStyle]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
              <Defs>
                {/* G_UL：顶缘左段（top x0-0.30）+ 左缘上段（left y0-0.24）。
                    渐变必须定义在使用它的同一棵 Svg 树内(跨树 url(#id) 不解析) */}
                <LinearGradient id={`rcGt${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.h * 0.17}>
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.82} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcGl${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size.w * 0.17} y2="0">
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.82} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                {/* G_LL：左缘下段（left y0.62-1）+ 底缘左段（bottom x0-0.5） */}
                <LinearGradient id={`rcGLl${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={size.w * 0.17} y2="0">
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.68} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcGLb${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={size.h} x2={size.w * 0.8} y2={size.h * 0.82}>
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.78} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={size.w * 0.36} height={size.h * 0.17} fill={`url(#rcGt${uid})`} />
              <Rect x="0" y="0" width={size.w * 0.17} height={size.h * 0.28} fill={`url(#rcGl${uid})`} />
              <Rect x="0" y={size.h * 0.6} width={size.w * 0.16} height={size.h * 0.4} fill={`url(#rcGLl${uid})`} />
              <Rect x="0" y={size.h * 0.84} width={size.w * 0.78} height={size.h * 0.16} fill={`url(#rcGLb${uid})`} />
            </Svg>
            </Animated.View>
          </Animated.View>

          {/* L3/L4. 主彗星 + 丝线束 + 碎片段：主路径上是纤细的四层彗星
              （bloom → 暗尾 → 亮头柔光 → 亮头发丝），每角再散开
              3 内 + 1 外共 4 条伴生细丝（独立相位/视差速度）。 */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampPrimary }]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
              {geo.islands.map((f, i) => {
                const coreColor = f.blue ? AI_BLUE_HOT : AI_GOLD_HOT;
                const glowColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
                const offPrimary = flowOffsets[geo.idx.primary[i]];
                const offBright = flowOffsets[geo.idx.primaryBright[i]];
                return (
                  <React.Fragment key={f.id}>
                    {/* 极弱静态底衬：动效兜底（<0.15 权重，不读作边框） */}
                    <Path d={f.d} stroke={glowColor} strokeWidth={CARRIER_MID_DP} strokeOpacity={CARRIER_MID_A * f.weight} fill="none" strokeLinecap="round" />
                    <Path d={f.d} stroke={coreColor} strokeWidth={CARRIER_CORE_W} strokeOpacity={CARRIER_CORE_A * f.weight} fill="none" strokeLinecap="round" />
                    {/* 主彗星 · 大气扩散（罩整条彗星，减薄） */}
                    <FlowPath d={f.d} stroke={glowColor} strokeWidth={BLOOM_DP} strokeOpacity={BLOOM_A * f.weight} dash={f.streakDash} offset={offPrimary} />
                    {/* 主彗星 · 暗尾柔光带 */}
                    <FlowPath d={f.d} stroke={glowColor} strokeWidth={STREAK_MID_DP} strokeOpacity={STREAK_MID_A * f.weight} dash={f.streakDash} offset={offPrimary} />
                    {/* 主彗星 · 亮头（独立相位通道：亮头永远在暗尾前端） */}
                    <FlowPath d={f.d} stroke={glowColor} strokeWidth={BRIGHT_MID_DP} strokeOpacity={BRIGHT_MID_A * f.weight} dash={f.headDash} offset={offBright} />
                    <FlowPath d={f.d} stroke={coreColor} strokeWidth={f.core} strokeOpacity={BRIGHT_CORE_A * f.weight} dash={f.headDash} offset={offBright} />
                    {/* 丝线束：5 内 + 2 外共 8 条丝（近丝带柔晕光环，远丝纤细核心），
                        错相错速流动；外侧丝贴边、局部被屏幕裁切（关键帧 01） */}
                    {f.lanes.map((lane, li) => (
                      <React.Fragment key={`lane${f.id}${li}`}>
                        {LANES[li].glow && (
                          <FlowPath
                            d={lane.d}
                            stroke={glowColor}
                            strokeWidth={LANES[li].glowW}
                            strokeOpacity={LANES[li].glowA * f.weight}
                            dash={lane.dash}
                            offset={flowOffsets[geo.idx.lanes[i][li]]}
                          />
                        )}
                        <FlowPath
                          d={lane.d}
                          stroke={coreColor}
                          strokeWidth={LANES[li].coreW}
                          strokeOpacity={LANES[li].coreA * f.weight}
                          dash={lane.dash}
                          offset={flowOffsets[geo.idx.lanes[i][li]]}
                        />
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })}
              {geo.fragments.map((f, i) => {
                const coreColor = f.blue ? AI_BLUE_HOT : AI_GOLD_HOT;
                const glowColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
                return (
                  <React.Fragment key={`frag${i}`}>
                    <Path d={f.d} stroke={coreColor} strokeWidth={CARRIER_CORE_W} strokeOpacity={0.1 * f.weightMul} fill="none" strokeLinecap="round" />
                    <FlowPath d={f.d} stroke={glowColor} strokeWidth={FRAG_MID_DP} strokeOpacity={FRAG_MID_A * f.weightMul} dash={f.fragDash} offset={flowOffsets[geo.idx.fragment[i]]} />
                    <FlowPath d={f.d} stroke={coreColor} strokeWidth={f.core} strokeOpacity={FRAG_BRIGHT_A * f.weightMul} dash={f.fragDash} offset={flowOffsets[geo.idx.fragment[i]]} />
                    {/* 碎片伴生丝：中带/底带也成束 */}
                    <FlowPath d={f.laneD} stroke={glowColor} strokeWidth={FRAG_LANE.glowW} strokeOpacity={FRAG_LANE.glowA * f.weightMul} dash={f.laneDash} offset={flowOffsets[geo.idx.fragmentLane[i]]} />
                    <FlowPath d={f.laneD} stroke={coreColor} strokeWidth={FRAG_LANE.coreW} strokeOpacity={FRAG_LANE.coreA * f.weightMul} dash={f.laneDash} offset={flowOffsets[geo.idx.fragmentLane[i]]} />
                  </React.Fragment>
                );
              })}
            </Svg>
          </Animated.View>

          {/* L4.5. 热节点亮尖（入场 180-420ms 加入）：
              B_UR 主节点 / G_UL 弱副节点，alpha 轻微呼吸（Motion Contract §8） */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampDetail }]} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, nodeBreatheStyle]} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
                {geo.islands.map((f, i) => {
                  const chan = geo.idx.nodeHead[i];
                  return f.node && chan >= 0 ? (
                    <FlowPath
                      key={`node${f.id}`}
                      d={f.d}
                      stroke={f.blue ? AI_BLUE_HOT : AI_GOLD_HOT}
                      strokeWidth={f.core + 0.5}
                      strokeOpacity={HEAD_A * (f.node === 'main' ? 1 : 0.55)}
                      dash={`${f.nodeLen.toFixed(1)} ${f.length.toFixed(1)}`}
                      offset={flowOffsets[chan]}
                    />
                  ) : null;
                })}
              </Svg>
            </Animated.View>
          </Animated.View>

          {/* L5. 稀疏粒子（10 颗：慢速局部漂移 + 缓闪烁；Reduce Motion 关闭粒子） */}
          {!reduceMotion &&
            PARTICLES.map((p) => (
              <DustGlyph key={p.key} gid={`d${uid}${p.key}`} anchor={p} frozen={frozen} w={size.w} h={size.h} />
            ))}
        </Animated.View>

        {/* L6. 鱼焦点（状态 2/3 视觉主角，不随 Edge Field 强度链）。
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

/* ─── 稀疏粒子：确定性锚位 + 小幅局部漂移 + 正弦缓闪（3.2-5.5s） ─────────────── */

interface DustAnchor {
  key: string;
  x: number;
  y: number;
  size: number;
  gold: boolean;
  hot: boolean;
  stagger: number;
  pulseMs: number;
  driftAmp: number;
}

const DustGlyph: React.FC<{ gid: string; anchor: DustAnchor; frozen: boolean; w: number; h: number }> = ({
  gid,
  anchor,
  frozen,
  w,
  h,
}) => {
  const left = anchor.x * w;
  const top = anchor.y * h;
  /* 峰值 α：热粒 0.68 / 常规 0.52（2026-10 饱满度修订，微升） */
  const peakAlpha = anchor.hot ? 0.68 : 0.52;

  const floatX = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    if (frozen) {
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const anims: Animated.CompositeAnimation[] = [
      breatheLoop(floatX, 5000 + (anchor.stagger % 1100)),
      breatheLoop(floatY, 5600 + (anchor.stagger % 1300)),
      breatheLoop(pulse, anchor.pulseMs),
    ];
    timers.push(setTimeout(() => anims[0].start(), anchor.stagger % 2200));
    anims[1].start();
    anims[2].start();
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.stop());
    };
  }, [frozen, floatX, floatY, pulse, anchor.stagger, anchor.pulseMs]);

  const tx = floatX.interpolate({ inputRange: [0, 1], outputRange: [0, anchor.driftAmp] });
  const ty = floatY.interpolate({ inputRange: [0, 1], outputRange: [0, anchor.driftAmp] });
  const alpha = pulse.interpolate({ inputRange: [0.2, 1], outputRange: [peakAlpha * 0.3, peakAlpha] });
  const twinkle = pulse.interpolate({ inputRange: [0.2, 1], outputRange: [0.85, 1.12] });

  const color = anchor.gold ? AI_GOLD_HOT : AI_BLUE_HOT;
  /* 1-2dp 常规 / 3-4dp 热粒 + 小辉光 */
  const glow = anchor.size * 3.4;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: left - glow / 2,
        top: top - glow / 2,
        width: glow,
        height: glow,
        /* 冻结 = 停止动画(值停在当前位置)。transform/opacity 的「值类型」必须
           恒定:运行中把 transform 从数组切成 undefined 会在 Android 侧经
           processTransform(null) 抛 "Cannot read property 'forEach' of null"。 */
        opacity: alpha,
        transform: [{ translateX: tx }, { translateY: ty }, { scale: twinkle }],
      }}
      pointerEvents="none"
    >
      <Svg width={glow} height={glow}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
            <Stop offset="0.22" stopColor={color} stopOpacity={anchor.hot ? 0.85 : 0.7} />
            <Stop offset="0.45" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  photo: { width: '100%', height: '100%' } as ImageStyle,
  /* BG_CAPTURE 无照片兜底：背景系统 V1 冻结值 #102D35 */
  noPhoto: { backgroundColor: '#102D35' } as ViewStyle,
});
