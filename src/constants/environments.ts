import { ColorScheme } from '../types';
import { palette } from './colors';

/**
 * Adaptive Water Time Theme System（设计文档 3.2 / 18.4）。
 * Morning / Day / Sunset / Night 四个 Environment Profile：
 * 环境变化只影响背景资产、表面 Token、文字色与 Motion 参数，
 * 不改变组件树、布局与信息密度（Night ≠ Dark Theme）。
 */

export type EnvironmentId = 'morning' | 'day' | 'sunset' | 'night';

export interface EnvironmentBackdrop {
  /** 天空渐变（上 → 下） */
  skyTop: string;
  skyBottom: string;
  /** 水面渐变（上 → 下） */
  waterTop: string;
  waterBottom: string;
  /** 远山剪影 */
  hillNear: string;
  hillFar: string;
  /** 太阳 / 月亮辉光 */
  glowColor: string;
  /** 太阳水平位置（0-1，水面反光列随之对齐） */
  sunX: number;
  /** 雾颜色 */
  mistColor: string;
  /** 水面微光 */
  shimmerColor: string;
  /** 前景芦苇 / 草丛剪影 */
  reedColor: string;
}

export interface EnvironmentSurface {
  /** Glass 卡片底色 */
  glass: string;
  glassStrong: string;
  glassBorder: string;
  /** 主文字 / 次要文字 */
  textPrimary: string;
  textSecondary: string;
  /** 强调色 */
  accent: string;
  accentSoft: string;
  /** 遮罩 */
  scrim: string;
  /** 主题浅色画布（列表页背景） */
  canvas: string;
}

export interface EnvironmentMotion {
  /** 雾漂周期 */
  mistDuration: number;
  /** 环境光呼吸周期 */
  lightBreatheDuration: number;
  /** 水面微光周期 */
  shimmerDuration: number;
  /** 波纹透明度系数（Night 比 Day 低约 20-30%） */
  rippleAlpha: number;
  /** 环境光呼吸透明度系数 */
  glowAlpha: number;
}

export interface EnvironmentProfile {
  id: EnvironmentId;
  label: string;
  description: string;
  isDark: boolean;
  backdrop: EnvironmentBackdrop;
  surface: EnvironmentSurface;
  motion: EnvironmentMotion;
}

const morning: EnvironmentProfile = {
  id: 'morning',
  label: '清晨',
  description: '薄雾 · 冷暖交界 · 安静',
  isDark: false,
  backdrop: {
    skyTop: '#D8E8EA',
    skyBottom: '#F0EFE2',
    waterTop: '#A8C9C4',
    waterBottom: '#6FA09E',
    hillFar: 'rgba(163,190,185,0.55)',
    hillNear: 'rgba(120,158,152,0.45)',
    glowColor: '#F7ECD0',
    sunX: 0.15,
    mistColor: '#FFFFFF',
    shimmerColor: '#EFF6EE',
    reedColor: 'rgba(94,122,114,0.5)',
  },
  surface: {
    glass: 'rgba(255,255,255,0.62)',
    glassStrong: 'rgba(255,255,255,0.78)',
    glassBorder: 'rgba(255,255,255,0.55)',
    textPrimary: '#173B4B',
    textSecondary: '#5F7681',
    accent: '#4D9EA1',
    accentSoft: '#DDEDEB',
    scrim: 'rgba(23,59,75,0.22)',
    canvas: '#ECF2F0',
  },
  motion: {
    mistDuration: 5100,
    lightBreatheDuration: 4200,
    shimmerDuration: 3700,
    rippleAlpha: 0.8,
    glowAlpha: 0.85,
  },
};

const day: EnvironmentProfile = {
  id: 'day',
  label: '白天',
  description: '通透 · 自然 · 可读性最高',
  isDark: false,
  backdrop: {
    skyTop: '#C9E4E6',
    skyBottom: '#EAF4EF',
    waterTop: '#8CBCB9',
    waterBottom: '#58979A',
    hillFar: 'rgba(150,185,178,0.5)',
    hillNear: 'rgba(106,148,143,0.42)',
    glowColor: '#FFF6DC',
    sunX: 0.5,
    mistColor: '#FFFFFF',
    shimmerColor: '#F2F8F2',
    reedColor: 'rgba(78,110,104,0.45)',
  },
  surface: {
    glass: 'rgba(255,255,255,0.7)',
    glassStrong: 'rgba(255,255,255,0.82)',
    glassBorder: 'rgba(255,255,255,0.6)',
    textPrimary: '#173B4B',
    textSecondary: '#6A7D86',
    accent: '#4D9EA1',
    accentSoft: '#D9ECEA',
    scrim: 'rgba(23,59,75,0.2)',
    canvas: '#EFF5F3',
  },
  motion: {
    mistDuration: 4600,
    lightBreatheDuration: 4000,
    shimmerDuration: 3400,
    rippleAlpha: 1,
    glowAlpha: 1,
  },
};

const sunset: EnvironmentProfile = {
  id: 'sunset',
  label: '傍晚',
  description: '金色低角度光 · 温暖',
  isDark: false,
  backdrop: {
    skyTop: '#EBD9BC',
    skyBottom: '#F5E3CB',
    waterTop: '#C2B494',
    waterBottom: '#7E938A',
    hillFar: 'rgba(184,166,140,0.5)',
    hillNear: 'rgba(133,129,105,0.45)',
    glowColor: '#F2C98B',
    sunX: 0.14,
    mistColor: '#F7EAD4',
    shimmerColor: '#EFD9A8',
    reedColor: 'rgba(110,106,82,0.5)',
  },
  surface: {
    glass: 'rgba(255,252,244,0.62)',
    glassStrong: 'rgba(255,252,244,0.78)',
    glassBorder: 'rgba(255,255,255,0.5)',
    textPrimary: '#3D3227',
    textSecondary: '#7A6A55',
    accent: '#4D9EA1',
    accentSoft: '#F2E7CF',
    scrim: 'rgba(61,50,39,0.22)',
    canvas: '#F4EDDD',
  },
  motion: {
    mistDuration: 5000,
    lightBreatheDuration: 4200,
    shimmerDuration: 3600,
    rippleAlpha: 0.9,
    glowAlpha: 1.1,
  },
};

const night: EnvironmentProfile = {
  id: 'night',
  label: '夜晚',
  description: '自然低照度 · 夜钓感',
  isDark: true,
  backdrop: {
    skyTop: '#0E2A34',
    skyBottom: '#153B44',
    waterTop: '#0F3038',
    waterBottom: '#08222B',
    hillFar: 'rgba(20,58,66,0.6)',
    hillNear: 'rgba(12,40,48,0.7)',
    glowColor: '#D9E7E6',
    sunX: 0.22,
    mistColor: '#27505A',
    shimmerColor: '#3E6E75',
    reedColor: 'rgba(6,32,42,0.72)',
  },
  surface: {
    glass: 'rgba(18,50,60,0.6)',
    glassStrong: 'rgba(22,58,68,0.74)',
    glassBorder: 'rgba(255,255,255,0.14)',
    textPrimary: '#E4EFEA',
    textSecondary: '#9DB4B3',
    accent: '#6FB6B6',
    accentSoft: 'rgba(111,182,182,0.18)',
    scrim: 'rgba(4,16,20,0.35)',
    canvas: '#0C2A33',
  },
  motion: {
    mistDuration: 5600,
    lightBreatheDuration: 4800,
    shimmerDuration: 4200,
    rippleAlpha: 0.72,
    glowAlpha: 0.55,
  },
};

export const environmentProfiles: Record<EnvironmentId, EnvironmentProfile> = {
  morning,
  day,
  sunset,
  night,
};

export type ThemePreference = 'auto' | EnvironmentId;

/** 自动跟随时间：清晨 5:00-10:00 / 白天 10:00-17:00 / 傍晚 17:00-19:30 / 夜晚其余。 */
export function resolveAutoEnvironment(date: Date = new Date()): EnvironmentId {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 300 && minutes < 600) {
    return 'morning';
  }
  if (minutes >= 600 && minutes < 1020) {
    return 'day';
  }
  if (minutes >= 1020 && minutes < 1170) {
    return 'sunset';
  }
  return 'night';
}

/** Environment Profile → 旧 ColorScheme（供 CustomAlert 等结构兼容）。 */
export function toColorScheme(profile: EnvironmentProfile): ColorScheme {
  return {
    primary: profile.surface.accent,
    background: profile.surface.canvas,
    card: profile.isDark ? palette.cardWhite : profile.surface.glassStrong,
    text: profile.surface.textPrimary,
    textSecondary: profile.surface.textSecondary,
    border: profile.surface.glassBorder,
    success: profile.surface.accent,
    error: palette.qualityInvalid,
    warning: palette.qualityWarning,
  };
}
