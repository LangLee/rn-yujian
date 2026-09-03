# React Native App

[中文文档](./README.zh-CN.md) | [模板设置指南](./TEMPLATE_SETUP.md)

A production-ready React Native template with modern architecture, built-in authentication, theming, internationalization, and offline support.

> **🚀 First time using this template?** Check out the [Template Setup Guide](./TEMPLATE_SETUP.md) for step-by-step instructions.

## Features

### Core Functionality

- � Authenttication System - Supabase integration with email/password auth
- 🌓 Theme Support - Light/Dark/System modes with persistent preferences
- 🌐 Internationalization - English/Chinese with system language detection
- � Oeffline Support - AsyncStorage caching for offline-first experience
- 🎯 Type Safety - Full TypeScript support with strict typing

### Architecture & Performance

- 📱 Navigation - Stack and Tab navigation with deep linking support
- 🎨 Component Library - Reusable UI components with consistent styling
- ⚡ Performance Optimized - Debounce, throttle, and lazy loading utilities
- 🛡️ Error Handling - Global error boundary with graceful fallbacks
- 🔔 Alert System - Custom alert provider for consistent notifications

### Developer Experience

- 🧪 Testing Setup - Jest configured with React Native Testing Library
- 📦 Clean Architecture - Organized folder structure with clear separation
- 🔧 Environment Config - Support for multiple environments (.env files)
- 🚀 Ready to Deploy - Android and iOS build configurations included

## Prerequisites

- Node.js >= 20
- React Native development environment
  - iOS: Xcode 14+ and CocoaPods
  - Android: Android Studio and SDK 33+
- Yarn or npm package manager
- (Optional) Supabase account for cloud sync

## Template Customization

Before starting development, you should customize the template with your app's information:

```bash
# Using npm script (recommended)
npm run rename-app "我的应用" "MyApp" "myapp" "com.mycompany.myapp"

# Or directly
node scripts/rename-app.js "我的应用" "MyApp" "myapp" "com.mycompany.myapp"
```

Parameters:

- Chinese Name: Chinese display name (replaces BaseTemplateZh)
- English Name: English display name (replaces BaseTemplateEn)
- Lowercase Name: Lowercase app name (replaces basetemplate)
- Bundle ID: App bundle identifier (replaces com.basetemplate)

After renaming:

1. Verify the changes: `npm run verify-rename`
2. Reinstall iOS dependencies: `cd ios && pod install && cd ..`
3. Clear cache: `npx react-native start --reset-cache`
4. Rebuild the app

## Quick Start

1. Install dependencies:

```bash
yarn install
# or
npm install
```

2. Install iOS dependencies:

```bash
cd ios && pod install && cd ..
```

3. Configure environment (optional for offline mode):

```bash
cp .env.example .env
# Edit .env and add your Supabase credentials if needed
```

4. Run the app:

iOS:

```bash
yarn ios
# or
npm run ios
```

Android:

```bash
yarn android
# or
npm run android
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AlertProvider.tsx
│   ├── BottomNav.tsx
│   ├── CustomAlert.tsx
│   ├── ErrorBoundary.tsx
│   ├── Header.tsx
│   └── LoadingSpinner.tsx
├── screens/            # Screen components
│   ├── HomeScreen.tsx
│   ├── LoginScreen.tsx
│   └── ProfileScreen.tsx
├── contexts/           # React Context providers
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   └── LanguageContext.tsx
├── navigation/         # Navigation configuration
│   ├── AppNavigator.tsx
│   ├── MainTabNavigator.tsx
│   └── types.ts
├── services/           # API and data services
│   ├── authService.ts
│   ├── cacheService.ts
│   └── supabase.ts
├── utils/              # Utility functions
│   ├── alert.ts
│   ├── formatters.ts
│   └── performance.ts
├── constants/          # Constants and configurations
│   ├── colors.ts
│   ├── translations.ts
│   └── locales/
└── types/              # TypeScript type definitions
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

The app works in offline mode if Supabase is not configured.

### Theme Customization

Edit `src/constants/colors.ts` to customize theme colors:

```typescript
export const lightTheme = {
  primary: '#1c74e9',
  background: '#ffffff',
  // ... more colors
};
```

### Adding Languages

1. Create a new locale file in `src/constants/locales/`
2. Add translations to `src/constants/translations.ts`
3. Update `LanguageContext.tsx` to support the new language

## Testing

Run tests:

```bash
yarn test
# or
npm test
```

Run tests with coverage:

```bash
yarn test -- --coverage
```

Run tests in watch mode:

```bash
yarn test -- --watch
```

## Tech Stack

### Core

- React Native 0.83.1 (CLI)
- React 19.2.0
- TypeScript 5.8.3

### Navigation & UI

- React Navigation 7.x (Stack & Bottom Tabs)
- React Native Vector Icons
- React Native Safe Area Context
- React Native Gesture Handler

### State & Data

- React Context API
- AsyncStorage for local persistence
- Supabase for backend (optional)

### Development

- Jest & React Native Testing Library
- ESLint & Prettier
- Babel & Metro bundler

## Building for Production

### Android

```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

### iOS

```bash
cd ios
xcodebuild -workspace [yourapp].xcworkspace -scheme [yourapp] -configuration Release
```

Or use Xcode to archive and distribute.

Note: Replace `[yourapp]` with your actual app name after running the rename script.

## Contributing

This is a template project. Feel free to fork and customize for your needs.

## License

Apache-2.0
