/**
 * 复现：拍照/选图后进入 Recognizing，recognizeAndRecord 报“没有可识别的照片”。
 * 用真实 IdentifyScreen / RecognizingScreen / RecognitionProvider + 真实 Stack 导航，
 * 仅 mock 原生识别服务与图片选择器。
 */
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { render, screen, act, fireEvent } from '@testing-library/react-native';

const mockNormalize = jest.fn();
const mockRecognize = jest.fn();
const mockRecord = jest.fn();

jest.mock('../src/services/recognitionService', () => ({
  recognitionService: {
    available: true,
    normalizeImage: (...args: unknown[]) => mockNormalize(...args),
    recognize: (...args: unknown[]) => mockRecognize(...args),
    record: (...args: unknown[]) => mockRecord(...args),
    attachFeedbackAndSubmit: async () => true,
    flushQueued: async () => 0,
    releaseImage: async () => undefined,
    warmup: async () => true,
  },
}));

let mockPickerCallback: ((response: unknown) => void) | null = null;
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: (_opts: unknown, cb: (r: unknown) => void) => {
    mockPickerCallback = cb;
  },
  launchCamera: (_opts: unknown, cb: (r: unknown) => void) => {
    mockPickerCallback = cb;
  },
}));

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/components/FishScanFrame', () => ({ FishScanFrame: () => null }));
jest.mock('../src/components/FishIllustration', () => ({ FishIllustration: () => null }));
// AIAmbientField 含大量动画 SVG 路径与粒子，jest 的 mock rAF 下会产生
// 大量重渲染拖垮流程测试；桩化为空组件（保留导出的阶段时序常量）
jest.mock('../src/components/coreui/AIAmbientField', () => ({
  AIAmbientField: () => null,
  AI_STATE_MIN_MS: { imageRecognizing: 900, fishLocated: 600, speciesRecognizing: 1250 },
}));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));


import { RecognitionProvider } from '../src/contexts/RecognitionContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { IdentifyScreen } from '../src/screens/IdentifyScreen';
import { RecognizingScreen } from '../src/screens/RecognizingScreen';
import { RootStackParamList } from '../src/navigation/types';

const Stack = createStackNavigator<RootStackParamList>();

const HomeStub: React.FC = () => <View testID="home-stub" />;

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <RecognitionProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Identify"
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="Home" component={HomeStub} />
              <Stack.Screen name="Identify" component={IdentifyScreen} />
              <Stack.Screen name="Recognizing" component={RecognizingScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </RecognitionProvider>
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('拍照识鱼流程', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickerCallback = null;
    mockNormalize.mockResolvedValue({
      imageId: 'yj_img_test_1',
      filePath: 'file:///data/tmp/yj_img_test_1.jpg',
      source: 'gallery',
      width: 1024,
      height: 768,
    });
    // recognize 永不 resolve，冻结在 Recognizing，便于断言它是否被调用
    mockRecognize.mockReturnValue(new Promise(() => undefined));
    mockRecord.mockResolvedValue({
      recordPath: '/tmp/rec.json',
      imagePath: '/tmp/img.jpg',
    });
  });

  test('选图后 Recognizing 应调用 recognize(imageId)，而不是退回并提示“没有可识别的照片”', async () => {
    render(<TestApp />);

    // 打开相册
    const galleryButton = await screen.findByLabelText('从相册选择照片');
    fireEvent.press(galleryButton);
    expect(mockPickerCallback).not.toBeNull();

    // 模拟相册返回一张照片
    await act(async () => {
      mockPickerCallback?.({ assets: [{ uri: 'content://media/fish.jpg' }] });
      // 放行微任务队列，让 handlePicked 的 await 完成
      await Promise.resolve();
      await Promise.resolve();
    });

    // 关键断言：Recognizing 挂载后 recognizeAndRecord 应拿到 image 并调用原生 recognize
    expect(mockRecognize).toHaveBeenCalledWith('yj_img_test_1');

    // 若 bug 复现，会退回 Identify 并显示错误文案
    expect(screen.queryByText('没有可识别的照片')).toBeNull();
  });

  test('识别失败退回 Identify 后，不应把真实错误覆盖成“没有可识别的照片”', async () => {
    // 原生 recognize 失败（如模型文件缺失），返回一个稍后才 reject 的 promise，
    // 让 Recognizing 有时间完成挂载
    let rejectRecognize!: (reason: Error) => void;
    mockRecognize.mockReturnValue(
      new Promise<never>((_resolve, reject) => {
        rejectRecognize = reject;
      }),
    );

    render(<TestApp />);

    const galleryButton = await screen.findByLabelText('从相册选择照片');
    fireEvent.press(galleryButton);
    await act(async () => {
      mockPickerCallback?.({ assets: [{ uri: 'content://media/fish.jpg' }] });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRecognize).toHaveBeenCalledTimes(1);

    // 原生识别失败 → Recognizing 退回 Identify 并带回真实原因
    await act(async () => {
      rejectRecognize(new Error('fish_detector_yolox_nano_v0_1.onnx 加载失败'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 等待返回转场 + IdentifyScreen 重挂载（其挂载时会 reset 清空识别上下文）
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    // 真实错误必须保留；bug 复现时这里会是 null，且出现“没有可识别的照片”
    expect(screen.queryByText(/fish_detector_yolox_nano_v0_1/)).not.toBeNull();
    expect(screen.queryByText('没有可识别的照片')).toBeNull();
    // recognize 不应被二次调用
    expect(mockRecognize).toHaveBeenCalledTimes(1);
  });
});
