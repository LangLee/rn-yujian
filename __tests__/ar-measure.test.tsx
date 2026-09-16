/**
 * AR 自动量尺层测试：平面检测 → 点鱼头 → 点鱼尾 → 自动长度 → 确认上抛；
 * 以及会话失败回落手动量尺。
 * 原生视图与 hitTest 均 mock（requireNativeComponent 已在 setup 兜底为 View）。
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockHitTest = jest.fn();
jest.mock('../src/native/arMeasure', () => ({
  arMeasure: {
    available: true,
    probeSupport: async () => 'supported',
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

const renderLayer = async (props?: Partial<Parameters<typeof ARMeasureLayer>[0]>) => {
  const onMeasured = jest.fn();
  const onFallbackManual = jest.fn();
  const onClose = jest.fn();
  render(
    <ThemeProvider>
      <ARMeasureLayer
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

  test('扫平面 → 点鱼头 → 点鱼尾 → 显示 AR 实测长度并上抛', async () => {
    // 第一点 (0,0,0) 米；第二点 (0.3,0,0) 米 → 30 cm
    mockHitTest
      .mockResolvedValueOnce({ x: 0, y: 0, z: 0, plane: true })
      .mockResolvedValueOnce({ x: 0.3, y: 0, z: 0, plane: true });

    const { onMeasured } = await renderLayer();

    // 初始：扫描平面
    expect(screen.getByText('AR 量尺')).toBeTruthy();
    expect(screen.getByText(/正在扫描平面/)).toBeTruthy();

    // 平面就绪
    fireEvent(screen.getByTestId('ar-measure-view'), 'planeDetected', { nativeEvent: {} });
    expect(screen.getByText('点击鱼头，再点击鱼尾')).toBeTruthy();

    // 点鱼头
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderRelease', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();
    expect(mockHitTest).toHaveBeenCalledWith(100, 400);
    expect(screen.getByText('拖动预览长度，点击鱼尾确认')).toBeTruthy();

    // 点鱼尾 → 30.0 cm
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderRelease', {
      nativeEvent: { pageX: 300, pageY: 400 },
    });
    await flush();
    expect(screen.getAllByText('30.0 cm').length).toBeGreaterThanOrEqual(1);

    // 确认使用 → 上抛 AR 实测长度
    fireEvent.press(screen.getByText('用 30.0 cm'));
    expect(onMeasured).toHaveBeenCalledTimes(1);
    const reported = onMeasured.mock.calls[0][0];
    expect(reported).toBeCloseTo(30, 5);
  });

  test('点击未命中平面时提示并不前进', async () => {
    mockHitTest.mockResolvedValue(null);
    await renderLayer();

    fireEvent(screen.getByTestId('ar-measure-view'), 'planeDetected', { nativeEvent: {} });
    fireEvent(screen.getByTestId('ar-touch-layer'), 'responderRelease', {
      nativeEvent: { pageX: 100, pageY: 400 },
    });
    await flush();
    expect(screen.getByText('没对准平面，再点一次')).toBeTruthy();
    // 仍在 ready 阶段
    expect(screen.getByText('点击鱼头，再点击鱼尾')).toBeTruthy();
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
});
