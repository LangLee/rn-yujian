import { NativeModules, Platform } from 'react-native';
import {
  FeedbackDraft,
  InferenceAssetMeta,
  ProductionRecognitionResultDTO,
  SelectedImageMeta,
} from '../types/models';

/** YujianRecognitionModule.kt 暴露的原生接口。 */
interface YujianRecognitionNative {
  normalizeImage(uri: string, source: string): Promise<SelectedImageMeta>;
  recognize(imageId: string): Promise<ProductionRecognitionResultDTO>;
  record(imageId: string): Promise<InferenceAssetMeta>;
  attachFeedbackAndSubmit(imageId: string, feedback: FeedbackDraft): Promise<boolean>;
  flushQueued(): Promise<number>;
  releaseImage(imageId: string): Promise<string>;
  warmup(): Promise<boolean>;
  close(): Promise<boolean>;
}

const nativeModule = NativeModules.YujianRecognition as YujianRecognitionNative | undefined;

export const isRecognitionAvailable = (): boolean =>
  Platform.OS === 'android' && !!nativeModule;

function requireModule(): YujianRecognitionNative {
  if (!nativeModule) {
    throw new Error(
      Platform.OS === 'android'
        ? '原生识别模块未注册，请重新构建 App'
        : '端侧识别目前仅在 Android 上可用',
    );
  }
  return nativeModule;
}

/** 原生 pipeline 首次推理时需要从 assets 读取的文件，缺任何一个都会加载失败。 */
const REQUIRED_ASSET_FILES = [
  'fish_detector_yolox_nano_v0_1.onnx',
  'detector_metadata.json',
  'recognition_pipeline_v1.json',
  'fish_classifier.tflite',
  'preprocess_contract_v1.json',
];

/** Android assets.open 缺文件时 reject 的 message 只有裸文件名，翻译成可行动的提示。 */
async function translateAssetError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = REQUIRED_ASSET_FILES.find((name) => message.includes(name));
    if (missing) {
      throw new Error(
        `AI 模型未打包进 App（缺少 ${missing}），请将模型文件放入 android/app/src/main/assets/ 后重新构建`,
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

/**
 * 端侧推理服务：所有 Bitmap 留在原生层，JS 只交换 JSON 契约与 file:// 预览路径。
 */
export const recognitionService = {
  available: isRecognitionAvailable(),

  async normalizeImage(uri: string, source: 'camera' | 'gallery' = 'gallery'): Promise<SelectedImageMeta> {
    return requireModule().normalizeImage(uri, source);
  },

  async recognize(imageId: string): Promise<ProductionRecognitionResultDTO> {
    return translateAssetError(() => requireModule().recognize(imageId));
  },

  async record(imageId: string): Promise<InferenceAssetMeta> {
    return requireModule().record(imageId);
  },

  async attachFeedbackAndSubmit(imageId: string, feedback: FeedbackDraft): Promise<boolean> {
    return requireModule().attachFeedbackAndSubmit(imageId, feedback);
  },

  async flushQueued(): Promise<number> {
    if (!nativeModule) {
      return 0;
    }
    return nativeModule.flushQueued();
  },

  async releaseImage(imageId: string): Promise<void> {
    if (!nativeModule) {
      return;
    }
    await nativeModule.releaseImage(imageId);
  },

  async warmup(): Promise<boolean> {
    if (!nativeModule) {
      return false;
    }
    return translateAssetError(() => nativeModule!.warmup());
  },
};
