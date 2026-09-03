#!/usr/bin/env node

/**
 * 验证应用重命名是否成功
 * 检查关键文件中是否还存在旧的模板名称
 */

const fs = require('fs');
const path = require('path');

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

// 需要检查的文件和不应该存在的字符串
const checks = [
  {
    file: 'package.json',
    shouldNotContain: ['basetemplate'],
    description: 'package.json 中的应用名称',
  },
  {
    file: 'app.json',
    shouldNotContain: ['basetemplate', 'BaseTemplateEn'],
    description: 'app.json 中的应用配置',
  },
  {
    file: 'android/app/build.gradle',
    shouldNotContain: ['com.basetemplate'],
    description: 'Android build.gradle 中的包名',
  },
  {
    file: 'android/settings.gradle',
    shouldNotContain: ['basetemplate'],
    description: 'Android settings.gradle 中的项目名',
  },
  {
    file: 'android/app/src/main/res/values/strings.xml',
    shouldNotContain: ['BaseTemplateEn'],
    description: 'Android strings.xml 中的应用名称',
  },
  {
    file: 'ios/Podfile',
    shouldNotContain: ['basetemplate'],
    description: 'iOS Podfile 中的 target 名称',
  },
  {
    file: 'src/services/authService.ts',
    shouldNotContain: ['@basetemplate'],
    description: 'authService.ts 中的存储键',
  },
];

log('\n开始验证应用重命名...', 'cyan');
log('='.repeat(50), 'cyan');

let hasIssues = false;
let checkedFiles = 0;
let skippedFiles = 0;

checks.forEach(({ file, shouldNotContain, description }) => {
  const filePath = path.join(process.cwd(), file);

  if (!fs.existsSync(filePath)) {
    log(`⚠ 跳过: ${file} (文件不存在)`, 'yellow');
    skippedFiles++;
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const foundIssues = [];

    shouldNotContain.forEach((text) => {
      if (content.includes(text)) {
        foundIssues.push(text);
      }
    });

    if (foundIssues.length > 0) {
      log(`✗ ${description}`, 'red');
      log(`  文件: ${file}`, 'red');
      log(`  发现旧名称: ${foundIssues.join(', ')}`, 'red');
      hasIssues = true;
    } else {
      log(`✓ ${description}`, 'green');
    }

    checkedFiles++;
  } catch (error) {
    log(`✗ 读取文件失败: ${file} - ${error.message}`, 'red');
    hasIssues = true;
  }
});

// 检查 iOS 文件夹是否已重命名
log('\n检查文件夹重命名...', 'cyan');
if (fs.existsSync('ios/basetemplate')) {
  log('✗ iOS 文件夹未重命名: ios/basetemplate 仍然存在', 'red');
  hasIssues = true;
} else {
  log('✓ iOS 文件夹已重命名', 'green');
}

if (fs.existsSync('ios/basetemplate.xcodeproj')) {
  log('✗ Xcode 项目未重命名: ios/basetemplate.xcodeproj 仍然存在', 'red');
  hasIssues = true;
} else {
  log('✓ Xcode 项目已重命名', 'green');
}

// 检查 Android 包名文件夹
if (fs.existsSync('android/app/src/main/java/com/basetemplate')) {
  log('✗ Android 包名文件夹未重命名: com/basetemplate 仍然存在', 'red');
  hasIssues = true;
} else {
  log('✓ Android 包名文件夹已重命名', 'green');
}

// 总结
log('\n' + '='.repeat(50), 'cyan');
log(
  `检查完成: ${checkedFiles} 个文件已检查, ${skippedFiles} 个文件跳过`,
  'cyan',
);

if (hasIssues) {
  log('\n❌ 发现问题！请检查上述错误并手动修复。', 'red');
  process.exit(1);
} else {
  log('\n✅ 验证通过！应用重命名成功。', 'green');
  log('\n后续步骤:', 'yellow');
  log('1. 运行: cd ios && pod install && cd ..', 'cyan');
  log('2. 运行: npx react-native start --reset-cache', 'cyan');
  log('3. 构建并运行应用', 'cyan');
  process.exit(0);
}
