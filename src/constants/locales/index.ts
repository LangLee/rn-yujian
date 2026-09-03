import { en } from './en';
import { zh } from './zh';

export const translations = {
  en,
  zh,
};

export type TranslationKeys = keyof typeof en;
