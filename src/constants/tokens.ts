import { PixelRatio, Platform } from 'react-native';
import { coreRadius, PAGE_MARGIN } from './coreUi';

/**
 * 渔见 Design Tokens。
 * 视觉权威：design/system/core_visual_v1（Core Visual System V1 · FROZEN），
 * 动作青系来自 Action Button V1.1 / Text Action V1 / Icon Action V1 冻结合同；
 * 共享 token 与组件层（constants/coreUi.ts）保持一致，页面不得自造近似值。
 */

// ---------------------------------------------------------------------------
// 全局字号缩放（唯一调节入口）
// ---------------------------------------------------------------------------

/** 系统字体放大（华为等机型“字体大小/显示大小”默认偏大时 > 1），封顶 1 不让系统再放大 */
const systemFontScale = Math.max(1, PixelRatio.getFontScale());

/** 全局字号收紧系数：整体偏大收紧一点；Android 默认字体视觉更粗更大，收得略多 */
const FONT_SCALE = Platform.select({ ios: 0.92, android: 0.88, default: 0.9 });

/**
 * 统一字号出口：所有 `fontSize` 一律写成 `fs(N)`（设计稿原始值）。
 * 要整体调大调小，只改 FONT_SCALE 一个值；typeScale 保持设计稿语义值不变。
 */
export const fs = (size: number): number =>
  Math.round((size * FONT_SCALE) / systemFontScale);

// ---------------------------------------------------------------------------
// 字体（参考稿：品牌 / 标题 / 鱼名 / 数字使用衬线，正文使用系统无衬线）
// ---------------------------------------------------------------------------

export const font = {
  /** 中文衬线（宋体感）：品牌、页面大标题、鱼名、统计数字、候选鱼名（iOS 用系统宋体获得真实衬线字形） */
  serif: Platform.select({ ios: 'Songti SC', android: 'serif', default: 'serif' }),
  /** 正文 / 说明：系统默认 */
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' }),
} as const;

// ---------------------------------------------------------------------------
// 品牌色（Core Visual System V1 / color_tokens.json 冻结值；
// 动作青来自 Action Button V1.1 / Text Action V1 冻结合同）
// ---------------------------------------------------------------------------

export const brandColors = {
  /** Deep Lake Teal —— 主操作、选中、文本动作（Action Button PRIMARY #0F7A78） */
  primaryTeal: '#0F7A78',
  /** DeepLakeBlue —— 标题、重要图标、核心文字 */
  deepText: '#0B2D4B',
  /** MistBlueGray —— 说明、元信息、弱统计 */
  secondaryText: '#748897',
  /** MorningGold —— 品牌核心、重要时刻、有意义的记录（Gold Is Rare） */
  accentGold: '#D6A541',
  /** 危险操作（仅作用于危险 CTA，17.17） */
  danger: '#C25B4E',
} as const;

// ---------------------------------------------------------------------------
// 间距 / 圆角 / 页面边距
// ---------------------------------------------------------------------------

export const spacing = {
  /** 4 */
  xs: 4,
  /** 8 */
  sm: 8,
  /** 12 */
  md: 12,
  /** 16 */
  lg: 16,
  /** 页面左右安全边距 —— 冻结稿卡片内缩 ~5.8% 屏宽（coreUi PAGE_MARGIN） */
  page: PAGE_MARGIN,
  /** 24 */
  xl: 24,
  /** 32 */
  xxl: 32,
} as const;

/** 圆角统一走共享 radius token（R_SM/R_MD/R_LG/R_XL，参考 px 经 refS 换算） */
export const radius = {
  /** 输入 / 小元素 → R_MD（pill / 小卡档） */
  s: coreRadius.md,
  /** 卡片 → R_LG（内容卡档） */
  m: coreRadius.lg,
  /** Bottom Sheet / 大卡 → R_XL（Hero / Primary Card 档） */
  l: coreRadius.xl,
} as const;

// ---------------------------------------------------------------------------
// 字体层级（4.2 字体层级建议）
// ---------------------------------------------------------------------------

export const typeScale = {
  /** Display 28-32 —— 品牌 / 极少数核心标题 */
  display: 30,
  /** H1 24-28 —— 鱼名、页面主标题 */
  h1: 26,
  /** H2 18-22 —— 模块标题、日期 */
  h2: 20,
  /** Body 15-16 —— 主要正文 / 列表 */
  body: 16,
  /** Meta 13-14 —— 长度重量地点、辅助说明 */
  meta: 13,
  /** Caption 11-12 —— 状态、提示、标签 */
  caption: 12,
} as const;

// ---------------------------------------------------------------------------
// Motion Token（17.3 Global Motion Token）
// ---------------------------------------------------------------------------

export const motion = {
  /** instant 80-120ms —— Press、Icon 轻反馈 */
  instant: 100,
  /** fast 160-220ms —— Selection、Crossfade、小状态切换 */
  fast: 200,
  /** normal 260-360ms —— 页面内容、Hero Reveal、Sheet */
  normal: 300,
  /** slow 500-800ms —— 一次性自然过渡 */
  slow: 600,
  /** 相机按钮 Idle Breath 周期（17.5） */
  breath: 3600,
  /** 轻交互 Press Scale */
  pressScale: 0.97,
  /** 重要按钮 Press Scale */
  pressScaleStrong: 0.965,
} as const;

// ---------------------------------------------------------------------------
// 玻璃表面（glass_tokens.json：仅 A/B/C 三级，浅色清晨湖世界恒定）
// ---------------------------------------------------------------------------

export const glass = {
  /** GLASS_B：故事、次级统计（white 0.55-0.68） */
  light: 'rgba(255,255,255,0.60)',
  /** GLASS_A：主内容、识别信息（white 0.72-0.80） */
  strong: 'rgba(255,255,255,0.76)',
  /** 玻璃轻边线（1px light white） */
  border: 'rgba(255,255,255,0.55)',
  /** 弱分割线（DeepLakeBlue 10%） */
  borderFaint: 'rgba(11,45,75,0.10)',
} as const;
