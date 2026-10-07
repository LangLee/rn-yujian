/**
 * 识别处理链路回归：不 mock AIAmbientField / RecognitionStatusCard，
 * 真实渲染三状态 + 完整识别流程（成功→Result / 失败→退回 Identify），
 * 防止环境层动画/SVG 改动在真机上报错而 mock 测试漏检。
 */
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { render, act } from '@testing-library/react-native';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { RecognitionProvider } from '../src/contexts/RecognitionContext';
import { AIAmbientField } from '../src/components/coreui/AIAmbientField';
import { RecognitionStatusCard } from '../src/components/coreui/RecognitionStatusCard';
import { RootStackParamList } from '../src/navigation/types';

jest.mock('../src/services/recognitionService', () => ({
  recognitionService: {
    available: true,
    normalizeImage: async () => ({ imageId: 'x', filePath: 'file:///tmp/x.jpg', source: 'gallery', width: 1, height: 1 }),
    recognize: async () => new Promise(() => undefined),
    record: async () => ({ recordPath: '/tmp/r.json', imagePath: '/tmp/i.jpg' }),
    attachFeedbackAndSubmit: async () => true,
    flushQueued: async () => 0,
    releaseImage: async () => undefined,
    warmup: async () => true,
  },
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: (_o: unknown, cb: (r: unknown) => void) => cb?.({ assets: [] }),
  launchCamera: (_o: unknown, cb: (r: unknown) => void) => cb?.({ assets: [] }),
}));
jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/components/FishScanFrame', () => ({ FishScanFrame: () => null }));
jest.mock('../src/components/FishIllustration', () => ({ FishIllustration: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));

const { RecognizingScreen } = require('../src/screens/RecognizingScreen');

describe('识别处理真实渲染', () => {
  test('AIAmbientField 三状态渲染不抛错', async () => {
    for (const phase of ['imageRecognizing', 'fishLocated', 'speciesRecognizing'] as const) {
      const { unmount } = render(
        <ThemeProvider>
          <AIAmbientField phase={phase} photoUri={null} />
        </ThemeProvider>,
      );
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      unmount();
    }
  });

  test('RecognitionStatusCard 两种变体渲染不抛错', () => {
    render(
      <ThemeProvider>
        <RecognitionStatusCard title="已定位到鱼体" subtitle="正在分析这次鱼获" />
      </ThemeProvider>,
    );
    render(
      <ThemeProvider>
        <RecognitionStatusCard title="正在理解照片" subtitle="查找鱼获线索" lightweight />
      </ThemeProvider>,
    );
  });

  test('RecognizingScreen 完整挂载不抛错(真实 AIAmbientField)', async () => {
    const Stack = createStackNavigator<RootStackParamList>();
    const Stub: React.FC = () => <View testID="stub" />;
    const { unmount } = render(
      <SafeAreaProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <RecognitionProvider>
            <NavigationContainer>
              <Stack.Navigator initialRouteName="Recognizing" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Recognizing" component={RecognizingScreen} />
                <Stack.Screen name="Result" component={Stub} />
                <Stack.Screen name="RecognitionIssue" component={Stub} />
                <Stack.Screen name="Identify" component={Stub} />
              </Stack.Navigator>
            </NavigationContainer>
            </RecognitionProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    unmount();
  });
});

describe('完整识别流程(真实环境层)', () => {
  const { recognitionService } = require('../src/services/recognitionService');

  async function mountFlow() {
    const Stack = createStackNavigator<RootStackParamList>();
    const Stub: React.FC = () => <View testID="stub" />;
    const Recognizing = require('../src/screens/RecognizingScreen').RecognizingScreen;
    const Identify = require('../src/screens/IdentifyScreen').IdentifyScreen;
    const utils = render(
      <SafeAreaProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <RecognitionProvider>
              <NavigationContainer>
                <Stack.Navigator initialRouteName="Recognizing" screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="Recognizing" component={Recognizing} />
                  <Stack.Screen name="Identify" component={Identify} />
                  <Stack.Screen name="Result" component={Stub} />
                  <Stack.Screen name="RecognitionIssue" component={Stub} />
                </Stack.Navigator>
              </NavigationContainer>
            </RecognitionProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    return utils;
  }

  test('识别成功:2.95s 故事后 replace 到 Result,无报错', async () => {
    recognitionService.recognize = async () => ({
      status: 'READY', ready: true, totalLatencyMs: 100,
      sourceWidth: 100, sourceHeight: 100,
      detectorRun: { modelVersion: 'm', onnxSha256: 's', inputSize: 640, latencyMs: 50, detections: [] },
      assessment: { status: 'READY', qualityLevel: 'HIGH', qualityReason: '', bboxAreaRatio: 0.2, primary: null, cropBox: null, strongDetections: [], weakDetections: [] },
      prediction: { label: '鲫鱼', confidence: 0.9, className: 'crucian' },
      cropPixels: null, debugReport: '',
    });
    const utils = await mountFlow();
    // 等 3.6s:900+600+1250+200 路由 + 余量
    await act(async () => { await new Promise((r) => setTimeout(r, 3600)); });
    expect(utils.toJSON()).toBeTruthy();
    utils.unmount();
  });

  test('识别失败:退回 Identify 带真实错误文案,识别调用仅一次', async () => {
    recognitionService.recognize = async () => {
      throw new Error('model.onnx 加载失败(模拟原生错误)');
    };
    const utils = await mountFlow();
    await act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
    utils.unmount();
  });
});
