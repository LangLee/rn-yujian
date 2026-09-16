/**
 * 量尺测长链路测试：
 * 拍照页量得的长度随 SelectedImageMeta.measuredLengthCm 进入识别流程，
 * 识别结果页（P04）应自动填入长度输入框并给出提示，用户修改后提示退场。
 */
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ProductionRecognitionResultDTO, SelectedImageMeta } from '../src/types/models';

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));
jest.mock('../src/services/catchService', () => ({
  catchService: { uploadImage: jest.fn(), saveCatch: jest.fn() },
}));
jest.mock('../src/services/fishKnowledgeService', () => ({
  fishKnowledgeService: { listSpecies: async () => [], resolveAssetUrl: () => null },
  localGuideItems: () => [],
  mergeGuideItems: (items: unknown[]) => items,
}));

const mockImage: SelectedImageMeta = {
  imageId: 'yj_img_ruler_1',
  filePath: 'file:///tmp/fish.jpg',
  source: 'camera',
  width: 1080,
  height: 1440,
  measuredLengthCm: 32.56,
};

const mockResult: ProductionRecognitionResultDTO = {
  status: 'ready',
  ready: true,
  totalLatencyMs: 120,
  sourceWidth: 1080,
  sourceHeight: 1440,
  detectorRun: {
    modelVersion: 'det_v1',
    onnxSha256: '',
    inputSize: 416,
    latencyMs: 50,
    detections: [],
  },
  assessment: {
    status: 'ready',
    qualityLevel: 'ok',
    qualityReason: '',
    bboxAreaRatio: 0.3,
    primary: null,
    cropBox: null,
    strongDetections: [],
    weakDetections: [],
  },
  prediction: {
    modelVersion: 'cls_v1',
    modelSha256: '',
    latencyMs: 60,
    top1: {
      classIndex: 0,
      speciesKey: 'grass_carp',
      speciesName: '草鱼',
      confidence: 0.94,
    },
    candidates: [
      {
        classIndex: 0,
        speciesKey: 'grass_carp',
        speciesName: '草鱼',
        confidence: 0.94,
      },
    ],
    lowConfidence: false,
  },
  cropPixels: null,
  debugReport: '',
};

let mockImageState: SelectedImageMeta | null = mockImage;
jest.mock('../src/contexts/RecognitionContext', () => ({
  useRecognition: () => ({
    image: mockImageState,
    result: mockResult,
    asset: null,
    selectImage: jest.fn(),
    reset: jest.fn(),
    recognizeAndRecord: jest.fn(),
    submitFeedback: jest.fn(),
  }),
}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null, logout: jest.fn() }),
  isUnauthorizedError: () => false,
}));
jest.mock('../src/contexts/CatchContext', () => ({
  useCatchArchive: () => ({ reload: jest.fn() }),
}));

import { ThemeProvider } from '../src/contexts/ThemeContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { RecognitionResultScreen } from '../src/screens/RecognitionResultScreen';
import { RootStackParamList } from '../src/navigation/types';

const Stack = createStackNavigator<RootStackParamList>();
const IssueStub: React.FC = () => <View testID="issue-stub" />;

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Result" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Result" component={RecognitionResultScreen} />
            <Stack.Screen name="RecognitionIssue" component={IssueStub} />
          </Stack.Navigator>
        </NavigationContainer>
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('量尺测长 → 识别结果自动填入', () => {
  beforeEach(() => {
    mockImageState = { ...mockImage };
  });

  test('measuredLengthCm 存在时，长度输入框自动填入（保留 1 位小数）并显示提示', async () => {
    render(<TestApp />);

    expect(await screen.findByText('草鱼')).toBeTruthy();
    // 32.56 → 四舍五入到 32.6
    expect(screen.getByDisplayValue('32.6')).toBeTruthy();
    expect(screen.getByText('已填入量尺测量结果 32.6 cm，可手动修改')).toBeTruthy();
  });

  test('用户手动改长度后，自动填入提示消失', async () => {
    render(<TestApp />);

    const input = await screen.findByDisplayValue('32.6');
    fireEvent.changeText(input, '40');
    expect(screen.getByDisplayValue('40')).toBeTruthy();
    expect(screen.queryByText('已填入量尺测量结果 32.6 cm，可手动修改')).toBeNull();
  });

  test('没有测量值时长度留空，不出现自动填入提示', async () => {
    mockImageState = { ...mockImage, measuredLengthCm: null };
    render(<TestApp />);

    expect(await screen.findByText('草鱼')).toBeTruthy();
    expect(screen.queryByText(/已填入量尺测量结果/)).toBeNull();
  });
});
