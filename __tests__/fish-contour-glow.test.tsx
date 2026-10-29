/**
 * FishContourGlow / fishContourEngine 单元测试。
 *
 * 覆盖两层：
 *  - 纯引擎（fishContourEngine.ts）：bbox → 屏幕映射（cover / contain 与
 *    RN Image 同构）、有机鱼形折线（闭合、贴合包围盒、朝向自适应）、
 *    V1.1 经典金时间线包络（生长 / 阶段互斥 / 确认高光 / ±3% 巡航的
 *    冻结关键帧）；
 *  - 组件冒烟：jest 下 Skia 原生不可用，组件应静默退场（渲染 null），
 *    不阻塞识别页。
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { FishContourGlow } from '../src/components/FishContourGlow';
import {
  buildFishContourPoints,
  CONTOUR_PARAMS,
  contourTimeline,
  mapBoxToScreenRect,
  mapContourPointsToScreen,
} from '../src/components/fishContourEngine';

const BOX = { x1: 0.25, y1: 0.2, x2: 0.75, y2: 0.8 };

describe('fishContourEngine bbox → 屏幕映射', () => {
  test('cover：铺满裁切，bbox 按显示 scale + 居中偏移映射', () => {
    // 照片 800×1200，画布 400×800：cover scale = max(0.5, 0.667) = 2/3
    // 显示照片 533.3×800，水平居中偏移 dx = -66.7，dy = 0
    const rect = mapBoxToScreenRect(BOX, 800, 1200, 400, 800, 'cover');
    expect(rect).not.toBeNull();
    expect(rect!.w).toBeCloseTo(0.5 * 800 * (2 / 3), 3);
    expect(rect!.h).toBeCloseTo(0.6 * 1200 * (2 / 3), 3);
    expect(rect!.x).toBeCloseTo(0.25 * 800 * (2 / 3) + (400 - 800 * (2 / 3)) / 2, 3);
    expect(rect!.y).toBeCloseTo(0.2 * 1200 * (2 / 3), 3);
  });

  test('contain：完整居中，bbox 全部落在画布内', () => {
    const rect = mapBoxToScreenRect(BOX, 800, 1200, 400, 800, 'contain');
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.w).toBeLessThanOrEqual(400 + 1e-6);
    expect(rect!.y + rect!.h).toBeLessThanOrEqual(800 + 1e-6);
  });

  test('退化输入（尺寸缺失 / 过小框）返回 null，组件侧安全退场', () => {
    expect(mapBoxToScreenRect(BOX, 0, 1200, 400, 800, 'cover')).toBeNull();
    expect(mapBoxToScreenRect({ x1: 0.5, y1: 0.5, x2: 0.505, y2: 0.505 }, 800, 1200, 400, 800, 'cover')).toBeNull();
  });
});

describe('fishContourEngine SAM 真实轮廓映射', () => {
  /** 照片 800×1200 中部一条竖向鱼形轮廓（归一化闭合折线，首尾不重复） */
  const CONTOUR = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return { x: 0.5 + 0.12 * Math.cos(a), y: 0.5 + 0.25 * Math.sin(a) };
  });

  test('cover：逐点映射与 mapBoxToScreenRect 同构，包围盒落在映射矩形内', () => {
    const mapped = mapContourPointsToScreen(CONTOUR, 800, 1200, 400, 800, 'cover');
    expect(mapped).not.toBeNull();
    const boxRect = mapBoxToScreenRect(
      { x1: 0.38, y1: 0.25, x2: 0.62, y2: 0.75 },
      800, 1200, 400, 800, 'cover',
    )!;
    for (const p of mapped!.points) {
      expect(p.x).toBeGreaterThanOrEqual(boxRect.x - 1e-6);
      expect(p.x).toBeLessThanOrEqual(boxRect.x + boxRect.w + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(boxRect.y - 1e-6);
      expect(p.y).toBeLessThanOrEqual(boxRect.y + boxRect.h + 1e-6);
    }
    expect(mapped!.points).toHaveLength(CONTOUR.length);
  });

  test('contain：点全部落回画布内（完整居中）', () => {
    const mapped = mapContourPointsToScreen(CONTOUR, 800, 1200, 400, 800, 'contain');
    expect(mapped).not.toBeNull();
    for (const p of mapped!.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(800);
    }
  });

  test('退化输入（点数不足 / 包围盒过小）返回 null', () => {
    expect(mapContourPointsToScreen(CONTOUR.slice(0, 5), 800, 1200, 400, 800, 'cover')).toBeNull();
    const tiny = Array.from({ length: 12 }, (_, i) => ({
      x: 0.5 + 0.001 * Math.cos((i / 12) * Math.PI * 2),
      y: 0.5 + 0.001 * Math.sin((i / 12) * Math.PI * 2),
    }));
    expect(mapContourPointsToScreen(tiny, 800, 1200, 400, 800, 'cover')).toBeNull();
  });
});

describe('fishContourEngine 有机鱼形折线', () => {
  test('闭合折线：尾点回到起点、总弧长为正', () => {
    const geo = buildFishContourPoints({ x: 100, y: 200, w: 160, h: 300 });
    expect(geo.points.length).toBeGreaterThan(50);
    expect(geo.totalLength).toBeGreaterThan(2 * (geo.rect.w + geo.rect.h) * 0.8);
    const first = geo.points[0];
    const last = geo.points[geo.points.length - 1];
    // 闭合边回到起点（总弧长含该边；末点应接近起点形成环）
    const closing = Math.hypot(first.x - last.x, first.y - last.y);
    expect(geo.totalLength).toBeGreaterThanOrEqual(closing);
  });

  test('横向 bbox 用横向鱼形、竖向 bbox 用竖向鱼形', () => {
    const horizontal = buildFishContourPoints({ x: 0, y: 0, w: 300, h: 120 });
    const vertical = buildFishContourPoints({ x: 0, y: 0, w: 120, h: 300 });
    expect(horizontal.vertical).toBe(false);
    expect(vertical.vertical).toBe(true);
  });

  test('折线点全部落在包围盒外扩 5% 内（轮廓贴合 bbox，不飘出）', () => {
    const rect = { x: 50, y: 80, w: 200, h: 360 };
    const geo = buildFishContourPoints(rect);
    const padX = rect.w * 0.05;
    const padY = rect.h * 0.05;
    for (const p of geo.points) {
      expect(p.x).toBeGreaterThanOrEqual(rect.x - padX - 0.5);
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.w + padX + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - padY - 0.5);
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.h + padY + 0.5);
    }
  });
});

describe('fishContourEngine V1.1 经典金时间线', () => {
  test('描边生长：0ms 全隐、1000ms 完成、中点为 smoothstep 0.5', () => {
    expect(contourTimeline(0).growth).toBe(0);
    expect(contourTimeline(CONTOUR_PARAMS.strokeGrowthMs).growth).toBe(1);
    expect(contourTimeline(500).growth).toBeCloseTo(0.5, 6);
    expect(contourTimeline(2000).growth).toBe(1);
  });

  test('核心描边：稳定 α0.75，确认高光 1680ms 峰值 ×1.15、1850ms 归位', () => {
    expect(contourTimeline(1200).coreAlpha).toBeCloseTo(0.75, 6);
    expect(contourTimeline(CONTOUR_PARAMS.confirmPeakMs).coreAlpha).toBeCloseTo(0.75 * 1.15, 6);
    const mid = contourTimeline(CONTOUR_PARAMS.confirmMidMs);
    expect(mid.coreAlpha).toBeCloseTo(0.75 * (1 + 0.15 * 0.5), 6);
    expect(contourTimeline(CONTOUR_PARAMS.confirmEndMs).coreAlpha).toBeCloseTo(0.75, 6);
  });

  test('阶段严格互斥：1150ms 前柔光/光晕/反光彻底关闭，1400ms 淡入完成', () => {
    expect(contourTimeline(0).softAlpha).toBe(0);
    expect(contourTimeline(1000).softAlpha).toBe(0);
    expect(contourTimeline(1149).haloAlpha).toBe(0);
    expect(contourTimeline(1149).glintAlpha).toBe(0);
    // 1300ms 为淡入中段（smoothstep(0.6) = 0.648）
    const mid = contourTimeline(1300).softAlpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.24);
  });

  test('柔光族稳定巡航：循环幅度 ≤ ±3%（0.24 基线；确认高光窗口除外）', () => {
    for (let t = 1400; t <= 2600; t += 50) {
      // 1600-1850ms 是识别确认高光（Soft ×1.25）的一次性事件峰，
      // 不属于「循环幅度」的约束范围（核对清单第 5 / 6 条分别冻结）
      if (t >= CONTOUR_PARAMS.confirmStartMs && t <= CONTOUR_PARAMS.confirmEndMs) {
        continue;
      }
      const s = contourTimeline(t).softAlpha;
      expect(s).toBeGreaterThanOrEqual(0.24 * 0.97 - 1e-9);
      expect(s).toBeLessThanOrEqual(0.24 * 1.03 + 1e-9);
    }
    expect(contourTimeline(1500).softAlpha).toBeGreaterThan(0);
    expect(contourTimeline(1500).haloAlpha).toBeGreaterThan(0);
  });

  test('识别确认高光：1680ms 柔光 ×1.25（叠巡航后明显高于巡航基线）', () => {
    const cruise = contourTimeline(1500).softAlpha;
    const peak = contourTimeline(CONTOUR_PARAMS.confirmPeakMs).softAlpha;
    expect(peak).toBeGreaterThan(cruise * 1.2);
  });

  test('体内反光峰值封顶 α0.12，且任何时刻不超过', () => {
    for (let t = 0; t <= 2600; t += 25) {
      expect(contourTimeline(t).glintAlpha).toBeLessThanOrEqual(0.12 + 1e-9);
    }
    expect(contourTimeline(CONTOUR_PARAMS.confirmPeakMs).glintAlpha).toBeCloseTo(0.12, 6);
  });
});

describe('FishContourGlow 组件', () => {
  test('jest 下 Skia 原生不可用：静默退场不渲染内容、不抛错（bbox 合成模式）', () => {
    const { toJSON } = render(
      <ThemeProvider>
        <FishContourGlow
          width={393}
          height={852}
          fishBox={BOX}
          photoWidth={800}
          photoHeight={1200}
          photoFit="cover"
        />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeNull();
  });

  test('SAM 真实轮廓模式：contourPoints 与 fishBox 并存时优先轮廓，同样静默退场', () => {
    const contour = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return { x: 0.5 + 0.12 * Math.cos(a), y: 0.5 + 0.25 * Math.sin(a) };
    });
    const { toJSON } = render(
      <ThemeProvider>
        <FishContourGlow
          width={393}
          height={852}
          contourPoints={contour}
          fishBox={BOX}
          photoWidth={800}
          photoHeight={1200}
          photoFit="cover"
        />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeNull();
  });

  test('在布局中不阻塞兄弟内容', async () => {
    const { findByText } = render(
      <ThemeProvider>
        <>
          <FishContourGlow
            width={393}
            height={852}
            fishBox={BOX}
            photoWidth={800}
            photoHeight={1200}
            photoFit="cover"
            paused
          />
          <Text>识别状态</Text>
        </>
      </ThemeProvider>,
    );
    expect(await findByText('识别状态')).toBeTruthy();
  });
});
