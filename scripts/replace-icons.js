/**
 * 一次性迁移脚本：将 react-native-vector-icons/Ionicons 替换为项目 AppIcon 组件。
 *
 * - 仅在图标专属上下文（name=/icon= 属性值）内做语义名映射，避免误伤普通字符串。
 * - <Icon / <Ionicons JSX 标识符改为 <AppIcon。
 * - import 行改为相对路径引用 src/components/icons/AppIcon。
 *
 * 用法：node scripts/replace-icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const ICON_MODULE = path.join(ROOT, 'components', 'icons', 'AppIcon');

/** Ionicons 名 → icon_library_v0_1 语义名（默认映射） */
const MAP = {
  'information-circle-outline': 'help',
  'shield-checkmark-outline': 'lock',
  'person-circle-outline': 'person',
  'person-remove-outline': 'logout',
  'share-social-outline': 'share',
  'document-text-outline': 'note',
  'chevron-forward': 'chevron_right',
  'chevron-back': 'back',
  'chevron-down': 'expand_more',
  'chevron-up': 'expand_less',
  'close-circle': 'clear_field',
  'checkmark-circle': 'success',
  'images-outline': 'gallery',
  'image-outline': 'photo',
  'fish-outline': 'species',
  'lock-closed-outline': 'lock',
  'camera-outline': 'camera',
  'funnel-outline': 'filter',
  'code-slash-outline': 'length',
  'resize-outline': 'length',
  'copy-outline': 'flip',
  'ellipsis-horizontal': 'more',
  'options-outline': 'filter',
  'search-outline': 'search',
  'sparkles-outline': 'sparkles',
  'videocam-outline': 'video',
  'scale-outline': 'weight',
  'settings-outline': 'edit',
  'happy-outline': 'person',
  'person-outline': 'person',
  'calendar-outline': 'date',
  'download-outline': 'save',
  'trash-outline': 'trash',
  'location-outline': 'location',
  'book-outline': 'fish_guide',
  'mic-outline': 'voice',
  'alert-circle': 'warning',
  'trending-up': 'weight',
  'log-out-outline': 'logout',
  'key-outline': 'lock',
  'shield-outline': 'lock',
  'today-outline': 'date',
  'arrow-forward': 'chevron_right',
  'eye-off-outline': 'visibility_off',
  'eye-outline': 'visibility',
  'checkmark': 'check',
  'thumbs-up': 'sparkles',
  'share-social': 'share',
  'locate': 'location',
  'location': 'location',
  'search': 'search',
  'sparkles': 'sparkles',
  'refresh': 'retry_refresh',
  'sync': 'retry_refresh',
  'trophy': 'weight',
  'pencil': 'edit',
  'camera': 'camera',
  'play': 'play',
  'close': 'close',
  'remove': 'remove',
  'add': 'add',
  'fish': 'species',
  'mic': 'voice',
};

/** 同名不同义的上下文差异（先于默认映射应用） */
const FILE_OVERRIDES = {
  // 媒体缺失兜底 → 图片不可用
  'CatchDetailScreen.tsx': { 'image-outline': 'image_missing' },
  // 从相册选择 → gallery
  'RecognitionIssueScreen.tsx': { 'image-outline': 'gallery' },
  // TOP 1 主鱼徽标
  'PosterCanvas.tsx': { ribbon: 'species' },
  // 生成年度分享 → share；平均每天统计 → chart
  'AnnualReviewScreen.tsx': { ribbon: 'share', 'stats-chart-outline': 'chart' },
  // 展示方式选项 → filter
  'ShareCreateScreen.tsx': { 'stats-chart-outline': 'filter' },
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function relImport(file) {
  let rel = path.relative(path.dirname(file), ICON_MODULE).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return `import { AppIcon } from '${rel}';`;
}

const changed = [];
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('react-native-vector-icons/Ionicons')) continue;

  const overrides = FILE_OVERRIDES[path.basename(file)] || {};
  let out = src;

  // 1) import 行
  out = out.replace(
    /^import (?:Icon|Ionicons) from 'react-native-vector-icons\/Ionicons';\n?/m,
    `${relImport(file)}\n`,
  );

  // 2) JSX 标识符 <Icon / <Ionicons → <AppIcon（不动 <IconButton 等）
  out = out.replace(/<(Icon|Ionicons)(?=[\s/>])/g, '<AppIcon');

  // 3) name=/icon= 字符串属性值（含多行 JSX 的换行空白）
  out = out.replace(
    /(\bname\s*=\s*)(["'])([^"'\n]*)\2|(\bicon\s*=\s*)(["'])([^"'\n]*)\5/g,
    (m, nPre, _q1, nVal, iPre, _q2, iVal) => {
      if (nPre !== undefined) {
        const mapped = overrides[nVal] ?? MAP[nVal];
        return mapped ? `${nPre}"${mapped}"` : m;
      }
      const mapped = overrides[iVal] ?? MAP[iVal];
      return mapped ? `${iPre}"${mapped}"` : m;
    },
  );

  // 4) name={cond ? 'a' : 'b'} 三元属性内的字符串
  out = out.replace(
    /(\b(?:name|icon)\s*=\s*\{)([^{}]*) (\})/g,
    (m, pre, body, post) => {
      const next = body.replace(/(['"])([^"'\n]*)\1/g, (s, q, v) => {
        const mapped = overrides[v] ?? MAP[v];
        return mapped ? `'${mapped}'` : s;
      });
      return next === body ? m : `${pre}${next} ${post}`;
    },
  );

  if (out !== src) {
    fs.writeFileSync(file, out);
    changed.push(path.relative(path.join(ROOT, '..'), file));
  }
}
console.log(`已迁移 ${changed.length} 个文件:\n${changed.join('\n')}`);
