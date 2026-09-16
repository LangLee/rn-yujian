/**
 * 隐私与定位设置页：定位权限卡状态与授权引导流程。
 * 用真实 PrivacySettingsScreen + Providers，仅 mock 导航 / 权限桥 / 弹窗。
 */
import React from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react-native';

// 权限检查走 Android 分支（jest 默认 iOS 会直接 unavailable）
(Platform as { OS: string }).OS = 'android';

const openSettingsSpy = jest
  .spyOn(Linking, 'openSettings')
  .mockResolvedValue(undefined as never);

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
    // 焦点回调立即执行一次，覆盖「进入页面刷新权限」路径
    useFocusEffect: (callback: () => void) => {
      callback();
      return () => undefined;
    },
  };
});

jest.mock('../src/components/ScreenHeader', () => ({ ScreenHeader: () => null }));

import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { PrivacySettingsScreen } from '../src/screens/settings/PrivacySettingsScreen';

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <PrivacySettingsScreen />
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('隐私与定位：定位权限卡', () => {
  const checkSpy = jest.spyOn(PermissionsAndroid, 'check');
  const requestMultipleSpy = jest.spyOn(PermissionsAndroid, 'requestMultiple');
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    checkSpy.mockResolvedValue(false);
  });

  test('权限已授予 → 卡片显示「已允许」', async () => {
    checkSpy.mockResolvedValue(true);
    render(<TestApp />);
    expect(await screen.findByText('已允许')).toBeTruthy();
    expect(checkSpy).toHaveBeenCalledWith(
      'android.permission.ACCESS_FINE_LOCATION',
    );
  });

  test('权限未授予 → 显示「未允许」，点击拉起应用内说明 Sheet', async () => {
    checkSpy.mockResolvedValue(false);
    render(<TestApp />);
    expect(await screen.findByText('未允许')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('定位权限'));
    expect(await screen.findByText('使用定位')).toBeTruthy();
  });

  test('说明 Sheet「继续」→ 系统弹窗授权成功 → 卡片翻转为「已允许」', async () => {
    checkSpy.mockResolvedValue(false);
    requestMultipleSpy.mockImplementation(async () => {
      // 系统弹窗授权成功后，静默 check 也应返回 true
      checkSpy.mockResolvedValue(true);
      return {
        'android.permission.ACCESS_FINE_LOCATION': 'granted',
        'android.permission.ACCESS_COARSE_LOCATION': 'granted',
      } as never;
    });

    render(<TestApp />);
    await screen.findByText('未允许');
    fireEvent.press(screen.getByLabelText('定位权限'));
    fireEvent.press(await screen.findByText('继续'));

    await waitFor(() => {
      expect(requestMultipleSpy).toHaveBeenCalledTimes(1);
      expect(requestMultipleSpy).toHaveBeenCalledWith([
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
      ]);
    });
    expect(await screen.findByText('已允许')).toBeTruthy();
  });

  test('永久拒绝（never_ask_again）→ 引导去系统设置，不再弹系统权限框', async () => {
    checkSpy.mockResolvedValue(false);
    requestMultipleSpy.mockResolvedValue({
      'android.permission.ACCESS_FINE_LOCATION': 'never_ask_again',
      'android.permission.ACCESS_COARSE_LOCATION': 'never_ask_again',
    } as never);

    render(<TestApp />);
    await screen.findByText('未允许');
    fireEvent.press(screen.getByLabelText('定位权限'));
    fireEvent.press(await screen.findByText('继续'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        '需要定位权限',
        expect.stringContaining('系统设置'),
        expect.arrayContaining([expect.objectContaining({ text: '去系统设置' })]),
      );
    });
  });

  test('已授权时点击卡片直接跳系统设置（不出现说明 Sheet）', async () => {
    checkSpy.mockResolvedValue(true);
    render(<TestApp />);
    await screen.findByText('已允许');

    fireEvent.press(screen.getByLabelText('定位权限'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(openSettingsSpy).toHaveBeenCalled();
    expect(screen.queryByText('使用定位')).toBeNull();
    expect(screen.getByText('已允许')).toBeTruthy();
  });
});
