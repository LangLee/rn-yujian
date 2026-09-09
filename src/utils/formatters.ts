import { LanguageType } from '../types';

/**
 * Format a number as currency
 * @param value - Number to format
 * @param language - Language for formatting (en or zh)
 * @param showDecimals - Whether to show decimal places (default: true)
 * @returns Formatted currency string
 */
export const formatCurrency = (
  value: number,
  language: LanguageType = 'en',
  showDecimals: boolean = true,
): string => {
  language = 'zh';
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    // currency: language === 'zh' ? 'CNY' : 'USD',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  };

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch (error) {
    // Fallback if Intl is not available
    const symbol = language === 'zh' ? '¥' : '$';
    const formatted = showDecimals
      ? value.toFixed(2)
      : Math.round(value).toString();
    return `${symbol}${formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
};

/**
 * Format a number with thousand separators
 * @param value - Number to format
 * @param language - Language for formatting (en or zh)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export const formatNumber = (
  value: number,
  language: LanguageType = 'en',
  decimals: number = 2,
): string => {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch (error) {
    // Fallback
    const formatted = value.toFixed(decimals);
    return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
};

/**
 * Format a percentage
 * @param value - Percentage value (e.g., 23.5 for 23.5%)
 * @param decimals - Number of decimal places (default: 2)
 * @param showSign - Whether to show + sign for positive values (default: true)
 * @returns Formatted percentage string
 */
export const formatPercentage = (
  value: number,
  decimals: number = 2,
  showSign: boolean = true,
): string => {
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

/**
 * Format a date string
 * @param dateString - ISO date string
 * @param language - Language for formatting (en or zh)
 * @param format - Format type: 'short', 'medium', 'long' (default: 'medium')
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string,
  language: LanguageType = 'en',
  format: 'short' | 'medium' | 'long' = 'medium',
): string => {
  try {
    const date = new Date(dateString);
    const locale = language === 'zh' ? 'zh-CN' : 'en-US';

    let options: Intl.DateTimeFormatOptions;

    switch (format) {
      case 'short':
        options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        break;
      case 'long':
        options = { year: 'numeric', month: 'long', day: 'numeric' };
        break;
      case 'medium':
      default:
        options = { year: 'numeric', month: 'short', day: 'numeric' };
        break;
    }

    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch (error) {
    // Fallback to ISO format
    return dateString.split('T')[0];
  }
};

/**
 * Format a relative date (e.g., "2 days ago", "in 3 months")
 * @param dateString - ISO date string
 * @param language - Language for formatting (en or zh)
 * @returns Relative date string
 */
export const formatRelativeDate = (
  dateString: string,
  language: LanguageType = 'en',
): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return language === 'zh' ? '今天' : 'Today';
    } else if (diffDays === 1) {
      return language === 'zh' ? '明天' : 'Tomorrow';
    } else if (diffDays === -1) {
      return language === 'zh' ? '昨天' : 'Yesterday';
    } else if (diffDays > 0 && diffDays < 7) {
      return language === 'zh' ? `${diffDays}天后` : `In ${diffDays} days`;
    } else if (diffDays < 0 && diffDays > -7) {
      return language === 'zh'
        ? `${Math.abs(diffDays)}天前`
        : `${Math.abs(diffDays)} days ago`;
    } else if (diffDays > 0 && diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return language === 'zh'
        ? `${weeks}周后`
        : `In ${weeks} week${weeks > 1 ? 's' : ''}`;
    } else if (diffDays < 0 && diffDays > -30) {
      const weeks = Math.floor(Math.abs(diffDays) / 7);
      return language === 'zh'
        ? `${weeks}周前`
        : `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return formatDate(dateString, language, 'short');
    }
  } catch (error) {
    return dateString;
  }
};

/**
 * Format a compact number (e.g., 1.2K, 3.5M)
 * @param value - Number to format
 * @param language - Language for formatting (en or zh)
 * @returns Compact number string
 */
export const formatCompactNumber = (
  value: number,
  language: LanguageType = 'en',
): string => {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  } catch (error) {
    // Fallback
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    } else {
      return value.toString();
    }
  }
};
/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
};

// ---------------------------------------------------------------------------
// 鱼获 / 记录日历辅助
// ---------------------------------------------------------------------------

export interface CatchLike {
  capturedAt: string;
  speciesId?: string;
  speciesName?: string;
  imageUrl?: string;
}

const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/** 'YYYY-MM-DD'（本地时区） */
export const dayKeyOf = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 月份分组键 'YYYY-MM' */
export const monthKeyOf = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** 卡片时间：今天 15:26 / 9月5日 15:26 / 2025年1月31日 */
export const formatCaptureWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (dayKeyOf(date) === dayKeyOf(now)) {
    return `今天 ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKeyOf(date) === dayKeyOf(yesterday)) {
    return `昨天 ${time}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

/** 详情页完整时间：2026年9月5日 15:26 */
export const formatCaptureFull = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/** 详情页数据行时间戳：2026.09.05 15:26 */
export const formatCaptureStamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

/** 媒体时长角标：0:12 / 1:05 */
export const formatMediaDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) {
    return '';
  }
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${pad(secs)}`;
};

export const formatMonthLabel = (year: number, month: number): string =>
  `${year}年${month + 1}月`;

export const formatMonthDayLabel = (date: Date): string =>
  `${date.getMonth() + 1}月${date.getDate()}日`;

export interface MonthGroup<T extends CatchLike> {
  key: string;
  label: string;
  year: number;
  month: number;
  items: T[];
}

/** 我的渔获按月份分组（9.1：主内容按月份分组）。 */
export function groupCatchesByMonth<T extends CatchLike>(items: T[]): MonthGroup<T>[] {
  const groups = new Map<string, MonthGroup<T>>();
  for (const item of items) {
    const date = new Date(item.capturedAt);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const key = monthKeyOf(date);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: formatMonthLabel(date.getFullYear(), date.getMonth()),
        year: date.getFullYear(),
        month: date.getMonth(),
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

/** 有鱼获记录的独立天数（记录天数统计）。 */
export function countDistinctDays(items: CatchLike[]): number {
  const days = new Set<string>();
  for (const item of items) {
    const key = dayKeyOf(item.capturedAt);
    if (key) {
      days.add(key);
    }
  }
  return days.size;
}

/** 一天内的记录次数映射（记录日历小鱼 glyph）。 */
export function countByDay(items: CatchLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = dayKeyOf(item.capturedAt);
    if (!key) {
      continue;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 单位与偏好（13.4 单位与偏好）
// ---------------------------------------------------------------------------

export type LengthUnit = 'cm' | 'inch';
export type WeightUnit = 'kg' | 'jin' | 'lb';

export const LENGTH_UNIT_LABEL: Record<LengthUnit, string> = {
  cm: '厘米 cm',
  inch: '英寸 inch',
};

export const WEIGHT_UNIT_LABEL: Record<WeightUnit, string> = {
  kg: '千克 kg',
  jin: '斤',
  lb: '磅 lb',
};

export function formatLength(cm: number | null | undefined, unit: LengthUnit): string | null {
  if (cm == null || Number.isNaN(cm) || cm <= 0) {
    return null;
  }
  if (unit === 'inch') {
    return `${(cm / 2.54).toFixed(1)} in`;
  }
  return `${Number.isInteger(cm) ? cm : cm.toFixed(1)} cm`;
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string | null {
  if (kg == null || Number.isNaN(kg) || kg <= 0) {
    return null;
  }
  if (unit === 'jin') {
    return `${(kg * 2).toFixed(1)} 斤`;
  }
  if (unit === 'lb') {
    return `${(kg * 2.20462).toFixed(1)} lb`;
  }
  return `${kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
}
