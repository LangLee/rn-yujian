import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import {
  buildWaterLightShader,
  DEFAULT_WATER_LIGHT_CONFIG,
  type WaterLightConfig,
} from './waterLightEngine';

/**
 * 四周水光光场（demo「渔见识别 · 四周水光」效果02 的 RN 移植）。
 *
 * 识别过程动效本体：贴屏幕内缘的有机水光环（宽晕 + 中层辉光 + 波峰丝
 * 三层 bloom，环上深湖青 / 琥珀金 / 雾蓝缠绕流转）+ 底部湖水焦散与晨光
 * 光斑 + 沿环漂移的呼吸光珠与底边中点水纹装饰。入场 1.2s 自下而上点亮
 * 解锁，之后常流转不停止（细节见 waterLightEngine.ts 的移植注记）。
 *
 * 驱动：Skia RuntimeEffect 每帧只更新 time / spread 两个 uniform
 * （Reanimated useFrameCallback，UI 线程）；paused（RESOLVE）停表冻结
 * 段位；Reduce Motion 时静态呈现入场完成后的稳态帧。
 * 性能：默认 30fps 限帧（慢速流转视觉无差，GPU 着色开销减半）。
 * jest / Skia 原生不可用时组件退场为 null，不阻塞识别页。
 */

/** Reduce Motion 静态帧的时刻：入场点亮完成后的稳态流转中段 */
const STATIC_TIME = 2.6;

export interface WaterLightFrameProps {
  /** 画布宽（pt；识别页传窗口宽） */
  width: number;
  /** 画布高（pt；识别页传窗口高） */
  height: number;
  /** 暂停流转（RESOLVE 收场停表冻结段位，回到前台继续） */
  paused?: boolean;
  /** 冻结配置（默认效果02：深湖青与琥珀金调） */
  config?: WaterLightConfig;
  /** 动效帧率上限（默认 30） */
  maxFps?: number;
  /** 容器附加样式（如 zIndex 层级；尺寸由组件自管） */
  style?: StyleProp<ViewStyle>;
}

export const WaterLightFrame: React.FC<WaterLightFrameProps> = ({
  width,
  height,
  paused = false,
  config = DEFAULT_WATER_LIGHT_CONFIG,
  maxFps = 30,
  style,
}) => {
  const { reduceMotion } = useTheme();

  const effect = useMemo(() => {
    // jest 与原生未就绪时 Skia 工厂缺失：静态退场（识别页不依赖本组件可用性）
    if (typeof Skia.RuntimeEffect?.Make !== 'function') {
      return null;
    }
    const { sksl } = buildWaterLightShader({ width, height, config });
    return Skia.RuntimeEffect.Make(sksl);
  }, [width, height, config]);

  const spreadDurS = config.spreadDurationMs / 1000;
  const time = useSharedValue(0);
  // 入场点亮时钟（秒，封顶在 spreadDurationMs；点亮完成后不再增长）
  const spreadClock = useSharedValue(0);
  // 限帧：跳过的帧不计时间，dt 取真实经过时长（动画速度不变）
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
    const dt = (Math.min(elapsed, 120) / 1000) * config.speed;
    time.value += dt;
    if (spreadClock.value < spreadDurS) {
      spreadClock.value = Math.min(spreadDurS, spreadClock.value + dt);
    }
  });

  // RN Skia 录制器只识别「整个 props 值是共享值」的动画属性（Recorder.processProps
  // 只查顶层）；uniforms 里的共享值必须整体包成派生值传入，否则 UI 线程
  // 应用时会抛 "Missing uniform value for: time"。
  const animatedUniforms = useDerivedValue(() => ({
    time: time.value,
    spread: Math.min(1, spreadClock.value / spreadDurS),
  }));

  if (!effect) {
    return null;
  }

  // Reduce Motion 时不跑帧回调，传静态的入场完成后稳态时刻
  const uniforms = (
    reduceMotion ? { time: STATIC_TIME, spread: 1 } : animatedUniforms
  ) as unknown as { time: number; spread: number };

  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    >
      <Canvas style={{ flex: 1 }}>
        <Fill>
          <Shader source={effect} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
};
