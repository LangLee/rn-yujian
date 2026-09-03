import { ColorScheme } from '../types';

/**
 * 渔见 AI 色板（与原 Android 工程 ui/theme/Color.kt 一一对应）。
 * 主题固定浅色；darkTheme 仅保留结构兼容。
 */
export const palette = {
  warmBackground: '#F7F6F2',
  waterTeal: '#2E8B83',
  softWater: '#DCEFEB',
  deepInk: '#16313A',
  mutedInk: '#8A979B',
  warmOrange: '#FF8A34',
  achievement: '#FFF7DA',
  achievementInk: '#A17114',
  cardWhite: '#FFFFFF',
  hairline: '#E6E9E5',
  fishGreen: '#6F8C73',
  fishMint: '#A7D8CE',
  /** 识别页深色取景底色 */
  viewfinderDark: '#0E3337',
  /** 结果页辅助色 */
  qualityWarning: '#E58B2A',
  qualityInvalid: '#B24A3A',
  warningCard: '#FFF4E4',
  warningTitle: '#9A5A16',
  warningText: '#7D5A32',
  progressTrack: '#E1E6E4',
  stepIdle: '#E7ECEA',
};

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
