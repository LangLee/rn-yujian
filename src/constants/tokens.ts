import { PixelRatio, Platform } from 'react-native';

/**
 * 渔见 Design Tokens（对应《渔见 UI/UX 开发指导》04 章）。
 * 开发初始值；最终视觉数值以 Figma Token 为准。
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
  /** 中文衬线（宋体感）：品牌、页面大标题、鱼名、统计数字、候选鱼名 */
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  /** 正文 / 说明：系统默认 */
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' }),
} as const;

// ---------------------------------------------------------------------------
// 品牌色（4.1 基础 Token）
// ---------------------------------------------------------------------------

export const brandColors = {
  /** Primary Teal —— 主操作、选中、弱图标 */
  primaryTeal: '#4D9EA1',
  /** Deep Text —— 标题、关键数字 */
  deepText: '#173B4B',
  /** Secondary Text —— 说明、元信息 */
  secondaryText: '#6A7D86',
  /** Accent Gold —— 少量点亮、选中、记录感 */
  accentGold: '#D1AF69',
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
  /** 16 —— 页面左右安全边距 */
  page: 24,
  /** 24 */
  xl: 24,
  /** 32 */
  xxl: 32,
} as const;

export const radius = {
  /** 输入 */
  s: 10,
  /** 卡片 */
  m: 16,
  /** Bottom Sheet */
  l: 22,
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
// 玻璃表面（浅色环境下；夜晚由 Environment Profile 提供）
// ---------------------------------------------------------------------------

export const glass = {
  /** Glass Surface White 60-78% */
  light: 'rgba(255,255,255,0.66)',
  strong: 'rgba(255,255,255,0.78)',
  /** Glass Border White / Gray 25-45% */
  border: 'rgba(255,255,255,0.5)',
  borderFaint: 'rgba(23,59,75,0.10)',
} as const;
