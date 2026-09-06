import { ColorScheme } from '../types';
import { brandColors } from './tokens';

/**
 * 渔见色板（对应《渔见 UI/UX 开发指导》4.1 基础 Token）。
 * 淡灰蓝绿为基础，淡金只用于选中、记录、奖励感的小面积强调。
 * 键名保持与旧工程一致，便于既有屏幕平滑迁移到新视觉。
 */
export const palette = {
  /** 页面浅色画布（淡灰蓝绿） */
  warmBackground: '#EFF5F3',
  /** Primary Teal #4D9EA1 */
  waterTeal: brandColors.primaryTeal,
  /** 主色弱背景 */
  softWater: '#DDEDEB',
  /** Deep Text #173B4B */
  deepInk: brandColors.deepText,
  /** Secondary Text #6A7D86 */
  mutedInk: brandColors.secondaryText,
  /** Accent Gold #D1AF69 —— 少量点亮、记录感 */
  accentGold: brandColors.accentGold,
  /** 淡金弱背景（点亮标记） */
  accentGoldSoft: '#F4EBD5',
  /** 旧警示橙（Quality Gate 提示） */
  warmOrange: '#E58B2A',
  /** 淡金记录卡 */
  achievement: '#F7EED8',
  achievementInk: '#9A7B3F',
  cardWhite: '#FFFFFF',
  hairline: '#DCE7E5',
  /** 鱼 Glyph / 插画低对比色 */
  fishGreen: '#93B0AB',
  fishMint: '#BCD9D5',
  /** 识别页深色取景底色 */
  viewfinderDark: '#0B2A31',
  /** 结果页辅助色 */
  qualityWarning: '#E58B2A',
  qualityInvalid: '#C25B4E',
  warningCard: '#FFF4E4',
  warningTitle: '#9A5A16',
  warningText: '#7D5A32',
  progressTrack: '#DCE7E5',
  stepIdle: '#E7ECEA',
  /** 玻璃表面（浅色环境） */
  glassLight: 'rgba(255,255,255,0.66)',
  glassStrong: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.5)',
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
