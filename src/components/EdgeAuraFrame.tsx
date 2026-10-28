import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  AlphaType,
  Canvas,
  ColorType,
  Fill,
  ImageShader,
  Shader,
  Skia,
} from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { palette } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import {
  buildEdgeAuraShader,
  derivePhases,
  deriveStreamHarmonics,
  hexToRgb,
  resolveDarkPalette,
  type EdgeAuraStop,
} from './edgeAuraEngine';

/**
 * 页面边缘光晕（edge-aura 方案移植，色系保持渔见清晨湖畔）。
 *
 * edge-aura.js.org 的本源用法：一条贴着「整块屏幕边缘」流动的有机光晕。
 * 動效模型直接移植原站引擎（细节见 edgeAuraEngine.ts）：亮芯 + 内长尾
 * 羽化沿屏幕边缘流动（8s/圈），粗细与亮度被环形噪声调制缓慢呼吸，
 * 入场自底边中点点亮扫过半环；色板换成渔见自有 token（湖水青 → 鱼鳞
 * 薄荷 → 湖雾白 → 晨金结 → 回青），其余几何 / 噪声 / gamma 参数与原站
 * 默认一致（band 按屏幕高度比例缩放，圆角默认贴合手机屏幕曲率）。
 *
 * 驱动：Skia RuntimeEffect 每帧只更新一个 time uniform（Reanimated
 * useFrameCallback，UI 线程）；Reduce Motion 时静止呈现（入场完成后的一帧）。
 * 性能（移动端实测修订）：默认 30fps 限帧（慢速流动视觉无差）、噪声略去
 * 第三倍频、带宽按屏幕短边 13% 收敛（原站比例锚定屏高，在长屏手机上
 * 会铺满过宽、着色面积过大）。
 * jest / Skia 原生不可用时组件退场为 null，不阻塞取景页。
 */

/** LUT 贴图宽度（原引擎 LUT_SIZE=256） */
const LUT_WIDTH = 256;

/** 噪声相位种子：固定值保证每次进入取景页光晕形态一致 */
const AURA_SEED = 20261025;

/** Reduce Motion 静态帧的时刻：入场完成后、色相漂移中段 */
const STATIC_TIME = 3.2;

/** 渔见色系光环（结构对照 opal：冷色基底 + 中段单一暖结） */
const LAKE_STOPS: EdgeAuraStop[] = [
  [0.0, hexToRgb(palette.waterTeal)],
  [0.16, hexToRgb(palette.fishMint)],
  [0.32, hexToRgb(palette.softWater)],
  [0.44, hexToRgb(palette.accentGold)],
  [0.5, hexToRgb(palette.achievement)],
  [0.57, hexToRgb(palette.achievementInk)],
  [0.76, hexToRgb(palette.fishGreen)],
  [1.0, hexToRgb(palette.waterTeal)],
];

export interface EdgeAuraFrameProps {
  /** 目标区域宽（pt；贴边模式传窗口宽） */
  width: number;
  /** 目标区域高（pt；贴边模式传窗口高） */
  height: number;
  /** 贴边模式：光环贴画布四边、管外被屏幕边缘裁掉（原站整屏用法，默认开） */
  edgeToEdge?: boolean;
  /** 暂停流动（页面失焦时停表，回到前台继续） */
  paused?: boolean;
  /** 调色板停靠点（默认渔见清晨湖畔色系） */
  stops?: EdgeAuraStop[];
  /** 圆角半径（pt，默认 24 贴合手机屏幕曲率；桌面观感可调小） */
  cornerRadius?: number;
  /** 羽化带深度（pt，默认按屏幕短边 13% —— 手机约 51pt；原站桌面比例约 94pt） */
  band?: number;
  /** 动效帧率上限（默认 30：慢速流动光晕 30fps 视觉无差，GPU 减半） */
  maxFps?: number;
  /** 容器附加样式（如 zIndex 层级；尺寸由组件自管） */
  style?: StyleProp<ViewStyle>;
}

export const EdgeAuraFrame: React.FC<EdgeAuraFrameProps> = ({
  width,
  height,
  edgeToEdge = true,
  paused = false,
  stops = LAKE_STOPS,
  cornerRadius = 24,
  band,
  maxFps = 30,
  style,
}) => {
  const { reduceMotion } = useTheme();
  const effBand = band ?? Math.min(96, Math.max(14, Math.round(Math.min(width, height) * 0.13)));

  const built = useMemo(() => {
    // jest 与原生未就绪时 Skia 工厂缺失：静态退场（取景页不依赖本组件可用性）
    if (
      typeof Skia.RuntimeEffect?.Make !== 'function' ||
      typeof Skia.Image?.MakeImage !== 'function' ||
      typeof Skia.Data?.fromBytes !== 'function'
    ) {
      return null;
    }
    const inset = 3;
    const rim = inset + cornerRadius;
    const arc = (Math.PI / 2) * cornerRadius;
    const perimeter = 2 * (width - 2 * rim) + 2 * (height - 2 * rim) + 4 * arc;
    const { rgba, effRingAlpha } = resolveDarkPalette(stops);
    const { sksl, pad } = buildEdgeAuraShader({
      frameWidth: width,
      frameHeight: height,
      inset,
      cornerRadius,
      band: effBand,
      ringAlpha: effRingAlpha,
      harmonics: deriveStreamHarmonics(perimeter),
      phases: derivePhases(AURA_SEED),
      rotateIdleS: 8,
      hueDriftDeg: 10,
      hueDriftPeriodS: 12,
      kindleDurS: 0.85,
      edgeClipped: edgeToEdge,
    });
    const effect = Skia.RuntimeEffect.Make(sksl);
    if (!effect) {
      return null;
    }
    const lutImage = Skia.Image.MakeImage(
      {
        width: LUT_WIDTH,
        height: 1,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Opaque,
      },
      Skia.Data.fromBytes(rgba),
      LUT_WIDTH * 4,
    );
    if (!lutImage) {
      return null;
    }
    return { effect, lutImage, pad };
  }, [width, height, stops, cornerRadius, effBand, edgeToEdge]);

  const time = useSharedValue(0);
  // 限帧：跳过的帧不计时间，dt 取真实经过时长（动画速度不变）；
  // 慢速流动光晕 30fps 视觉无差，GPU 着色与重绘开销减半
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
    time.value += Math.min(elapsed, 120) / 1000;
  });

  // RN Skia 录制器只识别「整个 props 值是共享值」的动画属性（Recorder.processProps
  // 只查顶层）；uniforms 里的共享值必须整体包成派生值传入，否则 UI 线程
  // 应用时会抛 "Missing uniform value for: time"。
  const animatedUniforms = useDerivedValue(() => ({ time: time.value }));

  if (!built) {
    return null;
  }

  // Reduce Motion 时不跑帧回调，传静态的入场完成后时刻
  const uniforms = (
    reduceMotion ? { time: STATIC_TIME } : animatedUniforms
  ) as unknown as { time: number };

  const cw = width + built.pad * 2;
  const ch = height + built.pad * 2;

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: -built.pad,
          top: -built.pad,
          width: cw,
          height: ch,
        },
        style,
      ]}
    >
      <Canvas style={{ flex: 1 }}>
        <Fill>
          <Shader source={built.effect} uniforms={uniforms}>
            <ImageShader
              image={built.lutImage}
              fit="fill"
              rect={{ x: 0, y: 0, width: LUT_WIDTH, height: 1 }}
              tx="clamp"
              ty="clamp"
            />
          </Shader>
        </Fill>
      </Canvas>
    </View>
  );
};
