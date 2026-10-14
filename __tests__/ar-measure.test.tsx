/**
 * AR 自动量尺层测试（全屏浮层形态）：平面检测 → 按下鱼头锚定 → 拖动实时画线
 * → 松手确认 → 自动长度 → 「用 X cm」上抛；拖动未命中平面白线仍可见；
 * 以及会话失败回落手动量尺、关闭按钮。
 * 原生视图与 hitTest 均 mock（requireNativeComponent 已在 setup 兜底为 View）。
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockHitTest = jest.fn();
jest.mock('../src/native/arMeasure', () => ({
  arMeasure: {
    available: true,
    probeSupport: async () => ({ level: 'supported', engine: 'huawei' }),
    requestInstall: async () => true,
    hitTest: (...args) => mockHitTest(...args),
  },
}));
jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));

import { ARMeasureLayer } from '../src/components/ARMeasureLayer';
import { ThemeProvider } from '../src/contexts/ThemeContext';

const renderLayer = async (
  props?: Partial<Parameters<typeof ARMeasureLayer>[0]>,
) => {
  const onMeasured = jest.fn();
  const onFallbackManual = jest.fn();
  const onClose = jest.fn();
  render(
    <ThemeProvider>
      <ARMeasureLayer
        engine="huawei"
        onMeasured={onMeasured}
        onFallbackManual={onFallbackManual}
        onClose={onClose}
        {...props}
      />
    </ThemeProvider>,
  );
  // ThemeProvider 主题异步加载完成后才挂载 children
  await screen.findByTestId('ar-measure-view');
  return { onMeasured, onFallbackManual, onClose };
};

const flush = () => act(async () => {});

describe('ARMeasureLayer AR 自动量尺', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('扫平面 → 按下鱼头锚定 → 拖动实时画线 → 松手确认 → 「用 X cm」上抛', async () => {
    // 第一点 (0,0,0) 米；其后 (0.3,0,0) 米 → 30 cm
    mockHitTest
      .mockResolvedValueOnce({ x: 0, y: 0, z: 0, plane: true })
      .mockResolvedValue({ x: 0.3, y: 0, z: 0, plane: true });

    const { onMeasured } = await renderLayer();

    // 初始：扫描平面
    expect(screen.getByText('AR 量尺')).toBeTruthy();
    expect(screen.getByText(/正在扫描平面/)).toBeTruthy();

    // 平面就绪
    fireEvent(screen.getByTestId('ar-measure-view'), 'planeDetected', { nativeEvent: {} });
    expect(screen.getByText('按住鱼头，拖到鱼尾松手')).toBeTruthy();

    // 按下鱼头 → hitTest 锚定，进入 measuring
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderGrant', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();
    expect(mockHitTest).toHaveBeenCalledWith(100, 400);
    expect(screen.getByText('拖动实时预览，松手确认长度')).toBeTruthy();

    // 未拖动的轻点松手：只放锚点，不确认鱼尾
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderRelease', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();
    expect(screen.getByText('拖动实时预览，松手确认长度')).toBeTruthy();

    // 拖动：hitTest 尚未返回时白线已实时可见（数值待测）
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderMove', {
      nativeEvent: { pageX: 300, pageY: 400 },
    });
    expect(screen.getByText('实时测量中')).toBeTruthy();
    await flush();
    expect(screen.getAllByText('30.0 cm').length).toBeGreaterThanOrEqual(1);

    // 松手确认 → 30.0 cm
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderRelease', {
      nativeEvent: { pageX: 300, pageY: 400 },
    });
    await flush();
    expect(screen.getAllByText('30.0 cm').length).toBeGreaterThanOrEqual(1);

    // 「用 30.0 cm」→ 上抛 AR 实测长度
    fireEvent.press(screen.getByText('用 30.0 cm'));
    expect(onMeasured).toHaveBeenCalledTimes(1);
    const reported = onMeasured.mock.calls[0][0];
    expect(reported).toBeCloseTo(30, 5);
  });

  test('拖动预览 hitTest 未命中平面，白线仍实时可见', async () => {
    mockHitTest
      .mockResolvedValueOnce({ x: 0, y: 0, z: 0, plane: true }) // 锚定鱼头
      .mockResolvedValue(null); // 拖动全程未命中

    await renderLayer();
    fireEvent(screen.getByTestId('ar-measure-view'), 'planeDetected', { nativeEvent: {} });

    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderGrant', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();

    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderMove', {
      nativeEvent: { pageX: 320, pageY: 460 },
    });
    await flush();

    // 白线在画（线体 View + 标签可见），数值保持待测，未进入完成态
    expect(screen.getByTestId('measure-line-body')).toBeTruthy();
    expect(screen.getByText('实时测量中')).toBeTruthy();
    expect(screen.getByText('-- cm')).toBeTruthy();
    expect(screen.getByText('拖动实时预览，松手确认长度')).toBeTruthy();
  });

  test('按下未命中平面时提示并不前进', async () => {
    mockHitTest.mockResolvedValue(null);
    await renderLayer();

    fireEvent(screen.getByTestId('ar-measure-view'), 'planeDetected', { nativeEvent: {} });
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderGrant', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();
    expect(screen.getByText('没对准平面，再点一次')).toBeTruthy();
    // 仍在 ready 阶段
    expect(screen.getByText('按住鱼头，拖到鱼尾松手')).toBeTruthy();
  });

  test('会话失败 → onFallbackManual 带原因', async () => {
    const { onFallbackManual } = await renderLayer();
    fireEvent(screen.getByTestId('ar-measure-view'), 'sessionError', {
      nativeEvent: { reason: 'camera_unavailable' },
    });
    expect(onFallbackManual).toHaveBeenCalledWith('camera_unavailable');
  });

  test('用户改用普通量尺 → onFallbackManual 无原因', async () => {
    const { onFallbackManual } = await renderLayer();
    fireEvent.press(screen.getByText('改用普通量尺'));
    expect(onFallbackManual).toHaveBeenCalledWith();
  });

  test('右上角关闭 → onClose', async () => {
    const { onClose } = await renderLayer();
    fireEvent.press(screen.getByLabelText('关闭 AR 量尺'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
