import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageStyle,
  StyleSheet,
  View,
  ViewStyle,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * AIAmbientField —— 识别处理页环境层（V1.2 冻结设计）。
 *
 * 权威文档（design/pages/recognition，DESIGN FROZEN）：
 *   · Recognition_Design_Closure_V1_2.md —— 三状态产品模型
 *   · spec/Recognition_State_Timeline_Spec_V1_3.md —— 图片识别中 → 已定位到鱼体 → 鱼种识别中
 *   · processing/motion/Recognition_Processing_Motion_Spec_V1_2.md —— 节拍/强度/速度
 *   · processing/motion/AI_Edge_Field_V1_Motion_Contract.md —— 连续时钟
 *   · processing/components/AI_Edge_Field_V1_Static_Shape_Spec.md —— 四能量岛拓扑
 *   · processing/components/AI_Edge_Field_V1_Rendering_Contract.md —— 光学堆叠/统一 alpha 链
 *   · processing/spec/Recognition_Processing_Visual_Spec_V1_1.md —— 色彩令牌/鱼焦点几何
 *   · processing/accessibility/Recognition_Reduce_Motion_V1.md —— 减弱动态
 *
 * 三状态（V1.2 State Timeline，恰好三个用户可见状态）：
 *   图片识别中 ≥900ms（StateStrength 1.00 / 段速 1.00×）
 *   → 已定位到鱼体 ≥600ms（0.58 / 0.62×；插值 260ms）
 *   → 鱼种识别中 ≥1250ms（0.36 / 0.42×；插值 280ms）
 *   → RESOLVE 200ms（冻结段位、停粒子，ResolveStrength=(1-p)² 整体淡出）
 *
 * AI Edge Field：不是围绕照片的边框，而是从边缘局部生长的 4 个断开的
 * 蓝/金能量岛（B_UR 右上蓝 / G_UL 左上金 / B_LR 右下蓝 / G_LL 左下金），
 * 岛间 Quiet Gaps 强制留白；B2/G2/B4 仅为弱短碎片，不得连成边框。
 * 每岛 = 1 条主能量带（10dp 外bloom + 4dp 中辉 + 热色发丝核心）+
 * 1 条伴生发丝；仅 B_UR 额外 1 条微发丝 + 1 个热节点（全屏至多再加 1 个弱节点）。
 *
 * 统一 alpha 链（Rendering Contract §6）：
 *   FinalLayerAlpha = Base × IslandWeight × StateStrength × ResolveStrength × 入场分层
 * 岛权重（不对称，B_UR 唯一主导）：B_UR 1.00 / G_UL 0.77 / G_LL 0.63 / B_LR 0.54
 *
 * 行进：10s 基准时钟连续积分（状态切换只变速/变强，绝不重启时钟或跳段位）。
 * 入场：420ms 分层建立（0-180ms 受光 / 80-320ms 主能量带 / 180-420ms 发丝·节点·粒子）。
 * Reduce Motion：静态呈现于冻结种子位、粒子关闭、鱼焦点 180ms 揭示至 0.15/0.39。
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

/** StateStrength / SegmentSpeed 冻结目标（Motion Contract §4 / §2） */
export const AI_STATE_STRENGTH: Record<AIPhase, number> = {
  imageRecognizing: 1.0,
  fishLocated: 0.58,
  speciesRecognizing: 0.36,
};
/** 状态段速目标（Motion Spec V1.2；真机兼容性取舍：变速未启用，由亮度承载叙事） */
const SEGMENT_SPEED: Record<AIPhase, number> = {
  imageRecognizing: 1.0,
  fishLocated: 0.62,
  speciesRecognizing: 0.42,
};
void SEGMENT_SPEED;
/** 状态过渡插值时长（Motion Spec V1.2 §4） */
const TRANSITION_MS: Record<AIPhase, number> = {
  imageRecognizing: 420,
  fishLocated: 260,
  speciesRecognizing: 280,
};
/** V1.2 统一缓动 cubic-bezier(0.22, 1, 0.36, 1) */
const EASE_V12 = Easing.bezier(0.22, 1, 0.36, 1);

/* ─── 四主岛 + 三碎片：冻结贝塞尔（归一化坐标，Static Shape Spec §14 既有路径身份） ─── */
type Cubic = [number, number, number, number, number, number, number, number];

interface IslandDef {
  id: 'BUR' | 'GUL' | 'BLR' | 'GLL';
  pts: Cubic;
  /** 发丝核心线宽（Rendering Contract §4.4，各路径专属不归一） */
  core: number;
  /** 行进种子（Motion Contract §2 Primary seeds） */
  seed: number;
  /** 可见段占自路径长度比（Motion Contract §2 Visible segment length） */
  segLen: number;
  /** 岛权重（Rendering Contract §6，B_UR 唯一主导） */
  weight: number;
  blue: boolean;
  /** 伴生发丝相位差（Motion Contract §3 Companion phase delta） */
  companionDelta: number;
  /** 伴生发丝偏置侧（法线方向符号） */
  companionSide: 1 | -1;
  /** 仅 B_UR：微发丝相位差 +0.085 */
  micro?: boolean;
  /** B_UR 主热节点；G_LL 唯一弱副节点 */
  node?: 'main' | 'weak';
}

const ISLANDS: IslandDef[] = [
  // B1 · 右上蓝岛（全屏唯一主导光场）
  {
    id: 'BUR', pts: [0.78, -0.02, 0.94, 0.06, 1.02, 0.22, 0.96, 0.42],
    core: 1.4, seed: 0.0, segLen: 0.45, weight: 1.0, blue: true,
    companionDelta: -0.055, companionSide: 1, micro: true, node: 'main',
  },
  // G1 · 左上金岛
  {
    id: 'GUL', pts: [-0.02, 0.18, 0.03, 0.08, 0.12, 0.02, 0.26, -0.02],
    core: 1.3, seed: 0.12, segLen: 0.39, weight: 0.82, blue: false,
    companionDelta: 0.065, companionSide: 1,
  },
  // B3 · 右下蓝岛（最弱主岛，权重取冻结区间 0.48-0.60 上限）
  {
    id: 'BLR', pts: [1.02, 0.61, 0.92, 0.75, 0.84, 0.89, 0.66, 1.02],
    core: 1.4, seed: 0.47, segLen: 0.3, weight: 0.6, blue: true,
    companionDelta: -0.06, companionSide: -1,
  },
  // G3 · 左下金岛（权重取冻结区间 0.58-0.68 上限，保证四岛在场感）
  {
    id: 'GLL', pts: [-0.01, 0.74, 0.08, 0.86, 0.2, 0.95, 0.38, 1.02],
    core: 1.4, seed: 0.64, segLen: 0.33, weight: 0.68, blue: false,
    companionDelta: 0.05, companionSide: 1, node: 'weak',
  },
];

/** 次级碎片（Static Shape Spec §5：仅弱短碎片，禁止连岛成框；相位避开 Quiet Gaps） */
const FRAGMENTS: { pts: Cubic; core: number; phase: number; segLen: number; weightMul: number; blue: boolean }[] = [
  { pts: [1.01, 0.18, 0.92, 0.31, 0.95, 0.52, 1.02, 0.68], core: 1.2, phase: 0.23, segLen: 0.12, weightMul: 0.45, blue: true }, // B2 右中
  { pts: [-0.02, 0.33, 0.04, 0.47, 0.02, 0.62, -0.01, 0.78], core: 1.1, phase: 0.88, segLen: 0.11, weightMul: 0.4, blue: false }, // G2 左中
  { pts: [0.22, 1.02, 0.38, 0.95, 0.52, 0.95, 0.66, 1.01], core: 1.0, phase: 0.92, segLen: 0.12, weightMul: 0.38, blue: true }, // B4 底部
];

/* ─── 光学堆叠亮度（对齐冻结关键帧 PNG 的实际观感：金边清晰、科技光感明确。
     拓扑/层级仍按 Rendering Contract：三层同轴、岛权重不对称、金左蓝右） ─── */
const OUTER_DP = 12;   // Primary Outer Bloom（大气扩散）
const OUTER_A = 0.16;
const MID_DP = 5;      // Primary Mid Glow（柔光带）
const MID_A = 0.32;
const CORE_A = 0.75;   // 热色发丝核心（×岛权重：B_UR 0.75 / G_UL 0.61 / G_LL 0.51 / B_LR 0.45）
const HEAD_A = 0.78;   // B_UR 主热节点；弱副节点减半
const RECV_A = 0.16;   // 边缘受光带（关键帧四角光感）
/** 伴生发丝（局部回声：更细更暗，变距偏置非平行双轨） */
const HAIR_CORE_W = 0.6;
const HAIR_GLOW_W = 2.4;
const HAIR_RATIO = 0.35;
const HAIR_SEG_RATIO = 0.4; // 可见长 25-55% 主岛跨度
/** 微发丝（仅 B_UR） */
const MICRO_CORE_W = 0.45;
const MICRO_GLOW_W = 1.8;
const MICRO_RATIO = 0.22;
const MICRO_SEG_RATIO = 0.24;
/** 热节点亮头长度 */
const HEAD_MAX_PX = 20;
const HEAD_FRACTION = 0.32;
/** 行进基准时钟（10s 契约区间内取更易感知的节奏） */
const LOOP_MS = 5000;

/** 鱼焦点暂缓开关（用户 2026-10:中间鱼体亮光先不实现;真实 bbox 接入后开启） */
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

/** 预计算：SVG d 串、近似弧长、dash 周期 */
function buildPath(pts: Cubic) {
  const SAMPLES = 48;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const [x, y] = sampleCubic(pts, i / SAMPLES);
    xs.push(x * SCREEN_W);
    ys.push(y * SCREEN_H);
  }
  let length = 0;
  for (let i = 1; i <= SAMPLES; i++) {
    length += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const X = (x: number) => (x * SCREEN_W).toFixed(1);
  const Y = (y: number) => (y * SCREEN_H).toFixed(1);
  const d = `M ${X(pts[0])} ${Y(pts[1])} C ${X(pts[2])} ${Y(pts[3])}, ${X(pts[4])} ${Y(pts[5])}, ${X(pts[6])} ${Y(pts[7])}`;
  return { d, length };
}

/**
 * 伴生/微发丝几何：沿主路径法线偏置 4-10dp（伴生）/ 7-14dp（微），
 * 偏距随 t 正弦变化（禁止恒定平行间距），起点终点与主带错开。
 */
function buildHairline(pts: Cubic, side: 1 | -1, baseOffset: number, amp: number) {
  const SAMPLES = 32;
  let d = '';
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const [x, y] = sampleCubic(pts, t);
    const [nx, ny] = sampleCubic(pts, Math.min(1, t + 0.01));
    let tx = (nx - x) * SCREEN_W;
    let ty = (ny - y) * SCREEN_H;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // 法线（指向照片内侧或外侧由 side 决定）；偏距沿曲线变化
    const offset = side * (baseOffset + amp * Math.sin(t * Math.PI * 1.35 + 0.6));
    const px = x * SCREEN_W - ty * offset;
    const py = y * SCREEN_H + tx * offset;
    d += `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  return d;
}

/**
 * 稀疏粒子（Visual Spec「Particles」：常规 8 颗；1-2dp 常规 / 3-4dp 热；
 * 峰值 α≤0.35 / 热≤0.50；慢速局部漂移，绝不似彩纸屑）。
 * 锚位贴四岛边缘带（避开 Quiet Gaps），蓝右金左。
 */
const PARTICLES = [
  { x: 0.9, y: 0.13, size: 3.2, gold: false, hot: true },   // B_UR 热粒
  { x: 0.81, y: 0.3, size: 2.1, gold: false, hot: false },
  { x: 0.12, y: 0.09, size: 2.2, gold: true, hot: false },  // G_UL
  { x: 0.21, y: 0.2, size: 2.0, gold: true, hot: false },
  { x: 0.88, y: 0.79, size: 2.0, gold: false, hot: false }, // B_LR
  { x: 0.75, y: 0.92, size: 1.9, gold: false, hot: false },
  { x: 0.09, y: 0.87, size: 2.1, gold: true, hot: false },  // G_LL
  { x: 0.27, y: 0.94, size: 1.9, gold: true, hot: false },
].map((p, i) => ({
  ...p,
  key: `dust${i}`,
  stagger: i * 467,
  pulseMs: 3200 + ((i * 379) % 2300),
  driftAmp: 9 + ((i * 13) % 8),
}));

/** 读取 Animated.Value 当前值（JS 驱动下 _value 实时可用） */
function readAnimated(v: Animated.Value): number {
  return (v as unknown as { __getValue: () => number }).__getValue();
}

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

const AnimatedPath = Animated.createAnimatedComponent(Path);

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
}

export const AIAmbientField: React.FC<AIAmbientFieldProps> = ({
  phase,
  photoUri,
  fishFocus = { cx: 0.5, cy: 0.42, halfW: 0.3, halfH: 0.1 },
  resolveOpacity = 1,
  frozen = false,
}) => {
  const { reduceMotion } = useTheme();
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  /* ── 几何预计算：主岛（主带 + 伴生发丝 + B_UR 微发丝）与碎片 ── */
  const islands = useMemo(
    () =>
      ISLANDS.map((f) => {
        const geo = buildPath(f.pts);
        const dashLen = f.segLen * geo.length;
        const period = dashLen + geo.length;
        const hairD = buildHairline(f.pts, f.companionSide, 7, 3); // 4-10dp 变化偏置
        const hairDash = dashLen * HAIR_SEG_RATIO;
        const headLen = Math.min(HEAD_MAX_PX, dashLen * HEAD_FRACTION);
        return {
          ...f,
          ...geo,
          dashLen,
          period,
          hairD,
          hairDash,
          hairPeriod: hairDash + geo.length,
          microD: f.micro ? buildHairline(f.pts, (f.companionSide * -1) as 1 | -1, 11, 3) : null, // 7-14dp 另一侧
          microDash: dashLen * MICRO_SEG_RATIO,
          microPeriod: dashLen * MICRO_SEG_RATIO + geo.length,
          headLen,
          headShift: dashLen - headLen,
        };
      }),
    [],
  );
  const fragments = useMemo(
    () =>
      FRAGMENTS.map((f) => {
        const geo = buildPath(f.pts);
        const dashLen = f.segLen * geo.length;
        return { ...f, ...geo, dashLen, period: dashLen + geo.length };
      }),
    [],
  );

  /* ── 连续行进时钟：10s 基准 + 状态速度乘子。
     自链式逐周期 timing：每周期线性匀速（基时钟语义），从当前值续接；
     状态切换只换周期时长（变速），绝不重置相位或跳段位。
     Reduce Motion / frozen：不起时钟，静态停于冻结种子位。 ── */
  const travel = useMemo(() => {
    const make = (offset: number) => new Animated.Value(-offset);
    return {
      primary: islands.map((f) => make(f.seed * f.period)),
      echo: islands.map((f) => make((f.seed + 0.5) * f.period)),
      hair: islands.map((f) => make((f.seed + f.companionDelta) * f.hairPeriod)),
      micro: islands.map((f) => (f.micro ? make((f.seed + 0.085) * f.microPeriod) : null)),
      // 热节点亮头：主段行进方向前端的短亮段（偏移 = 主段偏移 - headShift）
      nodeHead: islands.map((f) => (f.node ? make(f.seed * f.period + f.headShift) : null)),
      fragment: fragments.map((f) => make(f.phase * f.period)),
    };
  }, [islands, fragments]);

  useEffect(() => {
    if (reduceMotion || frozen) {
      return;
    }
    /* 真机结论（RN0.83+Fabric+react-native-svg 15.x）：流光动画只有
       Animated.loop 驱动在真机上可见（链式逐周期 timing 两轮真机均不可见）。
       因此这里用 loop 并「一次性创建、状态变速不重启」——
       resetBeforeIteration 每轮把值复位到本轮起点，-period ≡ 0 (mod period)，
       虚线周期使视觉位置无缝衔接；不重启则没有变速复位跳变。
       代价：状态间 0.62×/0.42× 变速叙事由 StateStrength 亮度承载。 */
    const loops: Animated.CompositeAnimation[] = [];
    const run = (v: Animated.Value, period: number) => {
      const l = Animated.loop(
        Animated.timing(v, {
          toValue: readAnimated(v) - period,
          duration: LOOP_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      );
      l.start();
      loops.push(l);
    };
    islands.forEach((f, i) => {
      run(travel.primary[i], f.period);
      run(travel.echo[i], f.period);
      run(travel.hair[i], f.hairPeriod);
      if (travel.micro[i]) {
        run(travel.micro[i]!, f.microPeriod);
      }
      if (travel.nodeHead[i]) {
        run(travel.nodeHead[i]!, f.period);
      }
    });
    fragments.forEach((f, i) => run(travel.fragment[i], f.period));
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, frozen, islands, fragments, travel]);

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

  const rampReceive = entry.interpolate({ inputRange: [0, 0.43, 1], outputRange: [0, 1, 1] });
  const rampPrimary = entry.interpolate({ inputRange: [0, 0.19, 0.76, 1], outputRange: [0, 0, 1, 1] });
  const rampDetail = entry.interpolate({ inputRange: [0, 0.43, 1], outputRange: [0, 0, 1] });

  /* ── StateStrength：1.00 → 0.58(260ms) → 0.36(280ms) 插值（V1.2 §4）；
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

  /* ── 鱼焦点（状态 2/3 的视觉主角）：OUTLINE 揭示 360ms（V1.2 权重交接：
     Edge Field ↓ / Fish Focus ↑）；CLASSIFYING 轮廓呼吸 0.36↔0.42/1900ms。
     Reduce Motion：180ms 揭示至静态中值 halo 0.15 / contour 0.39，无呼吸。 ── */
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

  const frx = fishFocus.halfW * 2 * SCREEN_W * 0.62 + 14;
  const fry = fishFocus.halfH * 2 * SCREEN_H * 0.72 + 14;
  const fcx = fishFocus.cx * SCREEN_W;
  const fcy = fishFocus.cy * SCREEN_H;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* L1. 全屏照片：立即可见、cover、无处理色罩（照片始终视觉主导） */}
      {photoUri ? (
        <Image source={{ uri: photoUri }} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.photo]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPhoto]} />
      )}

      {/* L2-L7 收场淡出层（照片不随淡出） */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: resolveOpacity }]} pointerEvents="none">
        {/* 中性暗角：中心 55% 完全不动、仅压暗外围（亮景可读性，非色彩罩） */}
        <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
          <Defs>
            <RadialGradient id={`vig${uid}`} cx="50%" cy="46%" rx="50%" ry="50%">
              <Stop offset="0.55" stopColor={VIGNETTE_COLOR} stopOpacity="0" />
              <Stop offset="0.8" stopColor={VIGNETTE_COLOR} stopOpacity="0.22" />
              <Stop offset="1" stopColor={VIGNETTE_COLOR} stopOpacity="0.46" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={SCREEN_W} height={SCREEN_H} fill={`url(#vig${uid})`} />
        </Svg>

        {/* L3a. 四岛常驻底线（金/蓝边缘弧线）：静态路径、不依赖任何动画驱动，
            直接挂在收场淡出层下——无论上层动效状态如何，边框线始终可见。
            饱和核心色保色相；不随 StateStrength 衰减（状态叙事由流动亮段承载）。 */}
        <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
          {islands.map((f) => {
            const lineColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
            return (
              <React.Fragment key={`base${f.id}`}>
                <Path d={f.d} stroke={lineColor} strokeWidth={MID_DP * 1.3} strokeOpacity={0.26 * f.weight + 0.12} fill="none" strokeLinecap="round" />
                <Path d={f.d} stroke={lineColor} strokeWidth={f.core} strokeOpacity={0.6 * f.weight + 0.22} fill="none" strokeLinecap="round" />
              </React.Fragment>
            );
          })}
        </Svg>

        {/* ── AI Edge Field（统一 alpha 链：Base×IslandWeight 已烘焙进静态 alpha，
              StateStrength/入场分层/Resolve 由包裹层透明度承载） ── */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: strength }]} pointerEvents="none">
          {/* L2. Local Receiving Light：各岛贴边局部受光带（深 8-16% 柔渐隐，
              局部照明而非全幅色罩；条带只覆盖本岛活动区，Quiet Gaps 保持留白） */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampReceive }]} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, recvBlueStyle]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
              <Defs>
                {/* B_UR：顶缘右段 + 右缘上段（岛活动区 top x0.72-1 / right y0-0.42） */}
                <LinearGradient id={`rcBt${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={SCREEN_H * 0.16}>
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 1.0} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcBr${uid}`} gradientUnits="userSpaceOnUse" x1={SCREEN_W} y1="0" x2={SCREEN_W * 0.84} y2="0">
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 1.0} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                {/* B_LR：右缘下段（right y0.62-1）+ 底缘右段（bottom x0.64-1） */}
                <LinearGradient id={`rcBRr${uid}`} gradientUnits="userSpaceOnUse" x1={SCREEN_W} y1="0" x2={SCREEN_W * 0.85} y2="0">
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 0.54} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcBRb${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={SCREEN_H} x2="0" y2={SCREEN_H * 0.86}>
                  <Stop offset="0" stopColor={AI_BLUE_CORE} stopOpacity={RECV_A * 0.54} />
                  <Stop offset="1" stopColor={AI_BLUE_CORE} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x={SCREEN_W * 0.58} y="0" width={SCREEN_W * 0.42} height={SCREEN_H * 0.16} fill={`url(#rcBt${uid})`} />
              <Rect x={SCREEN_W * 0.84} y="0" width={SCREEN_W * 0.16} height={SCREEN_H * 0.42} fill={`url(#rcBr${uid})`} />
              <Rect x={SCREEN_W * 0.85} y={SCREEN_H * 0.58} width={SCREEN_W * 0.15} height={SCREEN_H * 0.42} fill={`url(#rcBRr${uid})`} />
              <Rect x={SCREEN_W * 0.6} y={SCREEN_H * 0.86} width={SCREEN_W * 0.4} height={SCREEN_H * 0.14} fill={`url(#rcBRb${uid})`} />
            </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, recvGoldStyle]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
              <Defs>
                {/* G_UL：顶缘左段（top x0-0.30）+ 左缘上段（left y0-0.24）。
                    渐变必须定义在使用它的同一棵 Svg 树内(跨树 url(#id) 不解析) */}
                <LinearGradient id={`rcGt${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={SCREEN_H * 0.14}>
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.82} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcGl${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={SCREEN_W * 0.16} y2="0">
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.82} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcGLl${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={SCREEN_W * 0.15} y2="0">
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.68} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`rcGLb${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={SCREEN_H} x2="0" y2={SCREEN_H * 0.85}>
                  <Stop offset="0" stopColor={AI_GOLD_CORE} stopOpacity={RECV_A * 0.68} />
                  <Stop offset="1" stopColor={AI_GOLD_CORE} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={SCREEN_W * 0.35} height={SCREEN_H * 0.14} fill={`url(#rcGt${uid})`} />
              <Rect x="0" y="0" width={SCREEN_W * 0.16} height={SCREEN_H * 0.26} fill={`url(#rcGl${uid})`} />
              <Rect x="0" y={SCREEN_H * 0.66} width={SCREEN_W * 0.15} height={SCREEN_H * 0.34} fill={`url(#rcGLl${uid})`} />
              <Rect x="0" y={SCREEN_H * 0.85} width={SCREEN_W * 0.42} height={SCREEN_H * 0.15} fill={`url(#rcGLb${uid})`} />
            </Svg>
            </Animated.View>
          </Animated.View>

          {/* L3/L4. 主能量带 + 次级碎片：仅渲染行进中的可见段（关键段规则），
              三层同中轴线：10dp 外bloom + 4dp 中辉 + 热色发丝核心 */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampPrimary }]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
              {islands.map((f, i) => {
                const coreColor = f.blue ? AI_BLUE_HOT : AI_GOLD_HOT;
                const glowColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
                const dash = `${f.dashLen.toFixed(1)} ${f.period.toFixed(1)}`;
                return (
                  <React.Fragment key={f.id}>
                    {/* Outer Bloom：10dp 大气扩散（最弱） */}
                    <AnimatedPath
                      d={f.d}
                      stroke={glowColor}
                      strokeWidth={OUTER_DP}
                      strokeOpacity={OUTER_A * f.weight}
                      strokeDasharray={dash}
                      strokeDashoffset={travel.primary[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Mid Glow：4dp 柔光带 */}
                    <AnimatedPath
                      d={f.d}
                      stroke={glowColor}
                      strokeWidth={MID_DP}
                      strokeOpacity={MID_A * f.weight}
                      strokeDasharray={dash}
                      strokeDashoffset={travel.primary[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* Primary Core：热色发丝（各路径专属线宽） */}
                    <AnimatedPath
                      d={f.d}
                      stroke={coreColor}
                      strokeWidth={f.core}
                      strokeOpacity={CORE_A * f.weight}
                      strokeDasharray={dash}
                      strokeDashoffset={travel.primary[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {/* 回声亮段：与主段错开半周期（延续性——弧线上始终有流光） */}
                    <AnimatedPath
                      d={f.d}
                      stroke={coreColor}
                      strokeWidth={f.core * 0.85}
                      strokeOpacity={CORE_A * f.weight * 0.6}
                      strokeDasharray={`${(f.dashLen * 0.55).toFixed(1)} ${f.period.toFixed(1)}`}
                      strokeDashoffset={travel.echo[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </React.Fragment>
                );
              })}
              {fragments.map((f, i) => {
                const coreColor = f.blue ? AI_BLUE_HOT : AI_GOLD_HOT;
                const glowColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
                const dash = `${f.dashLen.toFixed(1)} ${f.period.toFixed(1)}`;
                return (
                  <React.Fragment key={`frag${i}`}>
                    <Path d={f.d} stroke={glowColor} strokeWidth={MID_DP} strokeOpacity={MID_A * f.weightMul * 0.5} fill="none" strokeLinecap="round" />
                    <Path d={f.d} stroke={coreColor} strokeWidth={f.core} strokeOpacity={CORE_A * f.weightMul * 0.35} fill="none" strokeLinecap="round" />
                    <AnimatedPath
                      d={f.d}
                      stroke={glowColor}
                      strokeWidth={MID_DP}
                      strokeOpacity={MID_A * f.weightMul * 0.7}
                      strokeDasharray={dash}
                      strokeDashoffset={travel.fragment[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                    <AnimatedPath
                      d={f.d}
                      stroke={coreColor}
                      strokeWidth={f.core}
                      strokeOpacity={CORE_A * f.weightMul * 0.55}
                      strokeDasharray={dash}
                      strokeDashoffset={travel.fragment[i] as unknown as number}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
          </Animated.View>

          {/* L4.5. 发丝细节 + 热节点（入场 180-420ms 加入）：伴生/微发丝是主带的
              局部回声（更短更细更暗，变距偏置非平行双轨），非第二条主线；
              Reduce Motion 下保持静态可见（ReduceMotion §4） */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? entry : rampDetail }]} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
                {islands.map((f, i) => {
                  const coreColor = f.blue ? AI_BLUE_HOT : AI_GOLD_HOT;
                  const glowColor = f.blue ? AI_BLUE_CORE : AI_GOLD_CORE;
                  const hairDash = `${f.hairDash.toFixed(1)} ${f.hairPeriod.toFixed(1)}`;
                  return (
                    <React.Fragment key={`hair${f.id}`}>
                      {/* 伴生发丝：辉光 + 核心，无 10dp 外bloom */}
                      <AnimatedPath
                        d={f.hairD}
                        stroke={glowColor}
                        strokeWidth={HAIR_GLOW_W}
                        strokeOpacity={MID_A * f.weight * HAIR_RATIO * 1.2}
                        strokeDasharray={hairDash}
                        strokeDashoffset={travel.hair[i] as unknown as number}
                        fill="none"
                        strokeLinecap="round"
                      />
                      <AnimatedPath
                        d={f.hairD}
                        stroke={coreColor}
                        strokeWidth={HAIR_CORE_W}
                        strokeOpacity={CORE_A * f.weight * HAIR_RATIO}
                        strokeDasharray={hairDash}
                        strokeDashoffset={travel.hair[i] as unknown as number}
                        fill="none"
                        strokeLinecap="round"
                      />
                      {/* B_UR 微发丝（唯一允许的第二条伴生轨迹） */}
                      {f.micro && travel.micro[i] && (
                        <>
                          <AnimatedPath
                            d={f.microD!}
                            stroke={glowColor}
                            strokeWidth={MICRO_GLOW_W}
                            strokeOpacity={MID_A * f.weight * MICRO_RATIO * 1.2}
                            strokeDasharray={`${f.microDash.toFixed(1)} ${f.microPeriod.toFixed(1)}`}
                            strokeDashoffset={travel.micro[i]! as unknown as number}
                            fill="none"
                            strokeLinecap="round"
                          />
                          <AnimatedPath
                            d={f.microD!}
                            stroke={coreColor}
                            strokeWidth={MICRO_CORE_W}
                            strokeOpacity={CORE_A * f.weight * MICRO_RATIO}
                            strokeDasharray={`${f.microDash.toFixed(1)} ${f.microPeriod.toFixed(1)}`}
                            strokeDashoffset={travel.micro[i]! as unknown as number}
                            fill="none"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                      {/* 热节点亮头：主段行进方向前端的短亮段（B_UR 主节点 / G_LL 弱副节点） */}
                      {f.node && travel.nodeHead[i] && (
                        <AnimatedPath
                          d={f.d}
                          stroke={coreColor}
                          strokeWidth={f.core + 0.6}
                          strokeOpacity={HEAD_A * (f.node === 'main' ? 1 : 0.5)}
                          strokeDasharray={`${f.headLen.toFixed(1)} ${f.period.toFixed(1)}`}
                          strokeDashoffset={travel.nodeHead[i]! as unknown as number}
                          fill="none"
                          strokeLinecap="round"
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </Svg>
          </Animated.View>

          {/* L5. 稀疏粒子（8 颗：慢速局部漂移 + 缓闪烁；Reduce Motion 关闭粒子） */}
          {!reduceMotion &&
            PARTICLES.map((p) => (
              <DustGlyph key={p.key} gid={`d${uid}${p.key}`} anchor={p} frozen={frozen} />
            ))}
        </Animated.View>

        {/* L6. 鱼焦点（状态 2/3 视觉主角，不随 Edge Field 强度链）。
            用户要求先不实现 —— 待原生检测 bbox 事件接入后置 true 启用
            （届时用真实 bbox 映射替换中心偏置兜底）。 */}
        {SHOW_FISH_FOCUS && focusActive && (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: haloAlpha }]} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
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
              <Svg style={StyleSheet.absoluteFill} width={SCREEN_W} height={SCREEN_H} pointerEvents="none">
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

const DustGlyph: React.FC<{ gid: string; anchor: DustAnchor; frozen: boolean }> = ({
  gid,
  anchor,
  frozen,
}) => {
  const left = anchor.x * SCREEN_W;
  const top = anchor.y * SCREEN_H;
  /* 峰值 α：热粒 ≤0.50 / 常规 ≤0.35（Visual Spec Particles） */
  const peakAlpha = anchor.hot ? 0.62 : 0.46;

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
