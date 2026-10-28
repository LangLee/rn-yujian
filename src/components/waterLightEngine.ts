/**
 * 水光光场引擎（四周水光识别动效移植，JS 纯函数 + SkSL 生成器）。
 *
 * 移植自本地特效 demo（AI--main / src/components/FishCatchWaterOverlay.ts，
 * 直接源：github.com/pan277942135/demo--Image-light-effect）的 WebGL 着色器
 * 与 2D 流光点缀层，把「渔见识别 · 四周水光」带到 React Native：
 *
 *  - 四周水光环：贴屏幕内缘的圆角矩形 SDF 光环（margin = 短边 1.5%，
 *    圆角 = 短边 12%），粗细被两支角向正弦波有机呼吸调制；
 *    宽晕 + 中层辉光 + 锐利波峰丝三层 bloom；环上青 / 金 / 绿三色
 *    沿角度缠绕流转（效果02 冻结配色：深湖青 #4D9B91 · 琥珀金 #D89913 ·
 *    雾蓝 #719FBC —— demo 字段名 gold/cyan 与实际色相互换，按冻结值原样保留）；
 *  - 底部焦散水波：多倍频有机水面焦散（三层旋转倍频域叠加）
 *    + 晨光光斑（网格 hash 渐动 bokeh），自底向上线性渐隐；
 *  - 入场点亮：spread 进度 0→1（1200ms）自下而上逐层解锁水光
 *    （revealedMask 垂直 smoothstep），完成后常流转不停止；
 *  - 流光点缀（demo 的 2D accent 画布并入同一着色器）：16 颗沿环弧长
 *    缓慢漂移的呼吸光珠（入场期只出现在已点亮分支）+ 底边中点水纹装饰
 *    （白芯光点 + 两侧 ~ 型水纹翅与翅尖光珠）。
 *
 * RN 环境的有意取舍：
 *  - demo 用 CSS mix-blend-mode: overlay 与照片叠混；RN Skia 画布无法与
 *    底层原生视图混色，改用标准 alpha 复合（同 demo WaterResonance 的
 *    「SVG Alpha 复合」决策），照片架构与视觉主导地位不动；
 *  - 逐像素计算放进 Skia RuntimeEffect（SkSL）由 GPU 执行，几何 / 配色 /
 *    周长分段常量全部烘焙进着色器源码，逐帧只更新 time / spread 两个
 *    uniform；光珠与底饰用距离场折进主着色器，避免逐帧更新几十个绘制属性；
 *  - demo 周长参数化在左下角存在断点（第 8 段圆弧反向遍历），这里修正为
 *    沿环连续，光珠漂移全程无缝。
 */

/** 四周水光冻结配置（字段与 demo FishCatchCausticsConfig 对应） */
export interface WaterLightConfig {
  /** 入场自下而上点亮时长（ms） */
  spreadDurationMs: number;
  /** 光场总强度（0.85 - 1.80） */
  intensity: number;
  /** 流速倍率（demo speed，两版冻结均为 1.0） */
  speed: number;
  /** 光环距画布内缘的距离（短边比例） */
  marginRatio: number;
  /** bloom 宽度（pt） */
  glowSize: number;
  /** 环上主金色（效果02 实为深湖青，demo 冻结字段名原样保留） */
  goldColor: string;
  /** 环上主青色（效果02 实为琥珀金） */
  cyanColor: string;
  /** 环上缠绕绿色 */
  greenColor: string;
  /** 底部焦散自下而上渐隐强度 */
  bottomMaskStrength: number;
  /** 青 / 金 / 绿缠绕比例 */
  blendRatio: number;
}

/** 【渔见实拍照（默认推荐）】四周水光冻结版效果02（深湖青与琥珀金调） */
export const WATER_LIGHT_EFFECT_02: WaterLightConfig = {
  spreadDurationMs: 1200,
  intensity: 1.8,
  speed: 1.0,
  marginRatio: 0.015,
  glowSize: 45,
  goldColor: '#4d9b91',
  cyanColor: '#d89913',
  greenColor: '#719fbc',
  bottomMaskStrength: 1.0,
  blendRatio: 0.8,
};

/** 【渔见实拍照】四周水光冻结版效果01（湖天碧蓝与晨曦日光金调，经典版） */
export const WATER_LIGHT_EFFECT_01: WaterLightConfig = {
  spreadDurationMs: 1200,
  intensity: 1.5,
  speed: 1.0,
  marginRatio: 0.015,
  glowSize: 48,
  goldColor: '#FEF08A',
  cyanColor: '#38BDF8',
  greenColor: '#2DD4BF',
  bottomMaskStrength: 1.0,
  blendRatio: 0.75,
};

export const DEFAULT_WATER_LIGHT_CONFIG: WaterLightConfig = WATER_LIGHT_EFFECT_02;

/** #RRGGBB → [r, g, b]（0..1，烘进 SkSL 常量用） */
export const hexToRgbUnit = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    throw new Error(`waterLight: 无效颜色 ${hex}`);
  }
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** 光环圆角占短边比例（demo 冻结 0.12） */
const CORNER_RATIO = 0.12;

/** 光珠数量（demo SPARKLE_COUNT = 16） */
const SPARKLE_COUNT = 16;

export interface WaterLightGeometry {
  /** 光环中线距画布内缘（pt） */
  margin: number;
  /** 圆角半径（pt，已钳制不越出直边） */
  cornerR: number;
  /** 水平直边长（pt） */
  straightW: number;
  /** 垂直直边长（pt） */
  straightH: number;
  /** 单段四分之一圆弧长（pt） */
  cornerArc: number;
  /** 整环周长（pt） */
  totalPerimeter: number;
}

/**
 * 光环周长几何：与 demo generatePerimeterPath 同一套推导
 * （s=0 起自底边中点顺时针：底 → 右 → 顶 → 左 → 回底中点）。
 */
export const waterLightGeometry = (
  width: number,
  height: number,
  marginRatio: number,
  cornerRatio: number = CORNER_RATIO,
): WaterLightGeometry => {
  const margin = Math.min(width, height) * marginRatio;
  const left = margin;
  const right = width - margin;
  const top = margin;
  const bottom = height - margin;
  const r = Math.min(cornerRatio * Math.min(width, height), (right - left) / 2, (bottom - top) / 2);
  const straightW = right - left - 2 * r;
  const straightH = bottom - top - 2 * r;
  const cornerArc = (Math.PI / 2) * r;
  return {
    margin,
    cornerR: r,
    straightW,
    straightH,
    cornerArc,
    totalPerimeter: 2 * straightW + 2 * straightH + 4 * cornerArc,
  };
};

export interface WaterLightShaderConfig {
  /** 画布宽（pt；识别页传窗口宽） */
  width: number;
  /** 画布高（pt） */
  height: number;
  /** 冻结配置（默认效果02） */
  config: WaterLightConfig;
}

/** 浮点常量烘焙格式：整数也带小数点（SkSL 严格类型） */
const fmt = (n: number): string => {
  const s = String(Math.round(n * 1e6) / 1e6);
  return s.includes('.') ? s : `${s}.0`;
};

/**
 * 生成完整的 SkSL RuntimeEffect 源码：几何 / 配色 / 周长分段常量全部烘焙
 * 为 const，仅 `time`（流转秒数）与 `spread`（入场点亮进度 0→1）随帧更新。
 */
export const buildWaterLightShader = ({ width, height, config }: WaterLightShaderConfig): { sksl: string } => {
  const geo = waterLightGeometry(width, height, config.marginRatio);
  const s1 = geo.straightW / 2;
  const s2 = s1 + geo.cornerArc;
  const s3 = s2 + geo.straightH;
  const s4 = s3 + geo.cornerArc;
  const s5 = s4 + geo.straightW;
  const s6 = s5 + geo.cornerArc;
  const s7 = s6 + geo.straightH;
  const s8 = s7 + geo.cornerArc;
  const gold = hexToRgbUnit(config.goldColor);
  const cyan = hexToRgbUnit(config.cyanColor);
  const green = hexToRgbUnit(config.greenColor);

  const sksl = `
uniform float time;
uniform float spread;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float HALF_PI = 1.57079633;
const float W = ${fmt(width)};
const float H = ${fmt(height)};
const float MARGIN = ${fmt(geo.margin)};
const float CR = ${fmt(geo.cornerR)};
const float GLOW = ${fmt(Math.max(8, config.glowSize))};
const float INTENSITY = ${fmt(config.intensity)};
const float BOTTOM_MASK = ${fmt(config.bottomMaskStrength)};
const float BLEND_RATIO = ${fmt(config.blendRatio)};
const float3 GOLD = float3(${fmt(gold[0])}, ${fmt(gold[1])}, ${fmt(gold[2])});
const float3 CYAN = float3(${fmt(cyan[0])}, ${fmt(cyan[1])}, ${fmt(cyan[2])});
const float3 GREEN = float3(${fmt(green[0])}, ${fmt(green[1])}, ${fmt(green[2])});

// 周长参数化分段（s=0 底边中点顺时针；坐标为画布系 y 向下，采样时翻回 y 向上）
const float PM_LF = ${fmt(geo.margin)};
const float PM_RT = ${fmt(width - geo.margin)};
const float PM_TP = ${fmt(geo.margin)};
const float PM_BT = ${fmt(height - geo.margin)};
const float PM_SW = ${fmt(geo.straightW)};
const float PM_SH = ${fmt(geo.straightH)};
const float PM_ARC = ${fmt(geo.cornerArc)};
const float PM_S1 = ${fmt(s1)};
const float PM_S2 = ${fmt(s2)};
const float PM_S3 = ${fmt(s3)};
const float PM_S4 = ${fmt(s4)};
const float PM_S5 = ${fmt(s5)};
const float PM_S6 = ${fmt(s6)};
const float PM_S7 = ${fmt(s7)};
const float PM_S8 = ${fmt(s8)};
const float PM_TOT = ${fmt(geo.totalPerimeter)};
const float SPARKLE_N = ${fmt(SPARKLE_COUNT)};

float2 rot2(float2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// 圆角矩形 SDF（demo sdRoundedBox：其象限 swizzle 在四角同半径
// vec4(cornerR) 输入下退化为标准圆角盒，直接用标量半径形式）
float sdRoundedBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float hash21(float2 p) {
  float2 q = fract(p * float2(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

// 多倍频有机水面焦散（晨间水波）
float causticOctave(float2 uv, float t, float fi) {
  float2 p = rot2(uv, 0.45 + fi * 2.39996);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float2 w = float2(
      sin(p.y * (1.18 + fi * 0.17 + fk * 0.12) + p.x * (0.24 + fi * 0.08) + t * (0.42 + fi * 0.06) + fi * 1.57 + fk),
      cos(p.x * (0.92 + fi * 0.15 + fk * 0.10) - p.y * (0.31 + fi * 0.08) - t * (0.38 + fi * 0.05) + fi * 1.18)
    );
    p += w * (0.45 / (1.0 + fi * 0.18 + fk * 0.12));
  }
  float2 d1 = float2(1.02 + fi * 0.19, 0.35 + fi * 0.11);
  float2 d2 = float2(-0.48 - fi * 0.09, 1.12 + fi * 0.07);
  float ridge = sin(dot(p, d1) + t * 0.14) * sin(dot(p, d2) - t * 0.11);
  return 0.17 / (abs(ridge) * 5.4 + 0.22);
}

float causticField(float2 uv, float t) {
  float2 p = uv + float2(sin(uv.y * 0.42 + t * 0.24) * 0.38, cos(uv.x * 0.36 - t * 0.18) * 0.38);
  float a = causticOctave(p, t, 0.0);
  float2 p2 = rot2(p * 1.618 + float2(1.72, -1.18), 1.15);
  float b = causticOctave(p2, t * 0.82, 1.0);
  float2 p3 = rot2(p * 2.54 + float2(2.31, -0.65), 1.52);
  float c = causticOctave(p3, t * 0.65, 2.0);
  float acc = max(a * 1.15, b * 0.82) + c * 0.38;
  return pow(clamp(acc, 0.0, 2.0), 1.35);
}

// 晨光光斑（渐动 bokeh）
float lightSpotsField(float2 uv, float t) {
  float2 p = uv * 3.6;
  float2 ip = floor(p);
  float2 fp = fract(p) - 0.5;
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float2 neighbor = float2(float(x), float(y));
      float h = hash21(ip + neighbor);
      float2 offset = float2(
        sin(t * 1.25 + h * TAU) * 0.32,
        cos(t * 1.55 + h * TAU) * 0.32
      );
      float2 diff = neighbor + offset - fp;
      minDist = min(minDist, length(diff));
    }
  }
  float spot = smoothstep(0.65, 0.08, minDist);
  return pow(spot, 1.8);
}

// 沿光环周长的弧长参数化（与 demo generatePerimeterPath 一致，并修正其
// 左下角第 8 段圆弧的反向遍历断点：整环连续，光珠漂移无缝）
float2 perimeterPoint(float s) {
  if (s < PM_S1) {
    return float2(PM_LF + CR + PM_SW * 0.5 + s, PM_BT);
  }
  if (s < PM_S2) {
    float a = (s - PM_S1) / PM_ARC * HALF_PI;
    return float2(PM_RT - CR + sin(a) * CR, PM_BT - CR + cos(a) * CR);
  }
  if (s < PM_S3) {
    return float2(PM_RT, PM_BT - CR - (s - PM_S2));
  }
  if (s < PM_S4) {
    float a = (s - PM_S3) / PM_ARC * HALF_PI;
    return float2(PM_RT - CR + cos(a) * CR, PM_TP + CR - sin(a) * CR);
  }
  if (s < PM_S5) {
    return float2(PM_RT - CR - (s - PM_S4), PM_TP);
  }
  if (s < PM_S6) {
    float a = (s - PM_S5) / PM_ARC * HALF_PI;
    return float2(PM_LF + CR - sin(a) * CR, PM_TP + CR - cos(a) * CR);
  }
  if (s < PM_S7) {
    return float2(PM_LF, PM_TP + CR + (s - PM_S6));
  }
  if (s < PM_S8) {
    float a = (s - PM_S7) / PM_ARC * HALF_PI;
    return float2(PM_LF + CR - cos(a) * CR, PM_BT - CR + sin(a) * CR);
  }
  return float2(PM_LF + CR + (s - PM_S8), PM_BT);
}

float sdSeg(float2 p, float2 a, float2 b) {
  float2 pa = p - a;
  float2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

half4 main(float2 xy) {
  // 画布系（左上原点 y 向下）→ demo 的 gl_FragCoord 系（左下原点 y 向上）
  float2 frag = float2(xy.x, H - xy.y);
  float2 res = float2(W, H);
  float2 uv = (frag * 2.0 - res) / max(res.y, 1.0);
  float normY = frag.y / res.y;
  float t = time * 0.42;
  float ts = time;

  // 入场揭示：随 spread 自下而上逐层解锁，完成后恒为 1
  float revealedMask = smoothstep(normY - 0.14, normY + 0.02, spread * 1.08 - 0.04);
  revealedMask = clamp(revealedMask, 0.0, 1.0);

  // ---- 1. 四周水光环 ----
  float2 halfRes = res * 0.5;
  float2 centeredPos = frag - halfRes;
  float2 boxHalf = halfRes - float2(MARGIN);
  float perimAngle = atan(centeredPos.y, centeredPos.x);
  float perimWave = sin(perimAngle * 5.0 + t * 2.2) * 4.5 + cos(perimAngle * 9.0 - t * 1.5) * 2.6;
  float sdRaw = sdRoundedBox(centeredPos, boxHalf, CR);
  float dBox = abs(sdRaw + perimWave);

  float wideHalo = exp(-dBox * (0.07 / (GLOW * 0.12)));
  float mediumBloom = exp(-dBox * (0.16 / (GLOW * 0.10)));
  float sharpCore = smoothstep(2.8, 0.3, dBox);
  float perimeterAura = (wideHalo * 0.35 + mediumBloom * 0.65 + sharpCore * 0.95) * revealedMask;

  // 环上青 / 金 / 绿沿角度缠绕
  float filamentAngleT = (perimAngle + PI) / TAU;
  float filamentGoldBias = smoothstep(0.18, 0.82, sin(filamentAngleT * PI + 0.7));
  float3 perimeterColor = mix(CYAN, GOLD, filamentGoldBias);
  perimeterColor = mix(perimeterColor, GREEN, sin(filamentAngleT * TAU + t * 0.5) * 0.2 + 0.2);

  // ---- 2. 底部焦散水波与晨光光斑 ----
  float bottomGrad = pow(clamp(1.0 - normY * 0.85, 0.0, 1.0), 1.5);
  float causticsMask = mix(0.04, 1.0, bottomGrad * BOTTOM_MASK) * revealedMask;

  float cVal = causticField(uv * 1.85, t);
  float veins = smoothstep(0.16, 1.10, cVal);
  float haze = smoothstep(0.03, 0.78, cVal) * 0.35;
  float causticGlow = veins * 0.92 + haze;

  float spots = lightSpotsField(uv * 1.25, t * 0.85);
  float waterLight = causticGlow * 0.88 + spots * 0.95;

  float colorFlow = sin(uv.x * 2.2 + uv.y * 1.5 + t * 0.75) * 0.5 + 0.5;
  float3 waterSpectrum = mix(CYAN, GREEN, clamp(colorFlow * 0.85 + 0.1, 0.0, 1.0));
  float sunCatch = smoothstep(0.28, 0.88, waterLight * 0.55 + colorFlow * 0.45);
  float3 bottomCausticColor = mix(waterSpectrum, GOLD, clamp(sunCatch * BLEND_RATIO, 0.0, 1.0));

  // ---- 3. 组合 ----
  float bottomContrib = waterLight * causticsMask * 0.68;
  float perimContrib = perimeterAura * 0.86;

  float totalLight = (bottomContrib + perimContrib) * INTENSITY;
  float finalAlpha = clamp(totalLight, 0.0, 0.96);
  float totalWeight = max(0.001, bottomContrib + perimContrib);
  float3 finalRgb = (bottomCausticColor * bottomContrib + perimeterColor * perimContrib) / totalWeight;

  float coreSpark = smoothstep(0.85, 1.75, totalLight);
  finalRgb = mix(finalRgb, float3(0.99, 0.99, 0.96), coreSpark * 0.48);
  finalRgb *= (1.0 + coreSpark * 0.3);

  // ---- 4. 流光点缀（demo 2D accent 层并入）----
  float3 accC = float3(0.0);
  float accA = 0.0;

  // 4a. 沿环漂移的呼吸光珠（入场期只落在已点亮的左右两支分支内）
  if (spread > 0.02 && abs(sdRaw) < 80.0) {
    float rightEnd = 0.5 * spread;
    float leftStart = 1.0 - 0.5 * spread;
    for (int i = 0; i < ${SPARKLE_COUNT}; i++) {
      float fi = float(i);
      float m3 = fi - 3.0 * floor(fi / 3.0);
      float m4 = fi - 4.0 * floor(fi / 4.0);
      float spd = 0.012 + m3 * 0.007;
      float size = 2.2 + m4 * 0.7;
      float phase = fract(sin(fi * 12.9898) * 43758.5453) * TAU;
      float pPos = fract(fi / SPARKLE_N + ts * spd);
      if (pPos <= rightEnd || pPos >= leftStart) {
        float2 cp = perimeterPoint(pPos * PM_TOT);
        float2 sp = float2(cp.x, H - cp.y);
        float pulse = 0.65 + 0.35 * sin(ts * 3.4 + phase);
        float d = distance(frag, sp);
        float goldMix = pPos > 0.45 ? 1.0 : 0.0;
        float3 glowCol = mix(CYAN, GOLD, goldMix);
        float3 coreCol = mix(float3(0.878, 0.949, 0.996), float3(0.996, 0.941, 0.541), goldMix);
        float rHalo = size * 3.2 * pulse;
        float halo = smoothstep(rHalo + 1.0, rHalo - 1.0, d);
        float rCore = size * 1.15 * pulse;
        float bead = smoothstep(rCore + 0.75, rCore - 0.75, d);
        float aHalo = min(1.0, 0.42 * pulse * INTENSITY);
        float aCore = min(1.0, 0.92 * pulse * INTENSITY);
        accC += glowCol * (halo * aHalo) + coreCol * (bead * aCore);
        accA += halo * aHalo + bead * aCore;
      }
    }
  }

  // 4b. 底边中点水纹装饰：白芯光点 + ~ 型水纹翅与翅尖光珠
  if (spread > 0.15) {
    float2 cbm = perimeterPoint(0.0);
    float2 bm = float2(cbm.x, H - cbm.y);
    float dbm = distance(frag, bm);
    if (dbm < 90.0) {
      float bPulse = 0.75 + 0.25 * sin(ts * 2.4);
      float rCore = 3.0 * bPulse;
      float coreDot = smoothstep(rCore + 0.8, rCore - 0.8, dbm);
      float goldHalo = exp(-(dbm * dbm) / 36.0);
      accC += float3(1.0) * coreDot + GOLD * (goldHalo * 0.85 * bPulse);
      accA += coreDot + goldHalo * 0.4 * bPulse;

      float2 wl0 = bm + float2(-6.0, 0.0);
      float2 wl1 = bm + float2(-38.0, 1.1);
      float2 wr0 = bm + float2(6.0, 0.0);
      float2 wr1 = bm + float2(38.0, -1.1);
      float dl = sdSeg(frag, wl0, wl1);
      float dr = sdSeg(frag, wr0, wr1);
      float wing = clamp(smoothstep(1.4, 0.4, dl) + smoothstep(1.4, 0.4, dr), 0.0, 1.0);
      float aWing = min(1.0, 0.65 * INTENSITY);
      accC += GOLD * (wing * aWing);
      accA += wing * aWing;

      float pearlL = smoothstep(2.0, 0.8, distance(frag, wl1));
      float pearlR = smoothstep(2.0, 0.8, distance(frag, wr1));
      float pearl = clamp(pearlL + pearlR, 0.0, 1.0);
      float pearlGlow = exp(-(distance(frag, wl1) * distance(frag, wl1)) / 8.0)
        + exp(-(distance(frag, wr1) * distance(frag, wr1)) / 8.0);
      accC += float3(1.0) * pearl + GOLD * (pearlGlow * 0.7);
      accA += pearl + pearlGlow * 0.35;
    }
  }

  // ---- 5. 点缀层 over 主光场，输出预乘 alpha ----
  float aA = clamp(accA, 0.0, 1.0);
  float outA = clamp(finalAlpha + aA, 0.0, 1.0);
  if (outA < 0.004) {
    return half4(0.0);
  }
  float3 outPremul = finalRgb * finalAlpha * (1.0 - aA) + accC;
  float3 outC = clamp(outPremul / outA, 0.0, 1.0);
  return half4(half3(outC * outA), half(outA));
}
`;

  return { sksl };
};
