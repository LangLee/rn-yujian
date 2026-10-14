/**
 * 从设计系统冻结 SVG 母版提取图标几何数据，生成 src/components/icons/iconDefs.ts。
 *
 * 源：design/system/icon_library_v0_1/assets/ic_*_v1.svg（43 张冻结母版）
 * 输出为纯数据模块，由 AppIcon.tsx 用 react-native-svg 渲染。
 *
 * 用法：node scripts/gen-icon-defs.js
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR =
  '/Users/liliang/Documents/mine/code/android/Yujian_App/design/system/icon_library_v0_1/assets';
const OUT_FILE = path.join(__dirname, '..', 'src', 'components', 'icons', 'iconDefs.ts');

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

const num = (s) => Number.parseFloat(s);

/** 解析单个元素标签的自属性 */
function parseElement(tag) {
  const attr = (name) => {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : undefined;
  };
  const filled = attr('fill') === 'currentColor';
  if (tag.startsWith('<path')) {
    const d = attr('d');
    if (!d) return null;
    return `{ t: 'p', d: '${d}'${filled ? ', f: true' : ''} }`;
  }
  if (tag.startsWith('<circle')) {
    const cx = attr('cx');
    const cy = attr('cy');
    const r = attr('r');
    if (cx === undefined || cy === undefined || r === undefined) return null;
    return `{ t: 'c', cx: ${num(cx)}, cy: ${num(cy)}, r: ${num(r)}${filled ? ', f: true' : ''} }`;
  }
  if (tag.startsWith('<rect')) {
    const x = attr('x');
    const y = attr('y');
    const w = attr('width');
    const h = attr('height');
    if ([x, y, w, h].some((v) => v === undefined)) return null;
    const rx = attr('rx');
    return `{ t: 'r', x: ${num(x)}, y: ${num(y)}, w: ${num(w)}, h: ${num(h)}, rx: ${rx ? num(rx) : 0}${filled ? ', f: true' : ''} }`;
  }
  return null;
}

const entries = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  const idMatch = file.match(/^ic_([a-z_]+)_v1\.svg$/);
  if (!idMatch) throw new Error(`无法解析文件名: ${file}`);
  const id = idMatch[1];

  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/);
  const label = titleMatch ? titleMatch[1] : id;

  // 提取 <g ...>...</g> 内部或 svg 顶层的所有 path/circle/rect 元素
  const gMatch = raw.match(/<g\b[^>]*>([\s\S]*?)<\/g>/);
  const body = gMatch ? gMatch[1] : raw;
  const tags = body.match(/<(path|circle|rect)\b[^>]*\/?>(?:<\/\1>)?/g) || [];
  const elements = tags.map(parseElement).filter(Boolean);
  if (elements.length === 0) throw new Error(`${file} 未提取到任何元素`);

  entries.push({ id, label, elements, file });
}

const lines = [];
lines.push(`/* eslint-disable prettier/prettier */`);
lines.push(`/**`);
lines.push(` * 渔见图标几何数据 —— 由 scripts/gen-icon-defs.js 从设计系统冻结母版生成，请勿手改。`);
lines.push(` * 源: design/system/icon_library_v0_1/assets/ic_*_v1.svg (43/43 FROZEN)`);
lines.push(` * 视觉合同: viewBox 0 0 24 24 · stroke 1.75 · 圆角线帽线节 · currentColor tint`);
lines.push(` * 扩展字形(ext 段)为库内无对应语义时按同一视觉规范补充，非冻结资源。`);
lines.push(` */`);
lines.push(``);
lines.push(`export type IconElement =`);
lines.push(`  | { t: 'p'; d: string; f?: true }`);
lines.push(`  | { t: 'c'; cx: number; cy: number; r: number; f?: true }`);
lines.push(`  | { t: 'r'; x: number; y: number; w: number; h: number; rx: number; f?: true };`);
lines.push(``);
lines.push(`export interface IconDef {`);
lines.push(`  /** 中文语义名（母版 title） */`);
lines.push(`  label: string;`);
lines.push(`  /** 来源: 冻结母版文件名 / ext=项目扩展 */`);
lines.push(`  source: string;`);
lines.push(`  elements: IconElement[];`);
lines.push(`}`);
lines.push(``);
lines.push(`export const ICON_DEFS = {`);
for (const e of entries) {
  lines.push(`  /** ${e.label} · ${e.file} */`);
  lines.push(`  ${JSON.stringify(e.id)}: { label: ${JSON.stringify(e.label)}, source: ${JSON.stringify(e.file)}, elements: [`);
  for (const el of e.elements) {
    lines.push(`    ${el},`);
  }
  lines.push(`  ] },`);
}
lines.push(`} as const satisfies Record<string, IconDef>;`);
lines.push(``);

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, lines.join('\n'));
console.log(`已生成 ${OUT_FILE}（${entries.length} 个冻结图标）`);
