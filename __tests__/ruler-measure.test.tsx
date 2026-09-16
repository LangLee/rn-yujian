/**
 * 量尺手势层测试：长按 → 拖拽 → 松手 → 校准 → 再量鱼。
 *
 * 背景：RNGH 的 activateAfterLongPress 在 Android 上等待期内漂移超过
 * 系统 touchSlop（约 8dp）即静默失败（真机长按无反应），已改为 RN
 * 原生 responder 自实现长按；本测试固定该行为——漂移 32dp 内仍算长按。
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));

import { RulerMeasureLayer } from '../src/components/RulerMeasureLayer';
import { ThemeProvider } from '../src/contexts/ThemeContext';

const renderLayer = async (onMeasuredChange: jest.Mock) => {
  render(
    <ThemeProvider>
      <RulerMeasureLayer onMeasuredChange={onMeasuredChange} toolbarBottom={120} />
    </ThemeProvider>,
  );
  // ThemeProvider 主题异步加载完成后才会挂载 children
  return screen.findByTestId('ruler-touch-layer');
};

const grant = (
  touch: React.ReactTestInstance,
  id: number,
  x: number,
  y: number,
) => {
  fireEvent(touch, 'responderGrant', {
    nativeEvent: { identifier: id, pageX: x, pageY: y, touches: [] },
  });
};

const move = (
  touch: React.ReactTestInstance,
  id: number,
  x: number,
  y: number,
) => {
  fireEvent(touch, 'responderMove', {
    nativeEvent: {
      identifier: id,
      pageX: x,
      pageY: y,
      touches: [{ identifier: id, pageX: x, pageY: y }],
    },
  });
};

const release = (
  touch: React.ReactTestInstance,
  id: number,
  x: number,
  y: number,
) => {
  fireEvent(touch, 'responderRelease', {
    nativeEvent: { identifier: id, pageX: x, pageY: y, touches: [] },
  });
};

describe('RulerMeasureLayer 长按拖拽测量', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('长按 280ms 后起线，拖拽松手得到测线；用银行卡校准后能量出真实长度', async () => {
    const onMeasuredChange = jest.fn();
    const touch = await renderLayer(onMeasuredChange);

    // 未长按成熟前的自然漂移（20dp < 32dp）不应取消长按：
    // 按下 → 漂移 → 到点起线（锚点取长按成熟时的手指位置）→ 拖到 320,300 → 松手
    grant(touch, 7, 100, 300);
    move(touch, 7, 120, 300);
    act(() => {
      jest.advanceTimersByTime(280);
    });
    expect(screen.getByText('待校准')).toBeTruthy();
    move(touch, 7, 320, 300);
    release(touch, 7, 320, 300);

    // 未校准：不应上报长度
    expect(onMeasuredChange).not.toHaveBeenCalled();

    // 校准：测线（200dp）= 银行卡 8.56cm → 比例尺 200/8.56 dp/cm
    fireEvent.press(screen.getByLabelText('校准比例尺'));
    fireEvent.press(screen.getByText('银行卡 / 身份证'));
    expect(onMeasuredChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('长按鱼头，拖到鱼尾')).toBeTruthy();

    // 量鱼：300dp → 300 / (200 / 8.56) = 12.84cm
    grant(touch, 9, 50, 400);
    act(() => {
      jest.advanceTimersByTime(280);
    });
    move(touch, 9, 350, 400);
    release(touch, 9, 350, 400);
    const calls = onMeasuredChange.mock.calls;
    const reported = calls[calls.length - 1][0];
    expect(reported).toBeCloseTo(12.84, 1);
    // 悬浮标签与底部工具条都会显示测量值
    expect(screen.getAllByText('12.8 cm').length).toBeGreaterThanOrEqual(1);
  });

  test('长按未成熟就大幅滑动（>32dp）视为滑动，不起线', async () => {
    const onMeasuredChange = jest.fn();
    const touch = await renderLayer(onMeasuredChange);

    grant(touch, 3, 100, 300);
    move(touch, 3, 180, 320);
    act(() => {
      jest.advanceTimersByTime(280);
    });
    release(touch, 3, 180, 320);

    // 起线被放弃：无测线标签、不上报
    expect(screen.queryByText('待校准')).toBeNull();
    expect(onMeasuredChange).not.toHaveBeenCalled();
  });

  test('未起线时点「校准」给出引导提示，不弹 Sheet', async () => {
    const onMeasuredChange = jest.fn();
    await renderLayer(onMeasuredChange);

    fireEvent.press(screen.getByLabelText('校准比例尺'));
    expect(screen.getByText('先长按量一条已知物体的线')).toBeTruthy();
    expect(screen.queryByText('这条线有多长？')).toBeNull();
  });
});
