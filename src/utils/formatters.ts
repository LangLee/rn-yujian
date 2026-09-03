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
