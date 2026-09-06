import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorScheme } from '../types';
import {
  EnvironmentId,
  EnvironmentProfile,
  ThemePreference,
  environmentProfiles,
  resolveAutoEnvironment,
  toColorScheme,
} from '../constants/environments';

const THEME_STORAGE_KEY = '@asset_manager_theme';
/** 主题切换 Crossfade：手动 400-600ms（17.33）。 */
export const THEME_CROSSFADE_MS = 500;

interface ThemeContextType {
  /** 当前生效的 Environment Profile */
  profile: EnvironmentProfile;
  /** 用户偏好：auto / 固定某一环境 */
  themeMode: ThemePreference;
  /** 旧 ColorScheme 结构（结构兼容） */
  colors: ColorScheme;
  isDark: boolean;
  setThemeMode: (mode: ThemePreference) => void;
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

const LEGACY_MODE_MAP: Record<string, ThemePreference> = {
  light: 'auto',
  dark: 'auto',
  system: 'auto',
};

/**
 * 环境主题编排：
 * 默认自动跟随时间；用户可固定清晨 / 白天 / 傍晚 / 夜晚（3.3）。
 * 切换 Profile 不重建页面组件，仅交叉淡入背景与表面 Token（17.33）。
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemePreference>('auto');
  const [isLoading, setIsLoading] = useState(true);
  const [autoTick, setAutoTick] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (
          saved === 'auto' ||
          saved === 'morning' ||
          saved === 'day' ||
          saved === 'sunset' ||
          saved === 'night'
        ) {
          setThemeModeState(saved);
        } else if (saved && LEGACY_MODE_MAP[saved]) {
          setThemeModeState(LEGACY_MODE_MAP[saved]);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    return () => subscription.remove();
  }, []);

  // 自动模式下每分钟重新解析当前环境
  useEffect(() => {
    if (themeMode !== 'auto' || isLoading) {
      return;
    }
    const timer = setInterval(() => setAutoTick((value) => value + 1), 60000);
    return () => clearInterval(timer);
  }, [themeMode, isLoading]);

  const setThemeMode = useCallback((mode: ThemePreference) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => undefined);
  }, []);

  const profileId: EnvironmentId = useMemo(() => {
    if (themeMode === 'auto') {
      // autoTick 触发重算
      void autoTick;
      return resolveAutoEnvironment();
    }
    return themeMode;
  }, [themeMode, autoTick, isLoading]);

  const profile = environmentProfiles[profileId];
  const colors = useMemo(() => toColorScheme(profile), [profile]);

  if (isLoading) {
    return null;
  }

  const value: ThemeContextType = {
    profile,
    themeMode,
    colors,
    isDark: profile.isDark,
    setThemeMode,
    reduceMotion,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/** 环境跟随的 StatusBar 样式（夜晚浅色内容）。 */
export function useStatusBarStyle(): 'light-content' | 'dark-content' {
  const { profile } = useTheme();
  return profile.isDark ? 'light-content' : 'dark-content';
}

export type { ThemePreference, EnvironmentId, EnvironmentProfile };
