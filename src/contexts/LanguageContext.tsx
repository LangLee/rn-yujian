import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguageType } from '../types';
import { translations } from '../constants/translations';

const LANGUAGE_STORAGE_KEY = '@asset_manager_language';

type LanguageMode = 'en' | 'zh' | 'system';

interface LanguageContextType {
  language: LanguageType;
  languageMode: LanguageMode;
  t: (key: string) => string;
  setLanguage: (language: LanguageMode) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
}) => {
  const [languageMode, setLanguageModeState] = useState<LanguageMode>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Get system language
  const getSystemLanguage = (): LanguageType => {
    const deviceLanguage =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;

    // Check if device language is Chinese
    if (
      deviceLanguage &&
      (deviceLanguage.startsWith('zh') || deviceLanguage.startsWith('cn'))
    ) {
      return 'zh';
    }
    return 'en';
  };

  // Load saved language on mount
  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (
        savedLanguage === 'en' ||
        savedLanguage === 'zh' ||
        savedLanguage === 'system'
      ) {
        setLanguageModeState(savedLanguage as LanguageMode);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setLanguage = async (newLanguageMode: LanguageMode) => {
    try {
      setLanguageModeState(newLanguageMode);
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguageMode);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  // Determine actual language based on mode
  const actualLanguage: LanguageType =
    languageMode === 'system' ? getSystemLanguage() : languageMode;

  const t = (key: string): string => {
    const translation =
      translations[actualLanguage][key as keyof (typeof translations)['en']];
    return translation || key;
  };

  // Don't render children until language is loaded
  if (isLoading) {
    return null;
  }

  const value: LanguageContextType = {
    language: actualLanguage,
    languageMode,
    t,
    setLanguage,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
