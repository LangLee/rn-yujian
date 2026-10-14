import { Dimensions, Platform } from 'react-native';

/**
 * YuJian Core Visual System V1（Core UI V1 Token 层）。
 *
 * 来源：design/system/core_visual_v1/tokens/*.json（chore/core-ui-v1-freeze 分支）。
 * 设计参考画布 1080×1920；运行时按手册 5.4 Anchor/Geometry Contract 换算：
 * - 环境/几何锚点（rod、bobber、hero bbox…）用 normalized anchor 按 cover 比例映射；
 * - 文字、按钮等固定控件用 dp。
 * 该层是第二阶段 UI/UX 的视觉唯一事实来源，页面不得自造近似值。
 */

// ---------------------------------------------------------------------------
// 画布与几何换算
// ---------------------------------------------------------------------------

/** 设计参考画布宽（1080×1920） */
export const REF_CANVAS_WIDTH = 1080;
export const REF_CANVAS_HEIGHT = 1920;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** cover 映射器：参考画布 px → 任意实际容器 dp（几何/锚点用；cover 裁切下与场景像素严格对齐） */
export interface CoverMapper {
  scale: number;
  /** 参考画布 x → 容器 x */
  x: (px: number) => number;
  /** 参考画布 y → 容器 y */
  y: (py: number) => number;
  /** 参考画布尺寸 → 容器内长度（不位移，只缩放） */
  s: (px: number) => number;
}

/**
 * cover 布局：场景等比铺满给定容器所需的统一缩放与裁切偏移（居中裁切）。
 * 消费方应优先用容器实测尺寸（onLayout）构造，而不是模块初始化时的 Dimensions ——
 * edge-to-edge 下 Dimensions window 高度可能与根视图实际高度差一个导航栏 inset，
 * 用它算 cover 会把场景算短，底部露出兜底色（表现为一条白边）。
 */
export function makeCoverMapper(viewWidth: number, viewHeight: number): CoverMapper {
  const scale = Math.max(viewWidth / REF_CANVAS_WIDTH, viewHeight / REF_CANVAS_HEIGHT);
  const offsetX = (viewWidth - REF_CANVAS_WIDTH * scale) / 2;
  const offsetY = (viewHeight - REF_CANVAS_HEIGHT * scale) / 2;
  return {
    scale,
    x: (px) => offsetX + px * scale,
    y: (py) => offsetY + py * scale,
    s: (px) => px * scale,
  };
}

/** 模块级兜底映射（首次布局前/未自测量的旧用法；值取启动时 window 尺寸） */
const COVER = makeCoverMapper(SCREEN_W, SCREEN_H);

/** 参考画布 px → 屏幕 dp（几何/锚点用；cover 裁切下与场景像素严格对齐） */
export const refX = (px: number): number => COVER.x(px);
export const refY = (py: number): number => COVER.y(py);
/** 参考画布尺寸 px → dp 长度（不位移，只缩放） */
export const refS = (px: number): number => COVER.s(px);

// ---------------------------------------------------------------------------
// 色彩 Token（color_tokens.json）
// ---------------------------------------------------------------------------

export const coreColors = {
  /** 一级标题、重要图标、核心文字 */
  deepLakeBlue: '#0B2D4B',
  /** 正文、次级信息 */
  lakeBlue: '#34556F',
  /** 辅助文字、弱统计 */
  mistBlueGray: '#748897',
  /** 卡片基底 */
  lakeWhite: '#F7FAFB',
  /** 玻璃层基准 */
  mistWhite: 'rgba(255,255,255,0.68)',
  /** 品牌核心、重要时刻、Camera rim */
  morningGold: '#D6A541',
  /** 弱边线、轻高光 */
  softGold: '#E5C77C',
  /** Hero 图片底部文字保护 */
  deepOverlay: 'rgba(8,25,38,0.26)',
} as const;

// ---------------------------------------------------------------------------
// 间距 / 圆角 Token（spacing_tokens.json / radius_tokens.json，dp 值）
// ---------------------------------------------------------------------------

/** 页面左右安全边距：冻结稿卡片内缩约 5.8% 屏宽 */
export const PAGE_MARGIN = Math.round(SCREEN_W * 0.058);

export const coreSpacing = {
  /** SP_1..SP_4（文字、图标、小间距） */
  sp1: 8,
  sp2: 16,
  sp3: 24,
  sp4: 32,
  /** SP_5..SP_6（模块之间） */
  sp5: 40,
  sp6: 48,
  /** SP_8..SP_10（页面留白） */
  sp8: 64,
  sp10: 80,
} as const;

/** 圆角：R_SM 16 / R_MD 24 / R_LG 36 / R_XL 44-48（参考 px，经 refS 按屏宽换算） */
export const coreRadius = {
  /** 小 Annotation */
  sm: refS(16),
  /** Pill / 小卡 */
  md: refS(24),
  /** 普通内容卡 */
  lg: refS(36),
  /** Hero / Primary Card */
  xl: refS(46),
  circle: 999,
} as const;

/** Hero 卡实际圆角：冻结稿目测 48-52px@941 ≈ 55-60px@1080，略大于 R_XL token 上限 */
export const HERO_CARD_RADIUS = Math.round(coreRadius.xl * 1.18);

// ---------------------------------------------------------------------------
// 玻璃 Token（glass_tokens.json）：仅 A/B/C 三级，页面不得传任意 alpha
// ---------------------------------------------------------------------------

export type GlassLevel = 'A' | 'B' | 'C';

export const coreGlass: Record<
  GlassLevel,
  { bg: string; border: string; shadow: string }
> = {
  /** 主内容、识别信息、主要记忆卡 */
  A: {
    bg: 'rgba(255,255,255,0.76)',
    border: 'rgba(255,255,255,0.85)',
    shadow: 'rgba(11,45,75,0.10)',
  },
  /** 故事、次级统计、辅助信息 */
  B: {
    bg: 'rgba(255,255,255,0.60)',
    border: 'rgba(255,255,255,0.55)',
    shadow: 'rgba(11,45,75,0.06)',
  },
  /** overlay / pill：Hero 文字保护、轻量 Pill */
  C: {
    bg: 'rgba(255,255,255,0.28)',
    border: 'rgba(255,255,255,0.42)',
    shadow: 'transparent',
  },
};

// ---------------------------------------------------------------------------
// 字体层级（typography_tokens.json；dp 值按冻结稿比例换算并微调）
// ---------------------------------------------------------------------------

/**
 * 三种角色：BRAND / DISPLAY / UI。
 * DISPLAY——轻出版/自然档案感，不过粗；UI——中性、清晰、可读。
 * 数值为 dp； serif 家族沿用 tokens.ts 的 font.serif。
 */
export const coreType = {
  /** 品牌字（渔见 Logo） */
  brand: 34,
  /** DISPLAY XL：情绪 Hero 文案（空首页「现在，轮到你」） */
  displayXL: 33,
  /** DISPLAY L：页面/鱼种标题 */
  displayL: 26,
  /** DISPLAY M：Section 标题（关于这次鱼获） */
  displayM: 18,
  /** UI L：统计数字等强调数据 */
  uiL: 23,
  /** UI M：按钮、正文值 */
  uiM: 16,
  /** UI S：元信息、标签 */
  uiS: 13,
  /** UI XS：弱注释、kicker */
  uiXS: 11,
} as const;

// ---------------------------------------------------------------------------
// 动效 Token（motion_tokens.json / Empty_Home_Motion_Spec_V2）
// ---------------------------------------------------------------------------

export const coreMotion = {
  principle: 'alive, not animated',
  emptyHome: {
    /** 鱼漂：仅 Y 轴 ±3 参考px，4600ms，0→-3→0→+3→0 */
    bobber: {
      durationMs: 4600,
      keyframes: [
        [0, 0],
        [1150, -3],
        [2300, 0],
        [3450, 3],
        [4600, 0],
      ] as [number, number][],
    },
    /** 涟漪：仅 1 个，scale 1→1.22，3200ms（alphaFrom 依产品调优 0.3→0.42 提亮） */
    ripple: { durationMs: 3200, scaleFrom: 1, scaleTo: 1.22, alphaFrom: 0.42, alphaTo: 0 },
    /** 云：约 0.2 参考px/s，基线周期 ~60s */
    cloud: { speedRefPxPerS: 0.2, baselineCycleMs: 60000 },
    /** 晨光粒子：4800ms，max alpha ≤0.18，6-12 粒 */
    sunBeam: { durationMs: 4800, maxAlpha: 0.18, particles: 8 },
    /** 相机金环扫光：首次 ~3000ms 后，持续 ~1400ms，间隔 ~9000ms */
    cameraGoldRim: { firstDelayMs: 3000, sweepMs: 1400, repeatIntervalMs: 9000 },
    /** 相机呼吸：~5000ms，max scale ≤1.015 */
    cameraBreath: { durationMs: 5000, maxScale: 1.015 },
  },
  content: {
    /** 内容页允许：soft entrance / scroll physics / image transition / press feedback */
    entranceMs: 420,
  },
} as const;

// ---------------------------------------------------------------------------
// 背景层级（Core Visual System §3）
// ---------------------------------------------------------------------------

export type BackgroundLevel = 'hero' | 'content' | 'data';

/** 背景存在感：Home 100%，内容页 ~75%，数据页 ~55%（同一清晨湖畔世界） */
export const backgroundSalience: Record<BackgroundLevel, number> = {
  hero: 1,
  content: 0.75,
  data: 0.55,
};

// ---------------------------------------------------------------------------
// Empty Home 锚点合同（anchor_contract.json，参考画布坐标）
// ---------------------------------------------------------------------------

export const emptyHomeAnchors = {
  bobber: { x: 518, y: 1084, w: 24, h: 122, waterContactY: 1168 },
  ripple: { x: 411, y: 1127, w: 238, h: 82, centerX: 530, centerY: 1168 },
  rod: { x: 0, y: 950, w: 450, h: 365 },
  /** 鱼线为矢量松弛曲线（见 MorningLakeScene），起点=竿尖像素 (399,23)+rod 锚点 */
  cameraCenter: { xNorm: 0.5, yNorm: 0.8354 },
} as const;

/** 相机按钮：视觉直径 ~168px@1080（bbox 208 含光晕），触控 ≥64dp */
export const CAPTURE_VISUAL_SIZE = Math.round(refS(168));
export const CAPTURE_TOUCH_SIZE = Math.max(64, CAPTURE_VISUAL_SIZE + 8);

/** 平台轻量化：Android 渲染压力更大时可选降低粒子数量 */
export const PARTICLE_COUNT = Platform.select({ ios: 8, android: 6, default: 8 });
