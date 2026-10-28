/**
 * 首次拍照教学（FirstUseCameraGuide）单元测试。
 *
 * 覆盖：
 *  - 两页教学序列（P01 竖屏横鱼 / P02 竖拍竖鱼，横屏教学页已移除）；
 *  - 整页背景照片 cover 铺满（resizeMode=cover，页容器显式满屏高，
 *    背景不随内容高度截断）；
 *  - 操作行为：首页主操作「下一张」翻页、末页「开始拍摄」、跳过即结束，
 *    均不触发快门（onFinish 由调用方持久化）。
 */
import React from 'react';
import { Image, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FirstUseCameraGuide } from '../src/components/FirstUseCameraGuide';

describe('FirstUseCameraGuide 首次拍照教学', () => {
  const renderGuide = (onFinish = jest.fn()) => ({
    onFinish,
    ...render(<FirstUseCameraGuide visible onFinish={onFinish} />),
  });

  it('渲染两页教学：竖屏示意与竖拍鱼类示意（横屏教学页已移除）', () => {
    renderGuide();

    expect(screen.getByText('竖屏拍摄示意')).toBeTruthy();
    expect(screen.getByText('竖拍鱼类拍摄示意')).toBeTruthy();
    expect(screen.queryByText('横屏拍摄示意')).toBeNull();
    expect(screen.getAllByText('拍照识鱼')).toHaveLength(2);
  });

  it('两页背景 stretch 精确铺满整屏（图片刚好等于屏幕尺寸、完整显示）', () => {
    const { UNSAFE_root } = renderGuide();
    const images = UNSAFE_root.findAllByType(Image);
    // 整页背景照片：stretch 按屏幕宽高独立缩放（横鱼 P01 + 竖鱼 P02）
    const backgrounds = images.filter(
      (i) => i.props.accessibilityLabel === '拍摄示范背景',
    );
    expect(backgrounds).toHaveLength(2);
    backgrounds.forEach((img) => {
      expect(img.props.resizeMode).toBe('stretch');
      expect(img.props.resizeMethod).toBe('resize');
      const style = img.props.style;
      // 静态样式：锚定页容器左上角；动态样式：显式宽高 + style 内同写 stretch
      expect(style[0]).toMatchObject({ position: 'absolute', top: 0, left: 0 });
      const dynamic = style[style.length - 1];
      expect(dynamic.resizeMode).toBe('stretch');
      expect(dynamic.width).toBeGreaterThan(0);
      expect(dynamic.height).toBeGreaterThan(0);
    });
    // 错误示范卡 cover 满铺（冻结稿无留白）
    const errors = images.filter((i) =>
      String(i.props.accessibilityLabel ?? '').startsWith('错误示范：'),
    );
    expect(errors).toHaveLength(6);
    errors.forEach((img) => expect(img.props.resizeMode).toBe('cover'));
    // 页码点：两页各一枚
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('02')).toBeTruthy();
  });

  it('首页「下一张」翻到末页后主操作变为「开始拍摄」，完成时回调 onFinish', async () => {
    const onFinish = jest.fn();
    render(<FirstUseCameraGuide visible onFinish={onFinish} />);

    expect(screen.getByText('下一张')).toBeTruthy();
    expect(screen.queryByText('开始拍摄')).toBeNull();

    fireEvent.press(screen.getByLabelText('下一张'));
    await waitFor(() => expect(screen.getByLabelText('开始拍摄')).toBeTruthy());
    // 末页暴露「上一张」
    expect(screen.getByText('上一张')).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('开始拍摄'));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it('「跳过」直接结束教学并回调 onFinish（不触发快门）', async () => {
    const onFinish = jest.fn();
    render(<FirstUseCameraGuide visible onFinish={onFinish} />);

    fireEvent.press(screen.getByLabelText('跳过教学'));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });
});
