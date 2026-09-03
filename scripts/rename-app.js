#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 获取命令行参数
const args = process.argv.slice(2);

if (args.length !== 4) {
  log('错误: 需要提供4个参数', 'red');
  log('\n使用方法:', 'yellow');
  log(
    '  node scripts/rename-app.js <中文名称> <英文名称> <小写名称> <Bundle ID>',
    'cyan',
  );
  log('\n示例:', 'yellow');
  log(
    '  node scripts/rename-app.js "我的应用" "MyApp" "myapp" "com.mycompany.myapp"',
    'cyan',
  );
  log('\n参数说明:', 'yellow');
  log('  中文名称: 应用的中文显示名称 (替换 BaseTemplateZh)', 'cyan');
  log('  英文名称: 应用的英文显示名称 (替换 BaseTemplateEn)', 'cyan');
  log('  小写名称: 应用的小写名称 (替换 basetemplate)', 'cyan');
  log('  Bundle ID: 应用的Bundle ID (替换 com.basetemplate)', 'cyan');
  process.exit(1);
}

const [chineseName, englishName, lowercaseName, bundleId] = args;

// 验证参数
if (!/^[a-z][a-z0-9]*$/.test(lowercaseName)) {
  log('错误: 小写名称只能包含小写字母和数字，且必须以字母开头', 'red');
  process.exit(1);
}

if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(bundleId)) {
  log('错误: Bundle ID 格式不正确 (例如: com.company.app)', 'red');
  process.exit(1);
}

log('\n开始重命名应用...', 'green');
log(`中文名称: ${chineseName}`, 'cyan');
log(`英文名称: ${englishName}`, 'cyan');
log(`小写名称: ${lowercaseName}`, 'cyan');
log(`Bundle ID: ${bundleId}`, 'cyan');

// 替换文件内容的函数
function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    log(`  跳过 (文件不存在): ${filePath}`, 'yellow');
    return;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    replacements.forEach(({ from, to }) => {
      if (content.includes(from)) {
        content = content.replace(new RegExp(from, 'g'), to);
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      log(`  ✓ 已更新: ${filePath}`, 'green');
    }
  } catch (error) {
    log(`  ✗ 更新失败: ${filePath} - ${error.message}`, 'red');
  }
}

// 重命名文件或文件夹
function renameIfExists(oldPath, newPath) {
  if (!fs.existsSync(oldPath)) {
    log(`  跳过 (不存在): ${oldPath}`, 'yellow');
    return false;
  }

  try {
    fs.renameSync(oldPath, newPath);
    log(`  ✓ 已重命名: ${oldPath} -> ${newPath}`, 'green');
    return true;
  } catch (error) {
    log(`  ✗ 重命名失败: ${oldPath} - ${error.message}`, 'red');
    return false;
  }
}

// 定义需要替换的内容
const replacements = [
  { from: 'BaseTemplateZh', to: chineseName },
  { from: 'BaseTemplateEn', to: englishName },
  { from: 'BaseTemplate', to: englishName },
  { from: 'basetemplate', to: lowercaseName },
  { from: 'com.basetemplate', to: bundleId },
];

// 1. 更新 package.json
log('\n1. 更新 package.json', 'yellow');
replaceInFile('package.json', [{ from: 'basetemplate', to: lowercaseName }]);

// 2. 更新 app.json
log('\n2. 更新 app.json', 'yellow');
replaceInFile('app.json', [
  { from: 'basetemplate', to: lowercaseName },
  { from: 'BaseTemplateEn', to: englishName },
]);

// 3. 更新 Android 文件
log('\n3. 更新 Android 配置文件', 'yellow');
replaceInFile('android/app/build.gradle', replacements);

// 强制 namespace 与 build_config_package 与 Bundle ID 对齐
// (模板残留的其他包名前缀会导致 BuildConfig 无法解析，编译报 Unresolved reference)
const appBuildGradlePath = 'android/app/build.gradle';
if (fs.existsSync(appBuildGradlePath)) {
  let gradleContent = fs.readFileSync(appBuildGradlePath, 'utf8');
  gradleContent = gradleContent.replace(
    /namespace\s+"[^"]+"/,
    `namespace "${bundleId}"`,
  );
  gradleContent = gradleContent.replace(
    /("build_config_package",\s*)"[^"]+"/,
    `$1"${bundleId}"`,
  );
  fs.writeFileSync(appBuildGradlePath, gradleContent, 'utf8');
  log(`  ✓ namespace / build_config_package 已同步为 ${bundleId}`, 'green');
}

replaceInFile('android/app/src/main/res/values/strings.xml', [
  { from: 'BaseTemplateEn', to: englishName },
]);
replaceInFile('android/app/src/main/res/values-zh/strings.xml', [
  { from: 'BaseTemplateZh', to: chineseName },
]);
replaceInFile('android/settings.gradle', [
  { from: 'basetemplate', to: lowercaseName },
]);

// 4. 重命名 Android 包名文件夹 (自动定位源码目录，兼容任意模板包路径)
log('\n4. 重命名 Android 包名文件夹', 'yellow');
const androidJavaPath = 'android/app/src/main/java';

// 递归查找包含 MainActivity/MainApplication 的源码目录
function findAndroidSourceDir(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return null;
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (
      entry.isFile() &&
      (entry.name === 'MainApplication.kt' ||
        entry.name === 'MainActivity.kt' ||
        entry.name === 'MainApplication.java' ||
        entry.name === 'MainActivity.java')
    ) {
      return rootDir;
    }
    if (entry.isDirectory()) {
      const found = findAndroidSourceDir(fullPath);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

const androidSourceDir = findAndroidSourceDir(androidJavaPath);
if (!androidSourceDir) {
  log('  ⚠ 未找到 Android 原生源码目录，跳过包名迁移', 'yellow');
} else {
  // 从源码文件内容中读取当前包名
  const sourceFiles = fs.readdirSync(androidSourceDir);
  const sampleFile = sourceFiles.find((f) => /\.(kt|java)$/.test(f));
  const sampleContent = sampleFile
    ? fs.readFileSync(path.join(androidSourceDir, sampleFile), 'utf8')
    : '';
  const oldPackageMatch = sampleContent.match(/package\s+([\w.]+)/);
  const oldPackage = oldPackageMatch ? oldPackageMatch[1] : null;

  if (oldPackage && oldPackage !== bundleId) {
    // 创建新的包路径
    let currentPath = androidJavaPath;
    bundleId
      .split('.')
      .slice(1)
      .forEach((part) => {
        currentPath = path.join(currentPath, part);
        if (!fs.existsSync(currentPath)) {
          fs.mkdirSync(currentPath, { recursive: true });
        }
      });
    const newAndroidPackagePath = currentPath;

    // 复制文件并更新包名及其他旧名称
    // (例如 MainActivity 中 getMainComponentName 返回的 "basetemplate")
    sourceFiles.forEach((file) => {
      const oldFilePath = path.join(androidSourceDir, file);
      const newFilePath = path.join(newAndroidPackagePath, file);

      if (fs.statSync(oldFilePath).isFile()) {
        let content = fs.readFileSync(oldFilePath, 'utf8');
        content = content.replace(
          new RegExp(`package\\s+${oldPackage.replace(/\./g, '\\.')}`, 'g'),
          `package ${bundleId}`,
        );
        content = content
          .replace(/BaseTemplateZh/g, chineseName)
          .replace(/BaseTemplateEn/g, englishName)
          .replace(/basetemplate/g, lowercaseName);
        fs.writeFileSync(newFilePath, content, 'utf8');
        log(`  ✓ 已复制并更新: ${file}`, 'green');
      }
    });

    // 删除旧包文件夹，并清理残留的空父级目录
    fs.rmSync(androidSourceDir, { recursive: true, force: true });
    log(`  ✓ 已删除旧包文件夹: ${androidSourceDir}`, 'green');
    let parent = path.dirname(androidSourceDir);
    while (
      parent !== androidJavaPath &&
      fs.existsSync(parent) &&
      fs.readdirSync(parent).length === 0
    ) {
      fs.rmSync(parent, { recursive: true, force: true });
      log(`  ✓ 已清理空目录: ${parent}`, 'green');
      parent = path.dirname(parent);
    }
    log(`  ✓ 包名已更新: ${oldPackage} -> ${bundleId}`, 'green');
  } else {
    log('  ✓ 包名已与 Bundle ID 一致，跳过', 'green');
  }
}

// 5. 更新 iOS 文件
log('\n5. 更新 iOS 配置文件', 'yellow');
const iosOldPath = 'ios/basetemplate';
const iosNewPath = `ios/${lowercaseName}`;

// 更新 Info.plist
replaceInFile(`${iosOldPath}/Info.plist`, [
  { from: 'basetemplate', to: lowercaseName },
]);

// 更新本地化文件
replaceInFile(`${iosOldPath}/zh-Hans.lproj/InfoPlist.strings`, [
  { from: 'BaseTemplateZh', to: chineseName },
]);
replaceInFile(`${iosOldPath}/en.lproj/InfoPlist.strings`, [
  { from: 'BaseTemplateEn', to: englishName },
]);

// 6. 更新 Podfile
log('\n6. 更新 iOS Podfile', 'yellow');
replaceInFile('ios/Podfile', [{ from: 'basetemplate', to: lowercaseName }]);

// 7. 更新 Xcode 项目文件
log('\n7. 更新 Xcode 项目文件', 'yellow');
const pbxprojPath = 'ios/basetemplate.xcodeproj/project.pbxproj';
replaceInFile(pbxprojPath, [
  { from: 'basetemplate', to: lowercaseName },
  { from: 'com.basetemplate', to: bundleId },
]);

// 强制所有 PRODUCT_BUNDLE_IDENTIFIER 与 Bundle ID 对齐 (兼容模板残留的其他前缀)
if (fs.existsSync(pbxprojPath)) {
  let pbxContent = fs.readFileSync(pbxprojPath, 'utf8');
  pbxContent = pbxContent.replace(
    /PRODUCT_BUNDLE_IDENTIFIER(\[[^\]]*\])?\s*=\s*[^;]+;/g,
    (match) => match.replace(/=\s*[^;]+/, `= ${bundleId};`),
  );
  fs.writeFileSync(pbxprojPath, pbxContent, 'utf8');
  log(`  ✓ PRODUCT_BUNDLE_IDENTIFIER 已同步为 ${bundleId}`, 'green');
}

// 更新 xcscheme 文件
const oldSchemePath =
  'ios/basetemplate.xcodeproj/xcshareddata/xcschemes/basetemplate.xcscheme';
if (fs.existsSync(oldSchemePath)) {
  replaceInFile(oldSchemePath, [{ from: 'basetemplate', to: lowercaseName }]);
}

// 8. 重命名 iOS 文件夹和项目
log('\n8. 重命名 iOS 文件夹和项目', 'yellow');

// 重命名主文件夹
if (renameIfExists(iosOldPath, iosNewPath)) {
  // 重命名 xcodeproj
  renameIfExists(
    'ios/basetemplate.xcodeproj',
    `ios/${lowercaseName}.xcodeproj`,
  );

  // 重命名 xcworkspace
  renameIfExists(
    'ios/basetemplate.xcworkspace',
    `ios/${lowercaseName}.xcworkspace`,
  );

  // 更新 xcworkspace 内容
  const workspaceDataPath = `ios/${lowercaseName}.xcworkspace/contents.xcworkspacedata`;
  replaceInFile(workspaceDataPath, [
    { from: 'basetemplate', to: lowercaseName },
  ]);

  // 更新 xcscheme
  const schemePath = `ios/${lowercaseName}.xcodeproj/xcshareddata/xcschemes/basetemplate.xcscheme`;
  if (fs.existsSync(schemePath)) {
    replaceInFile(schemePath, [{ from: 'basetemplate', to: lowercaseName }]);
    renameIfExists(
      schemePath,
      `ios/${lowercaseName}.xcodeproj/xcshareddata/xcschemes/${lowercaseName}.xcscheme`,
    );
  }
}

// 9. 更新其他配置文件
log('\n9. 更新其他配置文件', 'yellow');

// 更新 index.js
replaceInFile('index.js', [{ from: 'basetemplate', to: lowercaseName }]);

// 更新 App.tsx (如果有应用名称引用)
replaceInFile('App.tsx', [
  { from: 'BaseTemplateEn', to: englishName },
  { from: 'BaseTemplateZh', to: chineseName },
]);

// 更新 authService.ts 中的存储键
replaceInFile('src/services/authService.ts', [
  { from: '@basetemplate', to: `@${lowercaseName}` },
]);

// 10. 清理构建缓存
log('\n10. 清理构建缓存', 'yellow');
try {
  // 清理 Android
  if (fs.existsSync('android/app/build')) {
    fs.rmSync('android/app/build', { recursive: true, force: true });
    log('  ✓ 已清理 Android build 文件夹', 'green');
  }

  // 清理 Android 根 build 目录 (包含 autolinking.json 缓存，
  // 不清理会导致生成的入口代码仍引用旧包名)
  if (fs.existsSync('android/build')) {
    fs.rmSync('android/build', { recursive: true, force: true });
    log('  ✓ 已清理 Android 根 build 文件夹 (autolinking 缓存)', 'green');
  }

  // 清理 iOS
  if (fs.existsSync(`ios/${lowercaseName}/build`)) {
    fs.rmSync(`ios/${lowercaseName}/build`, { recursive: true, force: true });
    log('  ✓ 已清理 iOS build 文件夹', 'green');
  }

  if (fs.existsSync('ios/Pods')) {
    fs.rmSync('ios/Pods', { recursive: true, force: true });
    log('  ✓ 已清理 iOS Pods 文件夹', 'green');
  }

  if (fs.existsSync('ios/Podfile.lock')) {
    fs.unlinkSync('ios/Podfile.lock');
    log('  ✓ 已删除 Podfile.lock', 'green');
  }
} catch (error) {
  log(`  ⚠ 清理缓存时出现警告: ${error.message}`, 'yellow');
}

log('\n✅ 应用重命名完成！', 'green');
log('\n后续步骤:', 'yellow');
log('1. 运行以下命令重新安装依赖:', 'cyan');
log('   cd ios && pod install && cd ..', 'cyan');
log('2. 清理并重新构建项目:', 'cyan');
log('   npx react-native start --reset-cache', 'cyan');
log('3. 运行应用:', 'cyan');
log('   npx react-native run-android', 'cyan');
log('   npx react-native run-ios', 'cyan');
log('\n注意: 如果遇到问题，请尝试删除 node_modules 并重新安装依赖。', 'yellow');
