/**
 * 钓点获取时机（V2：定位不在拍照取景过程获取）：
 * 1) 取景页（IdentifyScreen）进入后不发起任何定位权限请求，也不出现钓点角标/定位弹层；
 * 2) 识别成功后选择地点（ResultLocationSheet）时才申请定位权限并自动定位填入，
 *    拒绝后仍可搜索/手选，不阻断保存。
 */
import React from 'react';
import { PermissionsAndroid, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// 权限检查走 Android 分支（jest 默认 iOS 会直接 unavailable）
(Platform as { OS: string }).OS = 'android';

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/components/FishScanFrame', () => ({ FishScanFrame: () => null }));
jest.mock('../src/components/FirstUseCameraGuide', () => ({ FirstUseCameraGuide: () => null }));
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
    extractFishContour: async () => null,
    warmup: async () => true,
    attachFeedbackAndSubmit: async () => true,
  },
}));
// vision-camera mock：canRequestPermission 经外部对象在渲染（hook 调用）时读取
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

// 定位服务 mock：工厂内定义（jest.mock 提升后外部变量尚未初始化），经导入句柄控制
jest.mock('../src/services/locationService', () => ({
  locationService: {
    getPermissionStatus: jest.fn(async () => 'denied' as const),
    requestPermission: jest.fn(async () => 'denied' as const),
    resolveCurrentLocation: jest.fn(async () => null),
    getRecentPlaces: jest.fn(async () => []),
    pushRecentPlace: jest.fn(async () => undefined),
    searchPlaces: jest.fn(async () => []),
  },
  precisionRequiresLocation: (v: string) => v !== 'none',
}));

import { ResultLocationSheet } from '../src/components/result/ResultKit';
import { locationService } from '../src/services/locationService';
import { RecognitionProvider } from '../src/contexts/RecognitionContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { IdentifyScreen } from '../src/screens/IdentifyScreen';
import { RootStackParamList } from '../src/navigation/types';
import { CatchLocation } from '../src/types/models';

const mockLocation = locationService as jest.Mocked<typeof locationService>;

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

const SAMPLE_LOC: CatchLocation = {
  latitude: 30.2469,
  longitude: 120.1456,
  label: '浙江省杭州市西湖区杨公堤',
  precision: 'precise',
};

const renderSheet = (currentLabel: string | null) => {
  const onCommit = jest.fn();
  const onClose = jest.fn();
  const onClear = jest.fn();
  render(
    <SafeAreaProvider>
      <ResultLocationSheet
        visible
        currentLabel={currentLabel}
        onCommit={onCommit}
        onClose={onClose}
        onClear={onClear}
      />
    </SafeAreaProvider>,
  );
  return { onCommit, onClose, onClear };
};

describe('取景页：拍照识别过程不获取地址', () => {
  const checkSpy = jest.spyOn(PermissionsAndroid, 'check');
  const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

  beforeEach(() => {
    jest.clearAllMocks();
    checkSpy.mockResolvedValue(false);
    mockVisionCamera.canRequestPermission = false;
  });

  test('进入取景页不申请定位权限，也不出现钓点角标 / 定位弹层', async () => {
    render(<TestApp />);

    // 取景 UI 就绪（mock 环境无相机设备 → 功能状态行显示「相机启动中…」）
    expect(await screen.findByText('相机启动中…')).toBeTruthy();
    // 引导文案已去掉：取景框下不再有「拍下整条鱼」等教学文案
    expect(screen.queryByText('拍下整条鱼')).toBeNull();

    await waitFor(() => {
      expect(requestSpy).not.toHaveBeenCalled();
    });
    expect(mockLocation.getPermissionStatus).not.toHaveBeenCalled();
    expect(mockLocation.resolveCurrentLocation).not.toHaveBeenCalled();
    expect(screen.queryByText('未开启定位 · 点击开启')).toBeNull();
    expect(screen.queryByText('未定位 · 点击选择钓点')).toBeNull();
    expect(screen.queryByText('使用定位')).toBeNull();
  });

  test('相机权限引导照常工作（首次先出自有说明 Sheet），与定位无关', async () => {
    mockVisionCamera.canRequestPermission = true;
    render(<TestApp />);
    expect(await screen.findByText('使用相机')).toBeTruthy();
    expect(screen.queryByText('使用定位')).toBeNull();
    fireEvent.press(await screen.findByText('先不用'));
    await waitFor(() => {
      expect(screen.queryByText('使用相机')).toBeNull();
    });
    // 相机引导结束后也不会补弹任何定位引导
    expect(mockLocation.getPermissionStatus).not.toHaveBeenCalled();
  });
});

describe('结果页：选择地点时才申请定位并自动填入', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.getRecentPlaces.mockResolvedValue([]);
  });

  test('打开地点 Sheet 且尚无地点 → 申请权限并自动定位，成功后回填关闭', async () => {
    mockLocation.getPermissionStatus.mockResolvedValue('denied');
    mockLocation.requestPermission.mockResolvedValue('granted');
    mockLocation.resolveCurrentLocation.mockResolvedValue(SAMPLE_LOC);

    const { onCommit, onClose } = renderSheet(null);

    // 打开即自动走「使用当前位置」：此刻才申请定位权限
    await waitFor(() => {
      expect(mockLocation.requestPermission).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(SAMPLE_LOC);
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('权限被拒绝 → 提示可继续搜索，不回填不关闭', async () => {
    mockLocation.getPermissionStatus.mockResolvedValue('denied');
    mockLocation.requestPermission.mockResolvedValue('denied');

    const { onCommit, onClose } = renderSheet(null);

    expect(await screen.findByText('未授权定位，可以继续搜索地点')).toBeTruthy();
    expect(mockLocation.resolveCurrentLocation).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('已有地点时打开 Sheet → 不自动申请定位（避免重复弹权限）', async () => {
    mockLocation.getPermissionStatus.mockResolvedValue('granted');

    renderSheet('千岛湖中心湖区');

    await waitFor(() => {
      expect(screen.getByText('鱼获地点')).toBeTruthy();
    });
    // 稍等一个宏任务窗口，确认没有自动定位被触发
    await new Promise((r) => setTimeout(r, 50));
    expect(mockLocation.requestPermission).not.toHaveBeenCalled();
    expect(mockLocation.resolveCurrentLocation).not.toHaveBeenCalled();
  });

  test('仍可手动点「使用当前位置」再次定位', async () => {
    mockLocation.getPermissionStatus.mockResolvedValue('granted');
    mockLocation.resolveCurrentLocation.mockResolvedValue(SAMPLE_LOC);

    const { onCommit, onClose } = renderSheet('千岛湖中心湖区');

    fireEvent.press(await screen.findByLabelText('使用当前位置'));
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(SAMPLE_LOC);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
