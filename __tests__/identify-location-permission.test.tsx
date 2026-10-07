/**
 * 拍照识鱼页定位权限引导：
 * 要用定位（隐私设置非「不记录位置」）但权限未开启时，
 * 进入取景页自动弹应用内说明 Sheet；永久拒绝时 Alert 引导去系统设置；
 * 角标文案区分「未开启定位 · 点击开启」。
 */
import React from 'react';
import { Alert, Linking, PermissionsAndroid, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// 权限检查走 Android 分支（jest 默认 iOS 会直接 unavailable，不触发引导）
(Platform as { OS: string }).OS = 'android';

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/components/FishScanFrame', () => ({ FishScanFrame: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));
jest.mock('../src/services/recognitionService', () => ({
  recognitionService: {
    available: true,
    normalizeImage: jest.fn(),
    recognize: jest.fn(),
    record: jest.fn(),
    attachFeedbackAndSubmit: async () => true,
  },
}));

// 覆盖全局 vision-camera mock：canRequestPermission 可控，用于验证相机引导与定位引导的排队关系
const mockVisionCamera = { canRequestPermission: false };
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraDevices: () => [],
  useCameraFormat: () => undefined,
  useCameraPermission: () => ({
    hasPermission: false,
    canRequestPermission: mockVisionCamera.canRequestPermission,
    requestPermission: async () => false,
  }),
  usePhotoOutput: () => ({
    capturePhotoToFile: async () => ({ filePath: '/tmp/photo.jpg' }),
  }),
}));

import { RecognitionProvider } from '../src/contexts/RecognitionContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { IdentifyScreen } from '../src/screens/IdentifyScreen';
import { RootStackParamList } from '../src/navigation/types';

const Stack = createStackNavigator<RootStackParamList>();
const HomeStub: React.FC = () => <View testID="home-stub" />;

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <RecognitionProvider>
          <NavigationContainer>
            <Stack.Navigator initialRouteName="Identify" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Home" component={HomeStub} />
              <Stack.Screen name="Identify" component={IdentifyScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </RecognitionProvider>
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('拍照识鱼：要用定位但权限未开启的引导', () => {
  const checkSpy = jest.spyOn(PermissionsAndroid, 'check');
  const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

  beforeEach(() => {
    jest.clearAllMocks();
    checkSpy.mockResolvedValue(false);
    mockVisionCamera.canRequestPermission = false;
  });

  test('进入取景页自动弹「使用定位」说明，角标显示「未开启定位 · 点击开启」', async () => {
    render(<TestApp />);

    expect(await screen.findByText('使用定位')).toBeTruthy();
    expect(await screen.findByText('未开启定位 · 点击开启')).toBeTruthy();
    expect(screen.getByLabelText('开启定位权限')).toBeTruthy();
  });

  test('首次进页面先弹相机说明，关闭后才弹「使用定位」，不再两层权限弹层叠加', async () => {
    mockVisionCamera.canRequestPermission = true;

    render(<TestApp />);

    expect(await screen.findByText('使用相机')).toBeTruthy();
    // 相机引导进行中：定位说明不叠加弹出
    expect(screen.queryByText('使用定位')).toBeNull();

    fireEvent.press(await screen.findByText('先不用'));

    expect(await screen.findByText('使用定位')).toBeTruthy();
  });

  test('说明 Sheet「开启定位」授权成功 → Sheet 关闭，角标回到待选点状态', async () => {
    requestSpy.mockImplementation(async () => {
      // 系统弹窗授权成功后，静默 check 也应返回 true
      checkSpy.mockResolvedValue(true);
      return 'granted' as never;
    });

    render(<TestApp />);
    fireEvent.press(await screen.findByText('开启定位'));

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('使用定位')).toBeNull();
    });
    // 原生定位模块缺失（jest）→ 静默降级为「未定位 · 点击选择钓点」
    expect(await screen.findByText('未定位 · 点击选择钓点')).toBeTruthy();
  });

  test('永久拒绝（never_ask_again）→ Alert 引导「去系统设置」', async () => {
    requestSpy.mockResolvedValue('never_ask_again' as never);

    render(<TestApp />);
    fireEvent.press(await screen.findByText('开启定位'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        '开启定位权限',
        expect.stringContaining('系统设置'),
        expect.arrayContaining([expect.objectContaining({ text: '去系统设置' })]),
      );
    });
  });

  test('连点「开启定位」只发一次系统权限申请（共享进行中的申请）', async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    requestSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }) as never,
    );

    render(<TestApp />);
    const cta = await screen.findByText('开启定位');
    fireEvent.press(cta);
    fireEvent.press(cta);

    // 服务层共享进行中的申请：连点两次只发一次系统权限请求
    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });
    resolveRequest?.('denied');
    await waitFor(() => {
      expect(screen.queryByText('使用定位')).toBeNull();
    });
  });

  test('已授权时不弹说明 Sheet，直接静默定位', async () => {
    checkSpy.mockResolvedValue(true);

    render(<TestApp />);

    await waitFor(() => {
      expect(screen.getByText('未定位 · 点击选择钓点')).toBeTruthy();
    });
    expect(screen.queryByText('使用定位')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
