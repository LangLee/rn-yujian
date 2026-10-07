import { ColorScheme } from '../types';
import { palette } from './colors';

/**
 * 主题环境层（Core Visual System V1 冻结后收敛为单一清晨湖世界）。
 *
 * 背景 System V1 明确：全部湖景页面共用 Morning_Lake_Master_V1 母版，
 * 只以 MistWhite veil / 饱和度 / 对比度 / 亮度区分层级；
 * 禁止夕阳橙红、夜晚 HUD 等「第三湖景世界」。
 * 因此 Surface Token 恒为浅色清晨湖世界冻结值（color_tokens.json），
 * 各 EnvironmentId 仅作为历史偏好键保留兼容，不再产生视觉分叉。
 */

export type EnvironmentId = 'morning' | 'day' | 'sunset' | 'night';

export interface EnvironmentBackdrop {
  /** 天空渐变（上 → 下）——已冻结为清晨湖世界（不再按环境分叉） */
  skyTop: string;
  skyBottom: string;
  /** 水面渐变（上 → 下） */
  waterTop: string;
  waterBottom: string;
  /** 远山剪影 */
  hillNear: string;
  hillFar: string;
  /** 太阳 / 月亮辉光（清晨柔金） */
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
  /** Glass 卡片底色（GLASS_B / GLASS_A） */
  glass: string;
  glassStrong: string;
  glassBorder: string;
  /** 主文字 DeepLakeBlue / 次要文字 LakeBlue */
  textPrimary: string;
  textSecondary: string;
  /** 强调色（Deep Lake Teal） */
  accent: string;
  accentSoft: string;
  /** 遮罩（DeepOverlay） */
  scrim: string;
  /** 主题浅色画布（LakeWhite） */
  canvas: string;
}

export interface EnvironmentMotion {
  /** 雾漂周期 */
  mistDuration: number;
  /** 环境光呼吸周期 */
  lightBreatheDuration: number;
  /** 水面微光周期 */
  shimmerDuration: number;
  /** 波纹透明度系数 */
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

/** 冻结清晨湖世界（唯一视觉来源；所有环境键共享，不产生分叉） */
const MORNING_BACKDROP: EnvironmentBackdrop = {
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
};

const FROZEN_SURFACE: EnvironmentSurface = {
  glass: palette.glassLight,
  glassStrong: palette.glassStrong,
  glassBorder: palette.glassBorder,
  textPrimary: palette.deepInk,
  textSecondary: '#34556F',
  accent: palette.waterTeal,
  accentSoft: palette.softWater,
  scrim: 'rgba(8,25,38,0.26)',
  canvas: palette.warmBackground,
};

const MORNING_MOTION: EnvironmentMotion = {
  mistDuration: 5100,
  lightBreatheDuration: 4200,
  shimmerDuration: 3700,
  rippleAlpha: 0.8,
  glowAlpha: 0.85,
};

const makeProfile = (
  id: EnvironmentId,
  label: string,
  description: string,
): EnvironmentProfile => ({
  id,
  label,
  description,
  isDark: false,
  backdrop: MORNING_BACKDROP,
  surface: FROZEN_SURFACE,
  motion: MORNING_MOTION,
});

const morning = makeProfile('morning', '清晨', '薄雾 · 冷暖交界 · 安静');
const day = makeProfile('day', '白天', '通透 · 自然 · 可读性最高');
const sunset = makeProfile('sunset', '傍晚', '金色低角度光 · 温暖');
const night = makeProfile('night', '夜晚', '自然低照度 · 夜钓感');

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
    card: profile.surface.glassStrong,
    text: profile.surface.textPrimary,
    textSecondary: profile.surface.textSecondary,
    border: profile.surface.glassBorder,
    success: profile.surface.accent,
    error: palette.qualityInvalid,
    warning: palette.qualityWarning,
  };
}
