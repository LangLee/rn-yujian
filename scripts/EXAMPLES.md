# 应用重命名脚本使用示例

本文档提供了多个实际使用场景的示例，帮助您快速上手。

## 基本示例

### 示例 1：个人项目

创建一个个人待办事项应用：

```bash
npm run rename-app "待办清单" "TodoList" "todolist" "com.personal.todolist"
```

**说明：**

- 中文名：待办清单
- 英文名：TodoList
- 技术名：todolist
- Bundle ID：com.personal.todolist

### 示例 2：公司项目

创建一个公司的客户管理应用：

```bash
npm run rename-app "客户管理" "CRMApp" "crmapp" "com.mycompany.crm"
```

**说明：**

- 中文名：客户管理
- 英文名：CRMApp
- 技术名：crmapp
- Bundle ID：com.mycompany.crm

### 示例 3：电商应用

创建一个电商购物应用：

```bash
npm run rename-app "购物商城" "ShopMall" "shopmall" "com.shop.mall"
```

**说明：**

- 中文名：购物商城
- 英文名：ShopMall
- 技术名：shopmall
- Bundle ID：com.shop.mall

## 不同类型应用示例

### 社交类应用

```bash
# 社交网络
npm run rename-app "社交圈" "SocialCircle" "socialcircle" "com.social.circle"

# 即时通讯
npm run rename-app "即时通" "InstantChat" "instantchat" "com.chat.instant"

# 短视频
npm run rename-app "短视频" "ShortVideo" "shortvideo" "com.video.short"
```

### 工具类应用

```bash
# 天气预报
npm run rename-app "天气通" "WeatherPro" "weatherpro" "com.weather.pro"

# 计算器
npm run rename-app "计算器" "Calculator" "calculator" "com.tools.calculator"

# 笔记应用
npm run rename-app "云笔记" "CloudNote" "cloudnote" "com.note.cloud"
```

### 生活类应用

```bash
# 健身追踪
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.fitness.tracker"

# 美食推荐
npm run rename-app "美食地图" "FoodMap" "foodmap" "com.food.map"

# 旅游规划
npm run rename-app "旅行计划" "TravelPlanner" "travelplanner" "com.travel.planner"
```

### 教育类应用

```bash
# 在线学习
npm run rename-app "在线课堂" "OnlineClass" "onlineclass" "com.edu.onlineclass"

# 单词记忆
npm run rename-app "单词本" "WordBook" "wordbook" "com.edu.wordbook"

# 题库练习
npm run rename-app "题库通" "QuizBank" "quizbank" "com.edu.quizbank"
```

### 金融类应用

```bash
# 记账应用
npm run rename-app "记账本" "MoneyBook" "moneybook" "com.finance.moneybook"

# 投资理财
npm run rename-app "理财通" "WealthManager" "wealthmanager" "com.finance.wealth"

# 股票行情
npm run rename-app "股票通" "StockTracker" "stocktracker" "com.finance.stock"
```

## 命名建议

### 中文名称建议

- 简洁明了，2-4 个字为佳
- 易于记忆和传播
- 体现应用核心功能
- 避免使用生僻字

**好的例子：**

- ✅ "待办清单"
- ✅ "天气通"
- ✅ "记账本"

**不好的例子：**

- ❌ "超级无敌待办事项管理系统"（太长）
- ❌ "囧囧有神"（不明确功能）

### 英文名称建议

- 使用大驼峰命名（PascalCase）
- 清晰表达应用用途
- 避免使用特殊字符
- 可以是单词组合

**好的例子：**

- ✅ TodoList
- ✅ WeatherPro
- ✅ MoneyBook

**不好的例子：**

- ❌ todo_list（使用了下划线）
- ❌ TODOLIST（全大写）
- ❌ todo-list（使用了连字符）

### 小写名称建议

- 全部小写字母
- 只能包含字母和数字
- 必须以字母开头
- 不能包含空格或特殊字符

**好的例子：**

- ✅ todolist
- ✅ weatherpro
- ✅ moneybook

**不好的例子：**

- ❌ TodoList（包含大写）
- ❌ todo_list（包含下划线）
- ❌ 123todo（以数字开头）

### Bundle ID 建议

- 使用反向域名格式
- 全部小写
- 使用点号分隔
- 通常格式：com.公司名.应用名

**好的例子：**

- ✅ com.mycompany.todolist
- ✅ com.example.weatherpro
- ✅ io.github.username.appname

**不好的例子：**

- ❌ todolist（缺少域名）
- ❌ com.MyCompany.TodoList（包含大写）
- ❌ com.company（太短，缺少应用名）

## 完整工作流示例

假设您要创建一个名为"健身助手"的应用，完整流程如下：

### 1. 准备信息

```
中文名称：健身助手
英文名称：FitnessTracker
小写名称：fitnesstracker
Bundle ID：com.fitness.tracker
```

### 2. 运行重命名脚本

```bash
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.fitness.tracker"
```

### 3. 验证更改

```bash
npm run verify-rename
```

### 4. 安装依赖

```bash
# 安装 Node 依赖
npm install

# 安装 iOS 依赖（macOS）
cd ios && pod install && cd ..
```

### 5. 运行应用

```bash
# 启动 Metro
npm start

# 在新终端运行 Android
npm run android

# 或运行 iOS（macOS）
npm run ios
```

## 故障排除

### 问题：参数格式错误

```bash
# ❌ 错误：缺少引号
npm run rename-app 健身助手 FitnessTracker fitnesstracker com.fitness.tracker

# ✅ 正确：使用引号包裹参数
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.fitness.tracker"
```

### 问题：小写名称包含大写字母

```bash
# ❌ 错误
npm run rename-app "健身助手" "FitnessTracker" "FitnessTracker" "com.fitness.tracker"

# ✅ 正确
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.fitness.tracker"
```

### 问题：Bundle ID 格式错误

```bash
# ❌ 错误：缺少域名部分
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "fitnesstracker"

# ❌ 错误：包含大写字母
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.Fitness.Tracker"

# ✅ 正确
npm run rename-app "健身助手" "FitnessTracker" "fitnesstracker" "com.fitness.tracker"
```

## 高级用例

### 多语言应用

如果您的应用支持多种语言，中文名和英文名应该是对应的翻译：

```bash
# 中文：天气预报，英文：Weather Forecast
npm run rename-app "天气预报" "WeatherForecast" "weatherforecast" "com.weather.forecast"

# 中文：音乐播放器，英文：Music Player
npm run rename-app "音乐播放器" "MusicPlayer" "musicplayer" "com.music.player"
```

### 企业应用

企业应用通常使用公司域名作为 Bundle ID 前缀：

```bash
# 假设公司域名是 acme.com
npm run rename-app "企业通讯录" "EnterpriseContacts" "enterprisecontacts" "com.acme.contacts"

# 假设公司域名是 techcorp.io
npm run rename-app "项目管理" "ProjectManager" "projectmanager" "io.techcorp.pm"
```

### 开源项目

开源项目可以使用 GitHub 用户名：

```bash
# GitHub 用户名：johndoe
npm run rename-app "开源工具" "OpenTool" "opentool" "io.github.johndoe.opentool"
```

## 更多帮助

- 查看 [scripts/README.md](./README.md) 了解脚本详细说明
- 查看 [TEMPLATE_SETUP.md](../TEMPLATE_SETUP.md) 了解完整设置流程
- 查看主 [README.md](../README.md) 了解项目功能

如有问题，请检查：

1. Node.js 版本是否 >= 20
2. 参数是否使用引号包裹
3. 小写名称是否全部小写
4. Bundle ID 格式是否正确
