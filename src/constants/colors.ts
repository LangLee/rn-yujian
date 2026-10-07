import { ColorScheme } from '../types';
import { brandColors, glass } from './tokens';

/**
 * 渔见色板（Core Visual System V1 / color_tokens.json 冻结值）。
 * 同一个清晨湖畔视觉世界：DeepLakeBlue 文字、LakeWhite 画布、
 * MorningGold 仅用于品牌、重要时刻与有意义的记录（Gold Is Rare）。
 * 键名保持与旧工程一致，便于既有屏幕平滑迁移到新视觉。
 */
export const palette = {
  /** 页面浅色画布（LakeWhite） */
  warmBackground: '#F7FAFB',
  /** Deep Lake Teal #0F7A78（Action Button PRIMARY / Text Action NORMAL） */
  waterTeal: brandColors.primaryTeal,
  /** 主色弱背景（SECONDARY_STRONG pressed 面 #EAF3F1） */
  softWater: '#EAF3F1',
  /** DeepLakeBlue #0B2D4B */
  deepInk: brandColors.deepText,
  /** MistBlueGray #748897 */
  mutedInk: brandColors.secondaryText,
  /** MorningGold #D6A541 —— 品牌核心、重要时刻、有意义的记录 */
  accentGold: brandColors.accentGold,
  /** 淡金弱背景（点亮标记，低饱和 SoftGold 家族） */
  accentGoldSoft: 'rgba(214,165,65,0.14)',
  /** 旧警示橙（Quality Gate 提示） */
  warmOrange: '#E58B2A',
  /** 淡金记录卡（Achievement：soft gold、低饱和、无光晕） */
  achievement: '#F7EED8',
  achievementInk: '#9A7B3F',
  /** 卡片基底（LakeWhite） */
  cardWhite: '#F7FAFB',
  /** 弱边线（DeepLakeBlue 10% hairline） */
  hairline: 'rgba(11,45,75,0.10)',
  /** 鱼 Glyph / 插画低对比色 */
  fishGreen: '#93B0AB',
  fishMint: '#BCD9D5',
  /** 识别页深色取景底色（BG_CAPTURE fallback 冻结值 #102D35） */
  viewfinderDark: '#102D35',
  /** 结果页辅助色 */
  qualityWarning: '#E58B2A',
  qualityInvalid: '#C25B4E',
  warningCard: '#FFF4E4',
  warningTitle: '#9A5A16',
  warningText: '#7D5A32',
  progressTrack: 'rgba(11,45,75,0.08)',
  stepIdle: 'rgba(11,45,75,0.06)',
  /** 玻璃表面（glass_tokens.json GLASS_B / GLASS_A） */
  glassLight: glass.light,
  glassStrong: glass.strong,
  glassBorder: glass.border,
} as const;

export const lightTheme: ColorScheme = {
  primary: palette.waterTeal,
  background: palette.warmBackground,
  card: palette.cardWhite,
  text: palette.deepInk,
  textSecondary: palette.mutedInk,
  border: palette.hairline,
  success: palette.waterTeal,
  error: palette.qualityInvalid,
  warning: palette.qualityWarning,
};

export const darkTheme: ColorScheme = lightTheme;
