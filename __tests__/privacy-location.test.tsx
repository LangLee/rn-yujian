/**
 * 数据与隐私（Data_Privacy_Home_Spec_V1 / Location_Privacy_Spec_V1）：
 * - 位置权限行按产品状态显示 使用期间 / 已拒绝 / 未授权；
 * - 点击只打开信息说明 Sheet（冻结文案 + 知道了），绝不发起系统权限申请；
 * - AI 模型改进状态来自服务端，变更必须经显式确认 Sheet（无乐观翻转）；
 * - Deferred 行展示「即将推出」。
 */
import React from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react-native';

// 权限检查走 Android 分支（jest 默认 iOS 会直接 unavailable）
(Platform as { OS: string }).OS = 'android';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
    // 焦点回调立即执行一次，覆盖「进入页面刷新权限」路径
    useFocusEffect: (callback: () => void) => {
      callback();
      return () => undefined;
    },
  };
});

jest.mock('../src/components/ScreenHeader', () => ({ ScreenHeader: () => null }));

const mockGetAi = jest.fn();
const mockSetAi = jest.fn();
jest.mock('../src/services/accountService', () => ({
  accountService: {
    getAiModelImprovement: (...args: unknown[]) => mockGetAi(...args),
    setAiModelImprovement: (...args: unknown[]) => mockSetAi(...args),
  },
  changePasswordErrorMessage: jest.fn(() => '修改密码失败，请重试'),
}));

import { ThemeProvider } from '../src/contexts/ThemeContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { DataPrivacyScreen } from '../src/screens/settings/DataPrivacyScreen';

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <DataPrivacyScreen />
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('数据与隐私：位置权限行', () => {
  const checkSpy = jest.spyOn(PermissionsAndroid, 'check');
  const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetAi.mockResolvedValue({ enabled: false, updatedAt: null, consentVersion: null });
    checkSpy.mockResolvedValue(false);
    requestSpy.mockResolvedValue('denied' as never);
    await AsyncStorage.clear();
  });

  test('权限已授予 → 显示「使用期间」', async () => {
    checkSpy.mockResolvedValue(true);
    render(<TestApp />);
    expect(await screen.findByText('使用期间')).toBeTruthy();
  });

  test('未授予且从未申请 → 显示「未授权」', async () => {
    render(<TestApp />);
    expect(await screen.findByText('未授权')).toBeTruthy();
  });

  test('未授予但曾申请过 → 显示「已拒绝」', async () => {
    await AsyncStorage.setItem('yj_perm_location_asked_v1', '1');
    render(<TestApp />);
    expect(await screen.findByText('已拒绝')).toBeTruthy();
  });

  test('点击行只打开信息说明，不发起系统权限申请', async () => {
    render(<TestApp />);
    await screen.findByText('未授权');

    fireEvent.press(screen.getByLabelText('位置权限'));
    expect(
      await screen.findByText(
        '只有当你主动选择“使用当前位置”时，渔见才会获取你的位置，用于为当前鱼获添加地点。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('拒绝不会影响拍照识鱼和保存鱼获。')).toBeTruthy();

    fireEvent.press(screen.getByText('知道了'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(requestSpy).not.toHaveBeenCalled();
  });
});

describe('数据与隐私：AI 模型改进', () => {
  const checkSpy = jest.spyOn(PermissionsAndroid, 'check');

  beforeEach(async () => {
    jest.clearAllMocks();
    checkSpy.mockResolvedValue(false);
    await AsyncStorage.clear();
  });

  test('服务端已开启 → 无障碍标签显示已开启', async () => {
    mockGetAi.mockResolvedValue({ enabled: true, updatedAt: null, consentVersion: null });
    render(<TestApp />);
    expect(await screen.findByLabelText('AI 模型改进，已开启')).toBeTruthy();
  });

  test('已关闭 → 点击行打开开启确认 Sheet（冻结文案），确认后调用 PUT 并翻转状态', async () => {
    mockGetAi.mockResolvedValue({ enabled: false, updatedAt: null, consentVersion: null });
    mockSetAi.mockResolvedValue({ enabled: true, updatedAt: null, consentVersion: null });
    render(<TestApp />);
    await screen.findByLabelText('AI 模型改进，已关闭');

    fireEvent.press(screen.getByLabelText('AI 模型改进，已关闭'));
    expect(screen.getByText('帮助改善鱼种识别')).toBeTruthy();
    expect(
      screen.getByText(
        '仅会使用照片中框选出的鱼体部分和你确认的鱼种，用于训练和改进鱼种识别模型。',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('允许用于模型改进'));
    await waitFor(() => {
      expect(mockSetAi).toHaveBeenCalledWith(true, 'settings');
    });
    expect(await screen.findByLabelText('AI 模型改进，已开启')).toBeTruthy();
  });

  test('已开启时点击 → 关闭确认 Sheet 明示不影响清单', async () => {
    mockGetAi.mockResolvedValue({ enabled: true, updatedAt: null, consentVersion: null });
    render(<TestApp />);
    await screen.findByLabelText('AI 模型改进，已开启');

    fireEvent.press(screen.getByLabelText('AI 模型改进，已开启'));
    expect(screen.getByText('关闭模型改进？')).toBeTruthy();
    expect(screen.getByText(/不影响：拍照识鱼、保存鱼获、修改识别结果/)).toBeTruthy();
    expect(screen.getByText('保持开启')).toBeTruthy();
  });

  test('确认失败 → 保留此前状态并提示', async () => {
    mockGetAi.mockResolvedValue({ enabled: false, updatedAt: null, consentVersion: null });
    mockSetAi.mockRejectedValue(new Error('network'));
    render(<TestApp />);
    await screen.findByLabelText('AI 模型改进，已关闭');

    fireEvent.press(screen.getByLabelText('AI 模型改进，已关闭'));
    fireEvent.press(screen.getByText('允许用于模型改进'));
    await waitFor(() => {
      expect(screen.getByText('隐私设置保存失败，请重试')).toBeTruthy();
    });
    // 服务端未确认：状态仍是已关闭
    expect(screen.getByLabelText('AI 模型改进，已关闭')).toBeTruthy();
  });
});

describe('数据与隐私：Deferred 行与法律入口', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetAi.mockResolvedValue({ enabled: false, updatedAt: null, consentVersion: null });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    await AsyncStorage.clear();
  });

  test('导出我的数据 / 注销账号显示「即将推出」', async () => {
    render(<TestApp />);
    const badges = await screen.findAllByText('即将推出');
    expect(badges.length).toBe(2);
  });

  test('查看《隐私政策》→ 法律文档壳（隐私政策）', async () => {
    render(<TestApp />);
    fireEvent.press(await screen.findByText('查看《隐私政策》'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'privacy' });
  });
});
