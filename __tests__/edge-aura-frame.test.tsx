/**
 * EdgeAuraFrame / edgeAuraEngine 单元测试。
 *
 * 覆盖两层：
 *  - 纯引擎移植（edgeAuraEngine.ts）：调色板 LUT（sRGB 插值 + pastel 提亮 +
 *    首尾闭合）、暗底归一化、噪声流整数谐波（沿环闭合的必要条件）、
 *    SkSL 生成（uniform 声明与烘焙常量在场）；
 *  - 组件冒烟：jest 下 Skia 原生不可用，组件应静默退场（渲染 null），
 *    不阻塞取景页。
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { EdgeAuraFrame } from '../src/components/EdgeAuraFrame';
import {
  buildEdgeAuraShader,
  buildPaletteLut,
  derivePhases,
  deriveStreamHarmonics,
  hexToRgb,
  mulberry32,
  resolveDarkPalette,
  type EdgeAuraStop,
} from '../src/components/edgeAuraEngine';

/** 与组件默认一致的湖畔色系停靠点（首尾闭合） */
const LAKE_STOPS: EdgeAuraStop[] = [
  [0, hexToRgb('#0F7A78')],
  [0.16, hexToRgb('#BCD9D5')],
  [0.32, hexToRgb('#EAF3F1')],
  [0.44, hexToRgb('#D6A541')],
  [0.5, hexToRgb('#F7EED8')],
  [0.57, hexToRgb('#9A7B3F')],
  [0.76, hexToRgb('#93B0AB')],
  [1, hexToRgb('#0F7A78')],
];

describe('edgeAuraEngine 调色板', () => {
  test('hexToRgb 解析 #RRGGBB', () => {
    expect(hexToRgb('#0F7A78')).toEqual([15, 122, 120]);
    expect(hexToRgb('#D6A541')).toEqual([214, 165, 65]);
  });

  test('LUT 首尾一致（环闭合无接缝）且长度为 256', () => {
    const lut = buildPaletteLut(LAKE_STOPS, 0.35);
    expect(lut.length).toBe(256 * 3);
    expect(Array.from(lut.slice(0, 3))).toEqual(Array.from(lut.slice(255 * 3, 256 * 3)));
  });

  test('pastel 把所有停靠点向白提亮（同通道值 ≥ 原值）', () => {
    const raw = buildPaletteLut(LAKE_STOPS, 0);
    const lifted = buildPaletteLut(LAKE_STOPS, 0.35);
    for (let i = 0; i < raw.length; i++) {
      expect(lifted[i]).toBeGreaterThanOrEqual(raw[i]);
    }
  });

  test('暗底解析：256×4 RGBA、A=255、effRingAlpha 落在 [0.45, 1]', () => {
    const { rgba, effRingAlpha } = resolveDarkPalette(LAKE_STOPS);
    expect(rgba.length).toBe(256 * 4);
    expect(effRingAlpha).toBeGreaterThanOrEqual(0.45);
    expect(effRingAlpha).toBeLessThanOrEqual(1);
    for (let i = 0; i < 256; i++) {
      expect(rgba[i * 4 + 3]).toBe(255);
    }
  });
});

describe('edgeAuraEngine 噪声流', () => {
  test('谐波为 ≥1 的整数（整数倍频保证沿环闭合无缝）', () => {
    const streams = deriveStreamHarmonics(1149.2);
    expect(streams).toHaveLength(5);
    for (const [k1, k2, k3] of streams) {
      expect(Number.isInteger(k1)).toBe(true);
      expect(Number.isInteger(k2)).toBe(true);
      expect(Number.isInteger(k3)).toBe(true);
      expect(k1).toBeGreaterThanOrEqual(1);
      expect(k2).toBeGreaterThanOrEqual(1);
      expect(k3).toBeGreaterThanOrEqual(1);
    }
  });

  test('mulberry32 同种子序列可复现，相位在 [0, 80)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 8; i++) {
      expect(a()).toBe(b());
    }
    for (const ph of derivePhases(7)) {
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(80);
    }
  });
});

describe('edgeAuraEngine SkSL 生成', () => {
  const build = () =>
    buildEdgeAuraShader({
      frameWidth: 400,
      frameHeight: 195,
      inset: 3,
      cornerRadius: 12,
      band: 21,
      ringAlpha: 0.9,
      harmonics: deriveStreamHarmonics(1200),
      phases: derivePhases(20261025),
      rotateIdleS: 8,
      hueDriftDeg: 10,
      hueDriftPeriodS: 12,
      kindleDurS: 0.85,
    });

  test('声明 lut 子着色器与 time uniform（唯一的逐帧输入）', () => {
    const { sksl } = build();
    expect(sksl).toContain('uniform shader lut;');
    expect(sksl.match(/uniform float (\w+);/g)).toEqual(['uniform float time;']);
  });

  test('烘焙关键常量：画布留白为正、含入场点亮与 p3 合成', () => {
    const { sksl, pad } = build();
    expect(pad).toBeGreaterThan(0);
    expect(sksl).toContain('kindleEnv');
    expect(sksl).toContain('pow(acc.p3');
    // SkSL 浮点常量不能是整数字面量
    expect(sksl).not.toMatch(/const float \w+ = \d+;/);
  });

  test('贴边模式（整屏用法）：不留 pad，画布边界即裁切', () => {
    const { pad } = buildEdgeAuraShader({
      frameWidth: 393,
      frameHeight: 852,
      inset: 3,
      cornerRadius: 24,
      band: 90,
      ringAlpha: 0.9,
      harmonics: deriveStreamHarmonics(2500),
      phases: derivePhases(1),
      rotateIdleS: 8,
      hueDriftDeg: 10,
      hueDriftPeriodS: 12,
      kindleDurS: 0.85,
      edgeClipped: true,
    });
    expect(pad).toBe(0);
  });
});

describe('EdgeAuraFrame 组件', () => {
  test('jest 下 Skia 原生不可用：静默退场不渲染内容、不抛错', () => {
    const { toJSON } = render(
      <ThemeProvider>
        <EdgeAuraFrame width={400} height={195} />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeNull();
  });

  test('在布局中不阻塞兄弟内容', async () => {
    const { findByText } = render(
      <ThemeProvider>
        <>
          <EdgeAuraFrame width={400} height={195} paused />
          <Text>取景状态</Text>
        </>
      </ThemeProvider>,
    );
    // ThemeProvider 初始 loading，异步就绪后兄弟内容应正常出现
    expect(await findByText('取景状态')).toBeTruthy();
  });
});
