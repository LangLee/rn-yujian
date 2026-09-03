# React Native 应用模板

[English Documentation](./README.md) | [模板设置指南](./TEMPLATE_SETUP.md)

一个生产就绪的 React Native 项目模板，内置现代化架构、身份认证、主题切换、国际化和离线支持。

> **🚀 第一次使用此模板？** 查看[模板设置指南](./TEMPLATE_SETUP.md)获取详细步骤说明。

## 功能特性

### 核心功能

- 🔐 身份认证系统 - 集成 Supabase，支持邮箱/密码登录
- 🌓 主题支持 - 浅色/深色/跟随系统，持久化保存用户偏好
- 🌐 国际化 - 支持中英文，自动检测系统语言
- 💾 离线支持 - AsyncStorage 缓存，离线优先体验
- 🎯 类型安全 - 完整的 TypeScript 支持，严格类型检查

### 架构与性能

- 📱 导航系统 - Stack 和 Tab 导航，支持深度链接
- 🎨 组件库 - 可复用的 UI 组件，统一的样式规范
- ⚡ 性能优化 - 防抖、节流和懒加载工具函数
- 🛡️ 错误处理 - 全局错误边界，优雅的降级方案
- 🔔 提醒系统 - 自定义 Alert 提供器，统一的通知体验

### 开发体验

- 🧪 测试配置 - Jest 配合 React Native Testing Library
- 📦 清晰架构 - 组织良好的文件结构，清晰的职责分离
- 🔧 环境配置 - 支持多环境配置（.env 文件）
- 🚀 开箱即用 - Android 和 iOS 构建配置已就绪

## 环境要求

- Node.js >= 20
- React Native 开发环境
  - iOS: Xcode 14+ 和 CocoaPods
  - Android: Android Studio 和 SDK 33+
- Yarn 或 npm 包管理器
- （可选）Supabase 账号用于云端同步

## 模板定制

在开始开发之前，您应该使用自己的应用信息定制模板：

```bash
# 使用 npm script（推荐）
npm run rename-app "我的应用" "MyApp" "myapp" "com.mycompany.myapp"

# 或直接运行
node scripts/rename-app.js "我的应用" "MyApp" "myapp" "com.mycompany.myapp"
```

参数说明：

- 中文名称：应用的中文显示名称（替换 BaseTemplateZh）
- 英文名称：应用的英文显示名称（替换 BaseTemplateEn）
- 小写名称：应用的小写名称（替换 basetemplate）
- Bundle ID：应用的包标识符（替换 com.basetemplate）

重命名后的步骤：

1. 验证更改：`npm run verify-rename`
2. 重新安装 iOS 依赖：`cd ios && pod install && cd ..`
3. 清理缓存：`npx react-native start --reset-cache`
4. 重新构建应用

## 快速开始

1. 安装依赖：

```bash
yarn install
# 或
npm install
```

2. 安装 iOS 依赖：

```bash
cd ios && pod install && cd ..
```

3. 配置环境变量（离线模式可选）：

```bash
cp .env.example .env
# 编辑 .env 文件，如需云端同步请添加 Supabase 凭证
```

4. 运行应用：

iOS:

```bash
yarn ios
# 或
npm run ios
```

Android:

```bash
yarn android
# 或
npm run android
```

## 项目结构

```
src/
├── components/          # 可复用的 UI 组件
│   ├── AlertProvider.tsx      # 全局提醒提供器
│   ├── BottomNav.tsx          # 底部导航栏
│   ├── CustomAlert.tsx        # 自定义提醒组件
│   ├── ErrorBoundary.tsx      # 错误边界
│   ├── Header.tsx             # 页面头部
│   └── LoadingSpinner.tsx     # 加载动画
├── screens/            # 页面组件
│   ├── HomeScreen.tsx         # 首页
│   ├── LoginScreen.tsx        # 登录页
│   └── ProfileScreen.tsx      # 个人中心
├── contexts/           # React Context 状态管理
│   ├── AuthContext.tsx        # 认证状态
│   ├── ThemeContext.tsx       # 主题状态
│   └── LanguageContext.tsx    # 语言状态
├── navigation/         # 导航配置
│   ├── AppNavigator.tsx       # 应用导航器
│   ├── MainTabNavigator.tsx   # 主标签导航
│   └── types.ts               # 导航类型定义
├── services/           # API 和数据服务
│   ├── authService.ts         # 认证服务
│   ├── cacheService.ts        # 缓存服务
│   └── supabase.ts            # Supabase 客户端
├── utils/              # 工具函数
│   ├── alert.ts               # 提醒工具
│   ├── formatters.ts          # 格式化工具
│   └── performance.ts         # 性能优化工具
├── constants/          # 常量和配置
│   ├── colors.ts              # 颜色主题
│   ├── translations.ts        # 翻译配置
│   └── locales/               # 语言包
└── types/              # TypeScript 类型定义
```

## 配置说明

### 环境变量

在项目根目录创建 `.env` 文件：

```env
SUPABASE_URL=你的_supabase_项目地址
SUPABASE_ANON_KEY=你的_supabase_匿名密钥
```

如果不配置 Supabase，应用将以离线模式运行。

### 主题自定义

编辑 `src/constants/colors.ts` 自定义主题颜色：

```typescript
export const lightTheme = {
  primary: '#1c74e9',
  background: '#ffffff',
  // ... 更多颜色配置
};
```

### 添加新语言

1. 在 `src/constants/locales/` 创建新的语言文件
2. 在 `src/constants/translations.ts` 添加翻译
3. 更新 `LanguageContext.tsx` 以支持新语言

## 测试

运行测试：

```bash
yarn test
# 或
npm test
```

运行测试并生成覆盖率报告：

```bash
yarn test -- --coverage
```

监听模式运行测试：

```bash
yarn test -- --watch
```

## 技术栈

### 核心框架

- React Native 0.83.1 (CLI)
- React 19.2.0
- TypeScript 5.8.3

### 导航与 UI

- React Navigation 7.x (Stack & Bottom Tabs)
- React Native Vector Icons
- React Native Safe Area Context
- React Native Gesture Handler

### 状态与数据

- React Context API
- AsyncStorage 本地持久化
- Supabase 后端服务（可选）

### 开发工具

- Jest & React Native Testing Library
- ESLint & Prettier
- Babel & Metro 打包工具

## 生产构建

### Android

```bash
cd android
./gradlew assembleRelease
```

APK 位置：`android/app/build/outputs/apk/release/app-release.apk`

### iOS

```bash
cd ios
xcodebuild -workspace [yourapp].xcworkspace -scheme [yourapp] -configuration Release
```

或使用 Xcode 进行归档和分发。

注意：运行重命名脚本后，将 `[yourapp]` 替换为您的实际应用名称。

## 模板特色

### 1. 开箱即用的认证系统

- 完整的登录/注册流程
- Session 管理和自动刷新
- 支持离线模式（无需后端即可运行）

### 2. 灵活的主题系统

- 浅色/深色/跟随系统三种模式
- 持久化保存用户偏好
- 全局主题切换，无需重启应用

### 3. 完善的国际化方案

- 自动检测系统语言
- 运行时切换语言
- 易于扩展新语言

### 4. 性能优化最佳实践

- 防抖和节流工具函数
- 懒加载和代码分割
- 性能监控工具

### 5. 健壮的错误处理

- 全局错误边界
- 优雅的降级 UI
- 开发环境详细错误信息

### 6. 现代化的开发体验

- TypeScript 严格模式
- 完整的类型定义
- 清晰的代码组织结构

## 贡献

这是一个模板项目，欢迎 Fork 并根据您的需求进行定制。

## 许可证

Apache-2.0
