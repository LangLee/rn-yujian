/**
 * recognitionService 错误翻译：原生缺模型资产时 reject 的 message 只有裸文件名，
 * 需要翻译成用户可行动的“AI 模型未打包”提示。
 */
import { NativeModules } from 'react-native';

const mockRecognizeNative = jest.fn();
const mockWarmupNative = jest.fn();

// 服务模块在加载时读取 NativeModules.YujianRecognition 引用，先 stub 再 require
(NativeModules as { YujianRecognition?: unknown }).YujianRecognition = {
  normalizeImage: jest.fn(),
  recognize: mockRecognizeNative,
  record: jest.fn(),
  attachFeedbackAndSubmit: jest.fn(),
  flushQueued: jest.fn(),
  releaseImage: jest.fn(),
  warmup: mockWarmupNative,
  close: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recognitionService } = require('../src/services/recognitionService');

describe('recognitionService 资产缺失错误翻译', () => {
  test('recognize 抛裸模型文件名时，翻译为可行动提示', async () => {
    mockRecognizeNative.mockRejectedValueOnce(
      new Error('fish_detector_yolox_nano_v0_1.onnx'),
    );
    await expect(recognitionService.recognize('yj_img_x')).rejects.toThrow(
      /AI 模型未打包进 App（缺少 fish_detector_yolox_nano_v0_1\.onnx）/u,
    );
  });

  test('warmup 抛 classifier 文件名时同样翻译', async () => {
    mockWarmupNative.mockRejectedValueOnce(new Error('fish_classifier.tflite'));
    await expect(recognitionService.warmup()).rejects.toThrow(
      /AI 模型未打包进 App（缺少 fish_classifier\.tflite）/u,
    );
  });

  test('其他原生错误原样透传', async () => {
    mockRecognizeNative.mockRejectedValueOnce(new Error('图片不存在或已释放：yj_img_x'));
    await expect(recognitionService.recognize('yj_img_x')).rejects.toThrow(
      '图片不存在或已释放：yj_img_x',
    );
  });
});
