/**
 * 识别结果页 长度/重量输入交互（V1.1）：
 * 行内点按弹数值输入 Sheet、输入框内固定单位、提交后行内展示值+单位、
 * 非法非空值 Sheet 内提示并禁用完成、清除与输入净化。
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  ResultFieldRows,
  ResultMeasureSheet,
  isValidMeasureText,
} from '../src/components/result/ResultKit';

jest.mock('../src/utils/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    confirm: jest.fn(),
    critical: jest.fn(),
    cancel: jest.fn(),
  },
  hapticForLevel: jest.fn(),
}));

describe('isValidMeasureText 校验规则', () => {
  it('长度 0.1-999.9、最多 1 位小数', () => {
    expect(isValidMeasureText('length', '35.5')).toBe(true);
    expect(isValidMeasureText('length', '0')).toBe(false);
    expect(isValidMeasureText('length', '1000')).toBe(false);
    expect(isValidMeasureText('length', '1.25')).toBe(false);
  });

  it('重量 0.01-999.99、最多 2 位小数', () => {
    expect(isValidMeasureText('weight', '1.25')).toBe(true);
    expect(isValidMeasureText('weight', '0')).toBe(false);
    expect(isValidMeasureText('weight', '0.001')).toBe(false);
    expect(isValidMeasureText('weight', '1000')).toBe(false);
  });
});

describe('ResultFieldRows 行内展示', () => {
  const onEditLength = jest.fn();
  const onEditWeight = jest.fn();

  const rows = (lengthText: string, weightText: string) => (
    <SafeAreaProvider>
      <ResultFieldRows
        lengthText={lengthText}
        weightText={weightText}
        locationLabel={null}
        onEditLength={onEditLength}
        onEditWeight={onEditWeight}
        onEditLocation={jest.fn()}
      />
    </SafeAreaProvider>
  );

  it('有值时展示 值+单位（cm / kg），点按整行触达编辑', () => {
    render(rows('35.5', '1.25'));
    expect(screen.getByText(/35\.5\s*cm/)).toBeTruthy();
    expect(screen.getByText(/1\.25\s*kg/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('长度字段，点按输入长度'));
    expect(onEditLength).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('重量字段，点按输入重量'));
    expect(onEditWeight).toHaveBeenCalledTimes(1);
  });

  it('空值时展示占位「请输入」（长度/重量 + 无值地点行）', () => {
    render(rows('', ''));
    expect(screen.getAllByText('请输入')).toHaveLength(3);
  });
});

describe('ResultMeasureSheet 数值输入', () => {
  const renderSheet = (
    kind: 'length' | 'weight',
    value: string,
    onCommit = jest.fn(),
    onClose = jest.fn()
  ) =>
    render(
      <SafeAreaProvider>
        <ResultMeasureSheet
          visible
          kind={kind}
          value={value}
          onCommit={onCommit}
          onClose={onClose}
        />
      </SafeAreaProvider>
    );

  it('输入框内固定展示单位与范围提示', () => {
    renderSheet('length', '');
    expect(screen.getByText('cm')).toBeTruthy();
    expect(screen.getByText(/0\.1 – 999\.9 cm/)).toBeTruthy();
  });

  it('非法非空值：行内提示且完成不可点；合法值：完成回传并关闭', () => {
    const onCommit = jest.fn();
    const onClose = jest.fn();
    renderSheet('length', '', onCommit, onClose);
    const input = screen.getByLabelText('鱼获长度输入框，单位cm');

    fireEvent.changeText(input, '0');
    expect(screen.getByText(/请输入 0\.1 – 999\.9 之间/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '完成' })).toBeNull();

    fireEvent.changeText(input, '42.5');
    fireEvent.press(screen.getByRole('button', { name: '完成' }));
    expect(onCommit).toHaveBeenCalledWith('42.5');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('decimal-pad 混入逗号/多小数点时净化为数字与首个小数点', () => {
    renderSheet('weight', '');
    const input = screen.getByLabelText('鱼获重量输入框，单位kg');
    fireEvent.changeText(input, '1,2.3.4');
    expect(input.props.value).toBe('12.34');
  });

  it('已有值时清除回传空串并关闭', () => {
    const onCommit = jest.fn();
    const onClose = jest.fn();
    renderSheet('weight', '1.25', onCommit, onClose);
    fireEvent.press(screen.getByRole('button', { name: '清除数值' }));
    expect(onCommit).toHaveBeenCalledWith('');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
