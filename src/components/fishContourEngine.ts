/**
 * 鱼体轮廓光引擎（demo「金色鱼体主体显影」经典金 V1.1 + VirtualFishRipple
 * 的 RN 移植，JS 纯函数）。
 *
 * 数据源（与 demo 的关键差异）：demo 在浏览器端跑 YOLOX 检测 + SlimSAM
 * 分割拿到真实鱼体像素轮廓；app 的识别管线本就是端上原生（YOLOX 检测 →
 * TFLite 分类），recognize() 已返回真实归一化鱼体 bbox，但没有分割模型。
 * 因此轮廓采用 demo 的 BBOX 降级哲学（VirtualFishRipple「虚拟鱼体」）：
 * 用检测 bbox 的真实位置与尺寸生成朝向自适应的有机鱼形折线，再套用
 * Fish Contour Glow V1.3 的四层光学描边动效。真实 SAM 像素轮廓需端上
 * 分割模型落地后另行接入（届时仅替换 buildFishContourPoints 的数据源）。
 *
 * 动效时间线（demo V1.1 经典金冻结值，总时长 2600ms）：
 *   0–1000ms    核心描边平滑生长（smoothstep，路径 trim 实现）；
 *   1000–1150ms 描边静止保持（柔光与反光严格关闭——阶段互斥）；
 *   1150–1400ms 双层柔光 / Halo / 体内反光平滑淡入；
 *   1600–1850ms 识别确认高光（1680ms 峰值，Core ×1.15 / Soft ×1.25）；
 *   1400ms 起   柔光族稳定巡航（2200ms/圈，循环幅度 ≤ ±3%）。
 */

/** 归一化鱼体框（与原生 detectorRun.detections[].box 同构，0..1） */
export interface NormalizedFishBoxInput {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 屏幕矩形（pt） */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FishContourGeometry {
  /** 有序闭合折线（屏幕坐标 pt；首尾不重复，绘制时 close） */
  points: Array<{ x: number; y: number }>;
  /** 折线总弧长（pt，dash / 巡航参数换算用） */
  totalLength: number;
  /** 鱼体包围盒（屏幕坐标） */
  rect: ScreenRect;
  /** 竖向鱼体（bbox 高明显大于宽） */
  vertical: boolean;
}

/**
 * V1.1「金色鱼体主体显影」经典金光学层冻结参数
 * （demo 导出配置 effectBranch=CLASSIC_GOLD_CONTOUR 核对清单逐字）：
 *   核心描边 1.2 CSS px #F5DFB0 稳定 Alpha 0.75；
 *   外围双层柔光 5 CSS px #E8C882 稳定 Alpha 0.24（双层 0.15 + 0.09）；
 *   外发散光晕 Halo 10 CSS px #C9A66B 稳定 Alpha 0.08；
 *   鱼体内部局部反光 #F0DCA5 峰值 Alpha 0.12（有效面积 5-10%）；
 *   识别确认高光 1600-1850ms（1680ms 峰值，Core ×1.15 / Soft ×1.25）；
 *   1400ms 后柔光稳定巡航，循环幅度 ≤ ±3%；
 *   阶段严格互斥：0-1150ms 柔光与反光彻底关闭；
 *   时间线 2600ms，8 大关键帧 0/500/1000/1150/1400/1680/2200/2600ms。
 * （RN 下 pt ≈ CSS px，宽度值直接使用）
 */
export const CONTOUR_PARAMS = {
  // L1 核心描边
  coreColor: '#F5DFB0',
  coreLineWidth: 1.2,
  coreBaseAlpha: 0.75,
  // L2 外围双层柔光（宽 5；双层 0.15 主层 + 0.09 外层）
  softColor: '#E8C882',
  softWidth: 5,
  softAlpha: 0.24,
  softTierAWidth: 5,
  softTierAAlpha: 0.15,
  softTierBWidth: 8,
  softTierBAlpha: 0.09,
  softTierABlur: 2.5,
  softTierBBlur: 4,
  // L3 外发散光晕
  haloColor: '#C9A66B',
  haloWidth: 10,
  haloAlpha: 0.08,
  haloBlur: 6,
  // L4 鱼体内部局部反光（确认峰 ×1.2 → 峰值恰为 0.12）
  glintColor: '#F0DCA5',
  glintBaseAlpha: 0.1,
  glintPeakAlpha: 0.12,
  glintConfirmBoost: 0.2,
  // 时间线（V1.1 冻结关键帧）
  timelineDurationMs: 2600,
  strokeGrowthMs: 1000,
  glowFadeStartMs: 1150,
  glowFadeEndMs: 1400,
  confirmStartMs: 1600,
  confirmPeakMs: 1680,
  confirmMidMs: 1760,
  confirmEndMs: 1850,
  confirmCoreBoost: 0.15,
  confirmSoftBoost: 0.25,
  cruiseCycleMs: 2200,
  cruiseAmplitude: 0.03,
} as const;

/**
 * smoothstep（demo 3p²−2p³）。
 * 'worklet' 指令：contourTimeline 在 UI 线程逐帧调用它——react-native-worklets
 * 不会自动 worklet 化被引用的同文件函数，缺少指令会在 UI Runtime 抛
 * "Tried to synchronously call a Remote Function"。
 */
const smoothstep01 = (p: number): number => {
  'worklet';
  const c = Math.min(1, Math.max(0, p));
  return 3 * c * c - 2 * c * c * c;
};

/**
 * 归一化 bbox → 屏幕矩形：与 RN Image resizeMode 同一套 cover / contain
 * 数学（scale + 居中偏移；cover 时鱼体轮廓可越出屏幕，画布自然裁掉）。
 */
export const mapBoxToScreenRect = (
  box: NormalizedFishBoxInput,
  photoWidth: number,
  photoHeight: number,
  viewWidth: number,
  viewHeight: number,
  fit: 'cover' | 'contain',
): ScreenRect | null => {
  if (photoWidth <= 0 || photoHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return null;
  }
  const scale =
    fit === 'cover'
      ? Math.max(viewWidth / photoWidth, viewHeight / photoHeight)
      : Math.min(viewWidth / photoWidth, viewHeight / photoHeight);
  const dx = (viewWidth - photoWidth * scale) / 2;
  const dy = (viewHeight - photoHeight * scale) / 2;
  const x1 = Math.min(Math.max(box.x1, 0), 1) * photoWidth * scale + dx;
  const y1 = Math.min(Math.max(box.y1, 0), 1) * photoHeight * scale + dy;
  const x2 = Math.min(Math.max(box.x2, 0), 1) * photoWidth * scale + dx;
  const y2 = Math.min(Math.max(box.y2, 0), 1) * photoHeight * scale + dy;
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w < 8 || h < 8) {
    return null;
  }
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w, h };
};

/** 真实轮廓（SAM 分割）映射到屏幕的结果 */
export interface ContourScreenMapping {
  /** 屏幕坐标有序闭合折线（首尾不重复） */
  points: Array<{ x: number; y: number }>;
  /** 轮廓包围盒（屏幕坐标） */
  rect: ScreenRect;
}

/**
 * SAM 归一化轮廓点 → 屏幕坐标：与 mapBoxToScreenRect 同一套 cover / contain
 * 数学逐点映射，并求包围盒；点数不足或包围盒过小返回 null（退回 bbox 合成轮廓）。
 */
export const mapContourPointsToScreen = (
  contour: Array<{ x: number; y: number }>,
  photoWidth: number,
  photoHeight: number,
  viewWidth: number,
  viewHeight: number,
  fit: 'cover' | 'contain',
): ContourScreenMapping | null => {
  if (contour.length < 8 || photoWidth <= 0 || photoHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return null;
  }
  const scale =
    fit === 'cover'
      ? Math.max(viewWidth / photoWidth, viewHeight / photoHeight)
      : Math.min(viewWidth / photoWidth, viewHeight / photoHeight);
  const dx = (viewWidth - photoWidth * scale) / 2;
  const dy = (viewHeight - photoHeight * scale) / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const points = contour.map((p) => {
    const x = Math.min(Math.max(p.x, 0), 1) * photoWidth * scale + dx;
    const y = Math.min(Math.max(p.y, 0), 1) * photoHeight * scale + dy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return { x, y };
  });
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w >= 8) || !(h >= 8)) {
    return null;
  }
  return { points, rect: { x: minX, y: minY, w, h } };
};

/** 三次贝塞尔取值 */
const cubicAt = (
  p0: number, p1: number, p2: number, p3: number, t: number,
): number => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** 二次贝塞尔取值 */
const quadAt = (p0: number, p1: number, p2: number, t: number): number => {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
};

/** 单段曲线按采样数展开为折线点（不重复端点，append 到 out） */
const appendCurve = (
  out: Array<{ x: number; y: number }>,
  kind: 'cubic' | 'quad',
  from: { x: number; y: number },
  controls: Array<{ x: number; y: number }>,
  to: { x: number; y: number },
  samples: number,
): void => {
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (kind === 'cubic') {
      const [c1, c2] = controls;
      out.push({
        x: cubicAt(from.x, c1.x, c2.x, to.x, t),
        y: cubicAt(from.y, c1.y, c2.y, to.y, t),
      });
    } else {
      const [c1] = controls;
      out.push({ x: quadAt(from.x, c1.x, to.x, t), y: quadAt(from.y, c1.y, to.y, t) });
    }
  }
};

/**
 * 有机鱼形轮廓（demo VirtualFishRipple getAbstractFishPath 的求值版）：
 * 头部圆润、侧线微鼓、尾部内收的抽象鱼形（非矢量剪贴画、非机械椭圆），
 * 竖向 / 横向鱼体两套几何。鱼形约占满包围盒（横向跨度 1.74×w、
 * 纵向 1.68×h，w/h 为生成参数），折线化以便精确计算弧长与 trim 生长。
 */
export const buildFishContourPoints = (rect: ScreenRect): FishContourGeometry => {
  const vertical = rect.h > rect.w * 1.15;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // 生成参数换算：轮廓跨度 ≈ 1.74w × 1.68h，反解出贴合包围盒的 w / h
  const w = rect.w / 1.74;
  const h = rect.h / 1.68;
  const pts: Array<{ x: number; y: number }> = [];

  if (vertical) {
    const headY = -h * 0.86;
    const tailY = h * 0.88;
    const flankW = w * 0.84;
    const finW = w * 0.48;
    const start = { x: cx, y: cy + headY };
    pts.push(start);
    // 左侧（头 → 尾）：两段三次 + 尾凹二次
    appendCurve(pts, 'cubic', start,
      [
        { x: cx - flankW * 0.68, y: cy + headY * 0.48 },
        { x: cx - flankW, y: cy - h * 0.08 },
      ],
      { x: cx - flankW * 0.82, y: cy + h * 0.28 }, 20);
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx - flankW * 0.58, y: cy + h * 0.56 },
        { x: cx - w * 0.22, y: cy + h * 0.74 },
      ],
      { x: cx - finW, y: cy + tailY }, 20);
    appendCurve(pts, 'quad',
      pts[pts.length - 1],
      [{ x: cx, y: cy + tailY - h * 0.14 }],
      { x: cx + finW, y: cy + tailY }, 12);
    // 右侧（尾 → 头）
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx + w * 0.22, y: cy + h * 0.74 },
        { x: cx + flankW * 0.58, y: cy + h * 0.56 },
      ],
      { x: cx + flankW * 0.82, y: cy + h * 0.28 }, 20);
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx + flankW, y: cy - h * 0.08 },
        { x: cx + flankW * 0.68, y: cy + headY * 0.48 },
      ],
      start, 20);
  } else {
    const headX = -w * 0.86;
    const tailX = w * 0.88;
    const flankH = h * 0.84;
    const finH = h * 0.48;
    const start = { x: cx + headX, y: cy };
    pts.push(start);
    // 上侧（头 → 尾）
    appendCurve(pts, 'cubic', start,
      [
        { x: cx + headX * 0.48, y: cy - flankH * 0.68 },
        { x: cx - w * 0.08, y: cy - flankH },
      ],
      { x: cx + w * 0.28, y: cy - flankH * 0.82 }, 20);
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx + w * 0.56, y: cy - flankH * 0.58 },
        { x: cx + w * 0.74, y: cy - h * 0.22 },
      ],
      { x: cx + tailX, y: cy - finH }, 20);
    appendCurve(pts, 'quad',
      pts[pts.length - 1],
      [{ x: cx + tailX - w * 0.14, y: cy }],
      { x: cx + tailX, y: cy + finH }, 12);
    // 下侧（尾 → 头）
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx + w * 0.74, y: cy + h * 0.22 },
        { x: cx + w * 0.56, y: cy + flankH * 0.58 },
      ],
      { x: cx + w * 0.28, y: cy + flankH * 0.82 }, 20);
    appendCurve(pts, 'cubic',
      pts[pts.length - 1],
      [
        { x: cx - w * 0.08, y: cy + flankH },
        { x: cx + headX * 0.48, y: cy + flankH * 0.68 },
      ],
      start, 20);
  }

  let totalLength = 0;
  for (let i = 1; i < pts.length; i++) {
    totalLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  // 闭合边（最后一个点回到起点）
  const first = pts[0];
  const last = pts[pts.length - 1];
  totalLength += Math.hypot(first.x - last.x, first.y - last.y);

  return { points: pts, totalLength, rect, vertical };
};

/** V1.1 经典金时间线包络（t：动效本地时钟 ms） */
export interface ContourTimeline {
  /** 0–1000ms 核心描边生长进度（路径 trim end）；1000–1150ms 静止保持 */
  growth: number;
  /** 核心描边透明度（稳定 0.75；确认高光 ×1.15） */
  coreAlpha: number;
  /** 双层柔光透明度（1150ms 前严格 0；淡入后 0.24 基线 × 巡航 ±3% × 确认 ×1.25） */
  softAlpha: number;
  /** 外发散光晕透明度（随柔光族包络，0.08 基线） */
  haloAlpha: number;
  /** 鱼体内部局部反光透明度（随柔光族包络，峰值 0.12） */
  glintAlpha: number;
}

/**
 * demo V1.1 经典金冻结时间线的逐帧包络。阶段严格互斥：0-1150ms 柔光与
 * 反光彻底关闭（只有核心描边生长/保持）；1150-1400ms 柔光族平滑淡入；
 * 1600-1850ms 识别确认高光（1680ms 峰值：Core ×1.15 / Soft ×1.25 /
 * 反光 ×1.2）；1400ms 起柔光族稳定巡航（2200ms/圈，幅度 ≤ ±3%）。
 * （'worklet' 指令：供 FishContourGlow 在 UI 线程逐帧调用；
 *  纯函数无副作用，jest 下作为普通函数直接测试。）
 */
export const contourTimeline = (tMs: number): ContourTimeline => {
  'worklet';
  const P = CONTOUR_PARAMS;
  const t = Math.max(0, tMs);

  const growth = t <= 0 ? 0 : t >= P.strokeGrowthMs ? 1 : smoothstep01(t / P.strokeGrowthMs);

  // 识别确认高光：1600→1680 升到 1，1680→1760 落到 0.5，1760→1850 归零
  let confirm = 0;
  if (t >= P.confirmStartMs && t <= P.confirmPeakMs) {
    confirm = smoothstep01((t - P.confirmStartMs) / (P.confirmPeakMs - P.confirmStartMs));
  } else if (t > P.confirmPeakMs && t <= P.confirmMidMs) {
    confirm = 1 - 0.5 * smoothstep01((t - P.confirmPeakMs) / (P.confirmMidMs - P.confirmPeakMs));
  } else if (t > P.confirmMidMs && t <= P.confirmEndMs) {
    confirm = 0.5 * (1 - smoothstep01((t - P.confirmMidMs) / (P.confirmEndMs - P.confirmMidMs)));
  }

  // 柔光族淡入（1150→1400）× 稳定巡航（1400ms 起，幅度 ≤ ±3%）
  const fade =
    t < P.glowFadeStartMs
      ? 0
      : t >= P.glowFadeEndMs
        ? 1
        : smoothstep01((t - P.glowFadeStartMs) / (P.glowFadeEndMs - P.glowFadeStartMs));
  const cruise =
    t < P.glowFadeEndMs
      ? 0
      : Math.sin(((t - P.glowFadeEndMs) / P.cruiseCycleMs) * 2 * Math.PI) * P.cruiseAmplitude;
  const glowFactor = fade * (1 + cruise);
  const softBoost = 1 + P.confirmSoftBoost * confirm;

  return {
    growth,
    coreAlpha: growth <= 0 ? 0 : Math.min(1, P.coreBaseAlpha * (1 + P.confirmCoreBoost * confirm)),
    softAlpha: Math.min(0.95, P.softAlpha * glowFactor * softBoost),
    haloAlpha: P.haloAlpha * glowFactor * softBoost,
    glintAlpha: Math.min(
      P.glintPeakAlpha,
      P.glintBaseAlpha * glowFactor * (1 + P.glintConfirmBoost * confirm),
    ),
  };
};
