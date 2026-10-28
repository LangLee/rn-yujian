/**
 * WaterLightFrame / waterLightEngine 单元测试。
 *
 * 覆盖两层：
 *  - 纯引擎移植（waterLightEngine.ts）：demo 冻结配置逐字段核对、
 *    颜色解析、光环周长几何（分段闭合）、SkSL 生成（uniform 声明与
 *    烘焙常量在场、核心光学场函数齐备）；
 *  - 组件冒烟：jest 下 Skia 原生不可用，组件应静默退场（渲染 null），
 *    不阻塞识别页。
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { WaterLightFrame } from '../src/components/WaterLightFrame';
import {
  buildWaterLightShader,
  DEFAULT_WATER_LIGHT_CONFIG,
  hexToRgbUnit,
  waterLightGeometry,
  WATER_LIGHT_EFFECT_01,
  WATER_LIGHT_EFFECT_02,
} from '../src/components/waterLightEngine';

describe('waterLightEngine 冻结配置', () => {
  test('效果02（默认推荐）与 demo 冻结值一致（深湖青与琥珀金调）', () => {
    expect(WATER_LIGHT_EFFECT_02).toEqual({
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
    });
    expect(DEFAULT_WATER_LIGHT_CONFIG).toBe(WATER_LIGHT_EFFECT_02);
  });

  test('效果01（经典）与 demo 冻结值一致（湖天碧蓝与晨曦日光金调）', () => {
    expect(WATER_LIGHT_EFFECT_01).toEqual({
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
    });
  });
});

describe('waterLightEngine 几何与颜色', () => {
  test('hexToRgbUnit 解析 #RRGGBB 为 0..1', () => {
    expect(hexToRgbUnit('#4d9b91')).toEqual([(0x4d * 1) / 255, (0x9b * 1) / 255, (0x91 * 1) / 255]);
    expect(hexToRgbUnit('#FEF08A')[0]).toBeCloseTo(0.996, 3);
    expect(() => hexToRgbUnit('teal')).toThrow(/无效颜色/);
  });

  test('周长几何：分段长度闭合、圆角不越出直边', () => {
    const geo = waterLightGeometry(393, 852, 0.015);
    const {
      margin, cornerR, straightW, straightH, cornerArc, totalPerimeter,
    } = geo;
    expect(margin).toBeCloseTo(393 * 0.015, 6);
    expect(cornerR).toBeCloseTo(Math.min(393 * 0.12, (393 - 2 * margin) / 2), 6);
    expect(totalPerimeter).toBeCloseTo(2 * straightW + 2 * straightH + 4 * cornerArc, 6);
    // 8 段分段（半底 + 弧 + 右边 + 弧 + 顶 + 弧 + 左边 + 弧 + 半底）拼满整环
    const segmentsSum = straightW / 2 + cornerArc + straightH + cornerArc
      + straightW + cornerArc + straightH + cornerArc + straightW / 2;
    expect(segmentsSum).toBeCloseTo(totalPerimeter, 6);
  });
});

describe('waterLightEngine SkSL 生成', () => {
  const build = () =>
    buildWaterLightShader({ width: 393, height: 852, config: WATER_LIGHT_EFFECT_02 });

  test('逐帧 uniform 只有 time / spread', () => {
    const { sksl } = build();
    expect(sksl.match(/uniform float (\w+);/g)).toEqual(['uniform float time;', 'uniform float spread;']);
  });

  test('包含核心光学场与流光点缀（光环 SDF / 焦散 / 光斑 / 周长参数化）', () => {
    const { sksl } = build();
    expect(sksl).toContain('sdRoundedBox');
    expect(sksl).toContain('causticField');
    expect(sksl).toContain('lightSpotsField');
    expect(sksl).toContain('perimeterPoint');
    expect(sksl).toContain('half4 main(float2 xy)');
  });

  test('烘焙关键常量：画布尺寸 / 配色 / 入场揭示在场，浮点常量带小数点', () => {
    const { sksl } = build();
    expect(sksl).toContain('const float W = 393.0;');
    expect(sksl).toContain('const float H = 852.0;');
    expect(sksl).toContain('const float3 GOLD');
    expect(sksl).toContain('revealedMask');
    expect(sksl).toContain('spread * 1.08');
    // SkSL 浮点常量不能是整数字面量
    expect(sksl).not.toMatch(/const float3? \w+ = \d+;/);
  });
});

describe('WaterLightFrame 组件', () => {
  test('jest 下 Skia 原生不可用：静默退场不渲染内容、不抛错', () => {
    const { toJSON } = render(
      <ThemeProvider>
        <WaterLightFrame width={393} height={852} />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeNull();
  });

  test('在布局中不阻塞兄弟内容', async () => {
    const { findByText } = render(
      <ThemeProvider>
        <>
          <WaterLightFrame width={393} height={852} paused />
          <Text>识别状态</Text>
        </>
      </ThemeProvider>,
    );
    // ThemeProvider 初始 loading，异步就绪后兄弟内容应正常出现
    expect(await findByText('识别状态')).toBeTruthy();
  });
});
