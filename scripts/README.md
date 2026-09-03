# 应用重命名脚本使用说明

## 功能说明

`rename-app.js` 脚本用于将 React Native 模板项目自定义为您自己的应用。它会自动替换以下内容：

- 应用的中文显示名称（BaseTemplateZh）
- 应用的英文显示名称（BaseTemplateEn）
- 应用的小写名称（basetemplate）
- 应用的 Bundle ID（com.basetemplate）
- Android 和 iOS 相关的文件夹和文件名

## 使用方法

```bash
node scripts/rename-app.js <中文名称> <英文名称> <小写名称> <Bundle ID>
```

### 参数说明

1. **中文名称**：应用的中文显示名称

   - 示例：`"我的应用"`
   - 用途：替换 BaseTemplateZh

2. **英文名称**：应用的英文显示名称

   - 示例：`"MyApp"`
   - 用途：替换 BaseTemplateEn
   - 要求：建议使用大驼峰命名（PascalCase）

3. **小写名称**：应用的小写名称

   - 示例：`"myapp"`
   - 用途：替换 basetemplate
   - 要求：只能包含小写字母和数字，必须以字母开头

4. **Bundle ID**：应用的包标识符
   - 示例：`"com.mycompany.myapp"`
   - 用途：替换 com.basetemplate
   - 要求：反向域名格式，如 com.company.app

## 使用示例

### 示例 1：创建一个名为"我的应用"的应用

```bash
node scripts/rename-app.js "我的应用" "MyApp" "myapp" "com.mycompany.myapp"
```

### 示例 2：创建一个名为"待办事项"的应用

```bash
node scripts/rename-app.js "待办事项" "TodoList" "todolist" "com.example.todolist"
```

### 示例 3：创建一个名为"天气预报"的应用

```bash
node scripts/rename-app.js "天气预报" "WeatherApp" "weatherapp" "com.weather.app"
```

## 脚本执行的操作

脚本会自动执行以下操作：

### 1. 更新配置文件

- `package.json` - 更新项目名称
- `app.json` - 更新应用名称和显示名称
- `index.js` - 更新应用注册名称（如有需要）

### 2. 更新 Android 配置

- `android/app/build.gradle` - 更新 namespace 和 applicationId
- `android/settings.gradle` - 更新项目名称
- `android/app/src/main/res/values/strings.xml` - 更新应用显示名称
- 重命名 Android 包名文件夹结构

### 3. 更新 iOS 配置

- `ios/Podfile` - 更新 target 名称
- `ios/basetemplate/Info.plist` - 更新 Bundle Identifier
- `ios/basetemplate/zh-Hans.lproj/InfoPlist.strings` - 更新中文显示名称
- `ios/basetemplate/en.lproj/InfoPlist.strings` - 更新英文显示名称
- 更新 Xcode 项目文件（.xcodeproj）
- 重命名 iOS 文件夹和项目

### 4. 清理构建缓存

- 删除 Android build 文件夹
- 删除 iOS build 文件夹
- 删除 Pods 文件夹和 Podfile.lock

## 重命名后的步骤

脚本执行完成后，请按照以下步骤操作：

### 1. 重新安装 iOS 依赖

```bash
cd ios && pod install && cd ..
```

### 2. 清理缓存并重启 Metro

```bash
npx react-native start --reset-cache
```

### 3. 重新构建应用

Android:

```bash
npx react-native run-android
```

iOS:

```bash
npx react-native run-ios
```

## 注意事项

1. **备份项目**：在运行脚本之前，建议先备份您的项目或使用版本控制系统（如 Git）。

2. **参数验证**：

   - 小写名称只能包含小写字母和数字，必须以字母开头
   - Bundle ID 必须符合反向域名格式（如 com.company.app）

3. **文件夹重命名**：脚本会自动重命名 iOS 相关的文件夹和项目文件，包括：

   - `ios/basetemplate` → `ios/[小写名称]`
   - `ios/basetemplate.xcodeproj` → `ios/[小写名称].xcodeproj`
   - `ios/basetemplate.xcworkspace` → `ios/[小写名称].xcworkspace`

4. **Android 包名**：脚本会根据新的 Bundle ID 重新组织 Android 的包结构。

5. **清理缓存**：脚本会自动清理构建缓存，但如果遇到问题，可能需要手动删除以下文件夹：
   - `node_modules`
   - `android/.gradle`
   - `android/app/build`
   - `ios/Pods`
   - `ios/build`

## 常见问题

### Q: 运行脚本后应用无法启动？

A: 请确保：

1. 已重新安装 iOS 依赖（`cd ios && pod install`）
2. 已清理缓存（`npx react-native start --reset-cache`）
3. 已删除旧的构建文件

### Q: Android 构建失败？

A: 尝试以下步骤：

1. 清理 Gradle 缓存：`cd android && ./gradlew clean && cd ..`
2. 删除 `.gradle` 文件夹
3. 重新同步项目

### Q: iOS 构建失败？

A: 尝试以下步骤：

1. 删除 `ios/Pods` 和 `ios/Podfile.lock`
2. 重新安装 Pods：`cd ios && pod install && cd ..`
3. 在 Xcode 中清理构建文件夹（Product → Clean Build Folder）

### Q: 可以多次运行脚本吗？

A: 不建议。脚本设计为在初始化项目时运行一次。如果需要再次更改名称，建议从模板重新开始或手动修改相关文件。

## 技术支持

如果遇到问题，请检查：

1. Node.js 版本是否 >= 20
2. 是否有足够的文件系统权限
3. 项目结构是否完整

更多信息请参考主 README 文件。
