/**
 * edge-aura 引擎移植（JS 纯函数 + SkSL 生成器）。
 *
 * 移植自 edge-aura v0.6.0（github.com/takuyajodai/edge-aura / edge-aura.js.org，
 * MIT License）的 Canvas 逐像素引擎，把「沿屏幕边缘的有机光晕」带到 React Native：
 *
 *  - 霓虹圆角环模型：一条贴着圆角矩形边的中线灯管，覆盖率为
 *    亮芯高斯 + 不对称羽化（管外紧致高斯 / 管内长尾有理函数，窗口在 band 处归零）；
 *  - 粗细与亮度由整数谐波环形噪声调制（沿环闭合无缝，随时间缓慢呼吸）；
 *  - 颜色取自调色板 LUT，按环弧长位置采样，整环缓慢旋转（默认 8s/圈）
 *    并叠加 ±10° 的色相摆动；
 *  - 角部为三分支（两条邻边 + 圆弧）能量加权合成，p3 范数并封顶 1.1×主支，
 *    颜色按覆盖度能量混合；
 *  - 暗底场景 alpha 过 pow(α, 0.55) gamma 提升，尾部羽化有体积感，
 *    LUT 在 Oklab 色度上预提升（darkChroma）。
 *
 * 差异（RN 环境的有意取舍）：
 *  - 原引擎中线贴屏幕边、管外被画布边缘裁掉；这里目标是一个独立矩形框，
 *    画布在框外留 pad，管外改用同一紧致高斯自然衰减（形态一致、可脱离屏幕边）；
 *  - 原引擎的敲键/点按弹簧为输入交互专属，取景框只有 idle 动效，不移植；
 *  - 逐像素计算放进 Skia RuntimeEffect（SkSL）由 GPU 执行，JS 侧只做
 *    一次性常量派生并烘进着色器源码；调色板 LUT 烘成 256×1 贴图供采样。
 */

/** 调色板停靠点：[位置 0..1, [r, g, b]]（首尾颜色必须一致，环闭合） */
export type EdgeAuraStop = [number, [number, number, number]];

/** #RRGGBB → [r, g, b]（把现有色 token 转成停靠点颜色） */
export const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    throw new Error(`edgeAura: 无效颜色 ${hex}`);
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const LUT_SIZE = 256;

/** 与原引擎一致的暗底感知权重基准（opal @ pastel 0.35 的平均相对亮度） */
const NORMALIZE_REF_DARK = 0.7286164828431372;

/** 环形噪声的空间频率（每弧长一圈的波数，5 条噪声流） */
const SPATIAL_FREQ = [0.015, 0.011, 0.013, 0.02, 0.012] as const;

// ---------------------------------------------------------------------------
// 色彩数学（sRGB / Oklab，与原引擎逐字对应）
// ---------------------------------------------------------------------------

const srgbToLinear = (c: number): number => {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
};

const linearToSrgb255 = (c: number): number => {
  const cc = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return (cc <= 0.0031308 ? 12.92 * cc : 1.055 * Math.pow(cc, 1 / 2.4) - 0.055) * 255;
};

const rgbToOklab = (r: number, g: number, b: number) => {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
};

const oklabToSrgb255 = (L: number, a: number, b: number) => {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: linearToSrgb255(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb255(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb255(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
};

/**
 * 调色板 LUT：sRGB 线性插值 + pastel 向白提亮（与原引擎 buildPaletteLut 一致）。
 * 返回 256×3 字节。
 */
export const buildPaletteLut = (stops: EdgeAuraStop[], pastel: number): Uint8Array => {
  const lut = new Uint8Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const p = i / (LUT_SIZE - 1);
    let si = 0;
    for (let s = 0; s < stops.length - 2; s++) {
      if (p >= stops[s][0] && p < stops[s + 1][0]) {
        si = s;
        break;
      }
      if (s === stops.length - 3) {
        si = stops.length - 2;
      }
    }
    const [t0, from] = stops[si];
    const [t1, to] = stops[si + 1];
    const f = t1 > t0 ? (p - t0) / (t1 - t0) : 0;
    const rr = from[0] + f * (to[0] - from[0]);
    const gg = from[1] + f * (to[1] - from[1]);
    const bb = from[2] + f * (to[2] - from[2]);
    lut[i * 3] = Math.round(rr + (255 - rr) * pastel);
    lut[i * 3 + 1] = Math.round(gg + (255 - gg) * pastel);
    lut[i * 3 + 2] = Math.round(bb + (255 - bb) * pastel);
  }
  return lut;
};

/** Oklab 色度提升（暗底提饱和，与原引擎 liftLutChroma 一致） */
export const liftLutChroma = (lut: Uint8Array, chroma: number): Uint8Array => {
  const out = new Uint8Array(lut.length);
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = rgbToOklab(lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]);
    const rgb = oklabToSrgb255(c.L, c.a * chroma, c.b * chroma);
    out[i * 3] = Math.round(rgb.r);
    out[i * 3 + 1] = Math.round(rgb.g);
    out[i * 3 + 2] = Math.round(rgb.b);
  }
  return out;
};

/** 暗底感知权重：LUT 平均相对亮度（距黑的距离），与原引擎 dark 分支一致 */
export const lutPerceptualWeightDark = (lut: Uint8Array): number => {
  let sum = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    sum += (0.2126 * lut[i * 3] + 0.7152 * lut[i * 3 + 1] + 0.0722 * lut[i * 3 + 2]) / 255;
  }
  return sum / LUT_SIZE;
};

export interface EdgeAuraPaletteResult {
  /** 256×4 RGBA（A=255），供烘成 256×1 LUT 贴图 */
  rgba: Uint8Array;
  /** 归一化后的整体光环透明度（原引擎 effRingAlpha） */
  effRingAlpha: number;
}

/**
 * 暗底调色板解析：LUT → 感知归一化 → 色度提升，流程与原引擎
 * resolvePalette(background:"dark") 一致（dark 分支不做 pastel 回退迭代）。
 */
export const resolveDarkPalette = (
  stops: EdgeAuraStop[],
  opts: { pastel?: number; darkChroma?: number; ringAlpha?: number } = {},
): EdgeAuraPaletteResult => {
  const pastel = opts.pastel ?? 0.35;
  const darkChroma = opts.darkChroma ?? 1.25;
  const ringAlpha = opts.ringAlpha ?? 0.9;
  let lut = buildPaletteLut(stops, pastel);
  const weight = lutPerceptualWeightDark(lut);
  const effRingAlpha = Math.min(1, Math.max(0.45, ringAlpha * (NORMALIZE_REF_DARK / weight)));
  if (darkChroma !== 1) {
    lut = liftLutChroma(lut, darkChroma);
  }
  const rgba = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    rgba[i * 4] = lut[i * 3];
    rgba[i * 4 + 1] = lut[i * 3 + 1];
    rgba[i * 4 + 2] = lut[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, effRingAlpha };
};

// ---------------------------------------------------------------------------
// 确定性随机（mulberry32）与噪声流谐波
// ---------------------------------------------------------------------------

/** 与原引擎一致的 32bit 确定性 PRNG（seed 选项的后端） */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 5 条噪声流的整数谐波 [k1, k2, k3]（整数倍频保证沿环逐字节闭合） */
export const deriveStreamHarmonics = (perimeter: number): [number, number, number][] => {
  const twoPi = Math.PI * 2;
  return SPATIAL_FREQ.map((freq) => {
    const k1 = Math.max(1, Math.round((perimeter * freq) / twoPi));
    return [k1, Math.max(1, Math.round(1.71 * k1)), Math.max(1, Math.round(0.39 * k1))] as [
      number,
      number,
      number,
    ];
  });
};

/** 5 条噪声流的随机相位（rand·80，同原引擎 phase 数组） */
export const derivePhases = (seed: number): number[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: 5 }, () => rand() * 80);
};

// ---------------------------------------------------------------------------
// SkSL 生成
// ---------------------------------------------------------------------------

export interface EdgeAuraShaderConfig {
  /** 取景框宽（pt） */
  frameWidth: number;
  /** 取景框高（pt） */
  frameHeight: number;
  /** 中线距框边的内缩（原引擎 inset，默认 3） */
  inset: number;
  /** 圆角半径（原引擎 cornerRadius） */
  cornerRadius: number;
  /** 羽化带深度（原引擎 band） */
  band: number;
  /** 归一化后的整体透明度 */
  ringAlpha: number;
  /** 5 条噪声流的谐波 */
  harmonics: [number, number, number][];
  /** 5 条噪声流的相位 */
  phases: number[];
  /** idle 旋转一圈的秒数（原引擎 rotateIdleS，默认 8） */
  rotateIdleS: number;
  /** 色相摆动幅度（度，默认 10） */
  hueDriftDeg: number;
  /** 色相摆动周期（秒，默认 12） */
  hueDriftPeriodS: number;
  /** 入场点亮扫过时长（秒，原引擎 kindleDurS） */
  kindleDurS: number;
  /**
   * 贴边模式（edge-aura 的本源用法）：中线紧贴画布边缘、画布即目标区域
   * （如整屏），管外一侧像原引擎一样被画布边界裁掉，不再四周留 pad。
   */
  edgeClipped?: boolean;
}

export interface EdgeAuraShaderBuild {
  sksl: string;
  /** 画布在框四周的留白（管外高斯可达范围） */
  pad: number;
}

/** 浮点常量烘焙格式：整数也带小数点（SkSL 严格类型） */
const fmt = (n: number): string => {
  const s = String(Math.round(n * 1e6) / 1e6);
  return s.includes('.') ? s : `${s}.0`;
};

/**
 * 生成完整的 SkSL RuntimeEffect 源码：所有几何/噪声/调色板常量烘焙为
 * const，仅 `time` 一个 uniform 随帧更新，调色板经 `lut` 子着色器采样。
 */
export const buildEdgeAuraShader = (cfg: EdgeAuraShaderConfig): EdgeAuraShaderBuild => {
  const { frameWidth: fw, frameHeight: fh, inset, cornerRadius: cr, band } = cfg;

  const rim = inset + cr;
  const arc = (Math.PI / 2) * cr;
  const lt = Math.max(1, fw - 2 * rim);
  const lh = Math.max(1, fh - 2 * rim);
  const per = 2 * lt + 2 * lh + 4 * arc;
  const thetaScale = (Math.PI * 2) / per;
  // band 缩放的羽化 σ 区间（原引擎 BLOOM_SCALE 派生值）
  const bloomScale = band / 76;
  const sbBase = 4.5 * bloomScale;
  const sbNoise = 5.5 * bloomScale;
  const sbClampLo = 4 * bloomScale;
  const sbClampHi = 16 * bloomScale;
  const innerSigmaMaxEff = 17 * bloomScale;
  const longFade = Math.max(2, cr);
  // 贴边模式不留白（画布边界即裁切，与原站行为一致）；
  // 浮动矩形模式四周留出管外高斯的可视可达（alpha<1/255：4.5σ 封顶 + inset）
  const pad = cfg.edgeClipped ? 0 : Math.ceil(Math.max(band, inset + 4.5 * sbClampHi + 1));
  // 环弧长锚点（s=0 起自顶边左端，顺时针：顶 → 右 → 底 → 左）
  const sRight0 = lt + arc;
  const sBottom0 = lt + 2 * arc + lh;
  const sLeft0 = 2 * lt + 3 * arc + lh;
  const sArcTR = lt;
  const sArcBR = lt + arc + lh;
  const sArcBL = 2 * lt + 2 * arc + lh;
  const sArcTL = 2 * lt + 3 * arc + 2 * lh;
  // 入场点亮起点：底边中点（快门所在侧）
  const kindleS0 = sBottom0 + lt / 2;

  const [h0, h1, h2, h3, h4] = cfg.harmonics;
  const [p0, p1, p2, p3, p4] = cfg.phases;

  const sksl = `
uniform shader lut;
uniform float time;

const float FW = ${fmt(fw)};
const float FH = ${fmt(fh)};
const float PAD = ${fmt(pad)};
const float INSET = ${fmt(inset)};
const float CR = ${fmt(cr)};
const float RIM = ${fmt(rim)};
const float ARC = ${fmt(arc)};
const float LT = ${fmt(lt)};
const float LH = ${fmt(lh)};
const float PER = ${fmt(per)};
const float THETA_SCALE = ${fmt(thetaScale)};
const float BAND = ${fmt(band)};
const float BAND_CUT = ${fmt(band - inset)};
const float LONG_FADE = ${fmt(longFade)};
const float OUT_REACH = ${fmt(inset + 4.5 * sbClampHi)};
const float SB_BASE = ${fmt(sbBase)};
const float SB_NOISE = ${fmt(sbNoise)};
const float SB_CLAMP_LO = ${fmt(sbClampLo)};
const float SB_CLAMP_HI = ${fmt(sbClampHi)};
const float INNER_SIGMA_MAX_EFF = ${fmt(innerSigmaMaxEff)};
const float CORE_SIGMA_BASE = ${fmt(1.6)};
const float CORE_SIGMA_VAR = ${fmt(0.6)};
const float INNER_SOFT_BASE = ${fmt(1.25)};
const float INNER_SOFT_VAR = ${fmt(0.45)};
const float RING_ALPHA = ${fmt(cfg.ringAlpha)};
const float CORE_WHITEN = ${fmt(0.35)};
const float ALPHA_GAMMA = ${fmt(0.55)};
const float ROTATE_RATE = ${fmt(1 / cfg.rotateIdleS)};
const float HUE_DRIFT_TURN = ${fmt(cfg.hueDriftDeg / 360)};
const float HUE_DRIFT_W = ${fmt((Math.PI * 2) / cfg.hueDriftPeriodS)};
const float S_RIGHT0 = ${fmt(sRight0)};
const float S_BOTTOM0 = ${fmt(sBottom0)};
const float S_LEFT0 = ${fmt(sLeft0)};
const float S_ARC_TR = ${fmt(sArcTR)};
const float S_ARC_BR = ${fmt(sArcBR)};
const float S_ARC_BL = ${fmt(sArcBL)};
const float S_ARC_TL = ${fmt(sArcTL)};
const float KINDLE_DUR = ${fmt(cfg.kindleDurS)};
const float KINDLE_SOFT = ${fmt(Math.max(8, per * 0.021))};
const float KINDLE_S0 = ${fmt(kindleS0)};
const float PI = ${fmt(Math.PI)};
const float HALF_PI = ${fmt(Math.PI / 2)};
const float K1_0 = ${fmt(h0[0])};
const float K2_0 = ${fmt(h0[1])};
const float K1_1 = ${fmt(h1[0])};
const float K2_1 = ${fmt(h1[1])};
const float K1_2 = ${fmt(h2[0])};
const float K2_2 = ${fmt(h2[1])};
const float K1_3 = ${fmt(h3[0])};
const float K2_3 = ${fmt(h3[1])};
const float K1_4 = ${fmt(h4[0])};
const float K2_4 = ${fmt(h4[1])};
const float PH0 = ${fmt(p0)};
const float PH1 = ${fmt(p1)};
const float PH2 = ${fmt(p2)};
const float PH3 = ${fmt(p3)};
const float PH4 = ${fmt(p4)};

float ss01(float x) {
  float t = clamp(x, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// 三倍频环形噪声：整数谐波保证沿环闭合无缝（原引擎 ringNoise）。
// 性能修订（移动端）：略去第三倍频（原权重 0.05，视觉不可辨），
// 每支路三角函数 15 → 10 个，全屏着色器开销降三分之一。
float ringNoise(float ta, float th, float k1, float k2, float ph) {
  return 0.5
    + 0.27 * sin(0.9 * ta + k1 * th + ph)
    + 0.18 * sin(2.33 * ta + k2 * th + ph * 1.71);
}

// 入场点亮：光锋自底边中点 easeOutCubic 扫过半环（原引擎 kindle）
float kindleEnv(float s, float t) {
  float kf = clamp(t / KINDLE_DUR, 0.0, 1.0);
  float u = 1.0 - kf;
  float front = (1.0 - u * u * u) * (PER * 0.5 + KINDLE_SOFT);
  float ds = abs(s - KINDLE_S0);
  float d = min(ds, PER - ds);
  return ss01((front - d) / KINDLE_SOFT);
}

struct Branch {
  float cov;
  float core;
  float env;
  float3 rgb;
};

struct Acc {
  float cov;
  float p3;
  float coreP3;
  float dom;
  float env;
  float3 col;
};

// 单支路的霓虹覆盖：亮芯高斯 + 不对称羽化（内长尾 / 外紧致）
Branch evalBranch(float s, float tIn, float t) {
  float th = THETA_SCALE * s;
  float Ac = 0.92 + 0.08 * ringNoise(t * 0.5, th, K1_2, K2_2, PH2);
  float sc = CORE_SIGMA_BASE + CORE_SIGMA_VAR * (2.0 * ringNoise(t * 0.4, th, K1_3, K2_3, PH3) - 1.0);
  float coreDen = 2.0 * sc * sc;
  float Ab = clamp(0.15 + 0.5 * ringNoise(t * 0.5, th, K1_1, K2_1, PH1), 0.0, 0.85);
  float sb = clamp(SB_BASE + SB_NOISE * ringNoise(t * 0.6, th, K1_0, K2_0, PH0), SB_CLAMP_LO, SB_CLAMP_HI);
  float sbIn = min(INNER_SIGMA_MAX_EFF, sb * (INNER_SOFT_BASE + INNER_SOFT_VAR * ringNoise(t * 0.45, th, K1_4, K2_4, PH4)));
  float a = abs(tIn);
  float tt = a * a;
  float core = tt < 40.0 ? Ac * exp(-tt / coreDen) : 0.0;
  float bloom;
  if (tIn > 0.0) {
    float uq = 1.0 + tt / (2.0 * sbIn * sbIn);
    float x = (a + INSET) / BAND;
    float w4 = 1.0 - x * x * x * x;
    float win = w4 > 0.0 ? w4 * w4 * (3.0 - 2.0 * w4) : 0.0;
    bloom = win > 0.0 ? Ab * win / (uq * sqrt(uq)) : 0.0;
  } else {
    bloom = Ab * exp(-tt / (2.0 * sb * sb));
  }
  Branch b;
  b.cov = core + bloom;
  b.core = core;
  b.env = kindleEnv(s, t);
  float p = fract(s / PER + t * ROTATE_RATE + HUE_DRIFT_TURN * sin(HUE_DRIFT_W * t));
  b.rgb = lut.eval(float2(p * 255.0, 0.5)).rgb;
  return b;
}

// 分支累加：coverage 立方和（p3 范数用）、覆盖度能量加权混色
void addBranch(inout Acc a, Branch b, float w) {
  float c = b.cov * w;
  if (c > 0.0) {
    a.cov += c;
    a.p3 += c * c * c;
    a.dom = max(a.dom, c);
    float cr = b.core * w;
    a.coreP3 += cr * cr * cr;
    a.env += c * b.env;
    a.col += c * b.rgb;
  }
}

// 端点所属边的带符号深度（角部端点回退的符号，对应原引擎 e0IsH 判定）
float edgeDepthAt(float ex, float ey, float x, float y) {
  bool top = abs(ey - INSET) < 0.25;
  bool bottom = abs(ey - (FH - INSET)) < 0.25;
  if (top || bottom) {
    return top ? y - INSET : (FH - y) - INSET;
  }
  return abs(ex - INSET) < 0.25 ? x - INSET : (FW - x) - INSET;
}

// 圆角弧支路：象限内取 CR-半径；象限外回退到近端点距离（带边深度符号）
void arcBranch(inout Acc a, float x, float y, float cx, float cy, float thOff, float s0, float t) {
  float dx = x - cx;
  float dy = y - cy;
  if (abs(dx) > RIM + BAND || abs(dy) > RIM + BAND) {
    return;
  }
  float fRaw = (atan(dy, dx) + thOff) / HALF_PI;
  float tA;
  float f;
  if (fRaw >= 0.0 && fRaw <= 1.0) {
    tA = CR - sqrt(dx * dx + dy * dy);
    f = fRaw;
  } else {
    float e0x = cx + CR * cos(-thOff);
    float e0y = cy + CR * sin(-thOff);
    float e1x = cx + CR * cos(HALF_PI - thOff);
    float e1y = cy + CR * sin(HALF_PI - thOff);
    float d0 = distance(float2(x, y), float2(e0x, e0y));
    float d1 = distance(float2(x, y), float2(e1x, e1y));
    bool nearE0 = d0 <= d1;
    float d = nearE0 ? d0 : d1;
    float dep = nearE0 ? edgeDepthAt(e0x, e0y, x, y) : edgeDepthAt(e1x, e1y, x, y);
    tA = dep >= 0.0 ? d : -d;
    f = nearE0 ? 0.0 : 1.0;
  }
  if (tA > -(INSET + 1.5) && tA < BAND_CUT) {
    addBranch(a, evalBranch(s0 + f * ARC, tA, t), 1.0);
  }
}

half4 main(float2 xy) {
  // 取景框坐标系：框左上角为原点，y 向下
  float x = xy.x - PAD;
  float y = xy.y - PAD;
  float t = time;

  Acc acc = Acc(0.0, 0.0, 0.0, 0.0, 0.0, float3(0.0));

  // ---- 四条直边支路 ----
  float tT = y - INSET;
  float tB = (FH - y) - INSET;
  float tL = x - INSET;
  float tR = (FW - x) - INSET;

  if (tT < BAND_CUT && tT > -OUT_REACH) {
    float xc = clamp(x, RIM, FW - RIM);
    float over = max(RIM - x, x - (FW - RIM));
    float w = over > 0.0 ? 1.0 - ss01(over / LONG_FADE) : 1.0;
    if (w > 0.0) {
      addBranch(acc, evalBranch(xc - RIM, tT, t), w);
    }
  }
  if (tB < BAND_CUT && tB > -OUT_REACH) {
    float xc = clamp(x, RIM, FW - RIM);
    float over = max(RIM - x, x - (FW - RIM));
    float w = over > 0.0 ? 1.0 - ss01(over / LONG_FADE) : 1.0;
    if (w > 0.0) {
      addBranch(acc, evalBranch(S_BOTTOM0 + (FW - RIM - xc), tB, t), w);
    }
  }
  if (tL < BAND_CUT && tL > -OUT_REACH) {
    float yc = clamp(y, RIM, FH - RIM);
    float over = max(RIM - y, y - (FH - RIM));
    float w = over > 0.0 ? 1.0 - ss01(over / LONG_FADE) : 1.0;
    if (w > 0.0) {
      addBranch(acc, evalBranch(S_LEFT0 + (FH - RIM - yc), tL, t), w);
    }
  }
  if (tR < BAND_CUT && tR > -OUT_REACH) {
    float yc = clamp(y, RIM, FH - RIM);
    float over = max(RIM - y, y - (FH - RIM));
    float w = over > 0.0 ? 1.0 - ss01(over / LONG_FADE) : 1.0;
    if (w > 0.0) {
      addBranch(acc, evalBranch(S_RIGHT0 + (yc - RIM), tR, t), w);
    }
  }

  // ---- 四段圆角弧支路（多源能量合成）----
  arcBranch(acc, x, y, RIM, RIM, PI, S_ARC_TL, t);
  arcBranch(acc, x, y, FW - RIM, RIM, HALF_PI, S_ARC_TR, t);
  arcBranch(acc, x, y, FW - RIM, FH - RIM, 0.0, S_ARC_BR, t);
  arcBranch(acc, x, y, RIM, FH - RIM, -HALF_PI, S_ARC_BL, t);

  if (acc.cov <= 0.0) {
    return half4(0.0);
  }
  // p3 范数（LUT 截断在 1）+ 1.1×主支封顶（原引擎 S3_MAX_GAIN）
  float aGeom = min(pow(acc.p3, 0.3333333), 1.0);
  aGeom = min(aGeom, 1.1 * acc.dom);
  float env = acc.env / acc.cov;
  float alpha = pow(clamp(aGeom, 0.0, 1.0), ALPHA_GAMMA) * RING_ALPHA * env;
  if (alpha < 0.004) {
    return half4(0.0);
  }
  float3 col = acc.col / acc.cov;
  float wm = clamp(CORE_WHITEN * pow(acc.coreP3, 0.3333333), 0.0, 1.0);
  col = col + (float3(1.0) - col) * wm;
  return half4(half3(col * alpha), half(alpha));
}
`;

  return { sksl, pad };
};
