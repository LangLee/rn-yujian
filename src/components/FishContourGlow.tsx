import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  Skia,
} from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import {
  buildFishContourPoints,
  CONTOUR_PARAMS,
  contourTimeline,
  mapBoxToScreenRect,
  type NormalizedFishBoxInput,
} from './fishContourEngine';

/**
 * 鱼体轮廓光（demo「金色鱼体主体显影」经典金 V1.1 的 RN 移植）。
 *
 * 「已定位到鱼体」的视觉主角：真实检测 bbox 生成朝向自适应的有机鱼形
 * 折线（数据源差异与冻结参数见 fishContourEngine.ts），四层光学呈现——
 *   L1 核心描边 1.2pt #F5DFB0（0-1000ms smoothstep 生长，稳定 α0.75）；
 *   L2 外围双层柔光 #E8C882（5pt 主层 + 8pt 外层，稳定 α0.24）；
 *   L3 外发散光晕 Halo #C9A66B（10pt 宽漫射，稳定 α0.08）；
 *   L4 鱼体内部局部反光 #F0DCA5（裁切进鱼形内部，峰值 α0.12）。
 * 阶段严格互斥：0-1150ms 柔光/反光彻底关闭；1150-1400ms 淡入；
 * 1600-1850ms 识别确认高光（Core ×1.15 / Soft ×1.25，1680ms 峰值）；
 * 1400ms 起柔光族稳定巡航（2200ms/圈，幅度 ≤ ±3%）。
 *
 * 驱动：useFrameCallback 30fps 限帧推进本地时钟（挂载即揭示时刻），
 * contourTimeline 在 UI 线程求包络并分发到共享值；Path.start/end trim
 * 实现描边生长。paused（RESOLVE）停表冻结段位；Reduce Motion 静态呈现
 * 淡入完成位（无巡航呼吸）。jest / Skia 原生不可用时退场为 null。
 */

/** Reduce Motion 静态帧时刻：柔光淡入完成、无确认高光、巡航中值附近 */
const STATIC_TIME_MS = 1500;

export interface FishContourGlowProps {
  /** 画布宽（pt） */
  width: number;
  /** 画布高（pt） */
  height: number;
  /** 归一化鱼体 bbox（原生 detectorRun 真实检测结果） */
  fishBox: NormalizedFishBoxInput;
  /** 照片像素宽（EXIF 归一后；bbox 映射基准） */
  photoWidth: number;
  /** 照片像素高 */
  photoHeight: number;
  /** 照片适配模式（与 AIAmbientField L1 照片一致，映射才对齐） */
  photoFit: 'cover' | 'contain';
  /** 暂停（RESOLVE 收场停表冻结段位） */
  paused?: boolean;
  /** 动效帧率上限（默认 30） */
  maxFps?: number;
  /** 容器附加样式 */
  style?: StyleProp<ViewStyle>;
}

export const FishContourGlow: React.FC<FishContourGlowProps> = ({
  width,
  height,
  fishBox,
  photoWidth,
  photoHeight,
  photoFit,
  paused = false,
  maxFps = 30,
  style,
}) => {
  const { reduceMotion } = useTheme();

  const built = useMemo(() => {
    // jest 与原生未就绪时 Skia 工厂缺失：静态退场（识别页不依赖本组件可用性）
    if (typeof Skia.PathBuilder?.Make !== 'function') {
      return null;
    }
    const rect = mapBoxToScreenRect(fishBox, photoWidth, photoHeight, width, height, photoFit);
    if (!rect) {
      return null;
    }
    const geo = buildFishContourPoints(rect);
    // RN Skia v2：SkPath 可变 API（moveTo/lineTo/close）已弃用，折线经
    // PathBuilder.addPoly 一次性构建，detach 取不可变 SkPath
    const builder = Skia.PathBuilder.Make();
    builder.addPoly(geo.points, true);
    const path = builder.detach();
    if (!path) {
      return null;
    }
    // 体内反光几何：晨光自上方，落在鱼体上三分之一（有效面积 5-10%）
    const glint = {
      cx: rect.x + rect.w / 2,
      cy: rect.y + rect.h * 0.34,
      r: Math.min(rect.w, rect.h) * 0.42,
    };
    return { path, rect, glint };
  }, [fishBox, photoWidth, photoHeight, width, height, photoFit]);

  // 双层柔光的 alpha 份额（0.15 主层 + 0.09 外层 = 0.24 冻结基线）
  const tierAShare = CONTOUR_PARAMS.softTierAAlpha / CONTOUR_PARAMS.softAlpha;
  const tierBShare = CONTOUR_PARAMS.softTierBAlpha / CONTOUR_PARAMS.softAlpha;

  const clock = useSharedValue(0);
  const lastTick = useSharedValue(-1);
  const minIntervalMs = Math.round(1000 / Math.max(15, maxFps));
  useFrameCallback((frame) => {
    if (paused || reduceMotion) {
      lastTick.value = -1;
      return;
    }
    const ts = frame.timestamp;
    if (lastTick.value < 0) {
      lastTick.value = ts;
      return;
    }
    const elapsed = ts - lastTick.value;
    if (elapsed < minIntervalMs) {
      return;
    }
    lastTick.value = ts;
    clock.value += Math.min(elapsed, 120);
  });

  // UI 线程逐帧包络（contourTimeline 带 'worklet' 指令）
  const tl = useDerivedValue(() => contourTimeline(clock.value));
  const growth = useDerivedValue(() => tl.value.growth);
  const coreAlpha = useDerivedValue(() => tl.value.coreAlpha);
  const haloAlpha = useDerivedValue(() => tl.value.haloAlpha);
  const glintAlpha = useDerivedValue(() => tl.value.glintAlpha);
  // 双层柔光各自份额（共享值不能在 JSX 里做算术，须整体走派生值）
  const softAlphaA = useDerivedValue(() => tl.value.softAlpha * tierAShare);
  const softAlphaB = useDerivedValue(() => tl.value.softAlpha * tierBShare);

  if (!built) {
    return null;
  }

  const { path, glint } = built;
  const P = CONTOUR_PARAMS;

  const staticTl = contourTimeline(STATIC_TIME_MS);
  const resolved = {
    growth: reduceMotion ? staticTl.growth : growth,
    coreAlpha: reduceMotion ? staticTl.coreAlpha : coreAlpha,
    softAlphaA: reduceMotion ? staticTl.softAlpha * tierAShare : softAlphaA,
    softAlphaB: reduceMotion ? staticTl.softAlpha * tierBShare : softAlphaB,
    haloAlpha: reduceMotion ? staticTl.haloAlpha : haloAlpha,
    glintAlpha: reduceMotion ? staticTl.glintAlpha : glintAlpha,
  };

  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    >
      <Canvas style={{ flex: 1 }}>
        {/* L3 · 外发散光晕 Halo（10pt 宽漫射，随柔光族包络） */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={P.haloWidth}
          strokeCap="round"
          strokeJoin="round"
          color={P.haloColor}
          opacity={resolved.haloAlpha}
          start={0}
          end={1}
        >
          <BlurMask style="normal" blur={P.haloBlur} />
        </Path>
        {/* L2 · 外围双层柔光——外层（更宽更淡） */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={P.softTierBWidth}
          strokeCap="round"
          strokeJoin="round"
          color={P.softColor}
          opacity={resolved.softAlphaB}
          start={0}
          end={1}
        >
          <BlurMask style="normal" blur={P.softTierBBlur} />
        </Path>
        {/* L2 · 外围双层柔光——主层（5pt） */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={P.softTierAWidth}
          strokeCap="round"
          strokeJoin="round"
          color={P.softColor}
          opacity={resolved.softAlphaA}
          start={0}
          end={1}
        >
          <BlurMask style="normal" blur={P.softTierABlur} />
        </Path>
        {/* L1 · 核心描边（1.2pt #F5DFB0，0-1000ms 生长 + 1000-1150ms 保持） */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={P.coreLineWidth}
          strokeCap="round"
          strokeJoin="round"
          color={P.coreColor}
          opacity={resolved.coreAlpha}
          start={0}
          end={resolved.growth}
        />
        {/* L4 · 鱼体内部局部反光（裁切进鱼形，径向渐变，峰值 α0.12） */}
        <Group clip={path}>
          <Circle cx={glint.cx} cy={glint.cy} r={glint.r} opacity={resolved.glintAlpha}>
            <RadialGradient
              c={{ x: glint.cx, y: glint.cy }}
              r={glint.r}
              colors={[P.glintColor, 'rgba(240,220,165,0)']}
            />
          </Circle>
        </Group>
      </Canvas>
    </View>
  );
};
