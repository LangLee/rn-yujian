// User Types
export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

// Theme Types
export interface ColorScheme {
  primary: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
}

export type ThemeType = 'light' | 'dark';
export type LanguageType = 'en' | 'zh';
