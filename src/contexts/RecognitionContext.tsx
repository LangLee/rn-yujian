import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { recognitionService } from '../services/recognitionService';
import {
  FeedbackDraft,
  InferenceAssetMeta,
  ProductionRecognitionResultDTO,
  SelectedImageMeta,
} from '../types/models';

/**
 * 识别流程编排（对应原 YujianApp.kt 中的 sessionImage / productionResult /
 * inferenceAsset 状态与 recognize→record→attachFeedback 流程）。
 */
interface RecognitionContextType {
  available: boolean;
  image: SelectedImageMeta | null;
  result: ProductionRecognitionResultDTO | null;
  asset: InferenceAssetMeta | null;
  selectImage: (meta: SelectedImageMeta) => void;
  reset: () => void;
  /** recognize + record：返回完整推理结果并持久化 INFERENCE_RECORD_V2。 */
  recognizeAndRecord: () => Promise<ProductionRecognitionResultDTO>;
  /** 用户确认/纠正后提交反馈（上传或进入离线队列）。 */
  submitFeedback: (feedback: FeedbackDraft) => Promise<boolean>;
}

const RecognitionContext = createContext<RecognitionContextType | undefined>(undefined);

interface RecognitionProviderProps {
  children: ReactNode;
}

export const RecognitionProvider: React.FC<RecognitionProviderProps> = ({ children }) => {
  const [image, setImage] = useState<SelectedImageMeta | null>(null);
  const [result, setResult] = useState<ProductionRecognitionResultDTO | null>(null);
  const [asset, setAsset] = useState<InferenceAssetMeta | null>(null);

  const selectImage = useCallback((meta: SelectedImageMeta) => {
    setImage(meta);
    setResult(null);
    setAsset(null);
  }, []);

  const reset = useCallback(() => {
    setImage(null);
    setResult(null);
    setAsset(null);
  }, []);

  const recognizeAndRecord = useCallback(async (): Promise<ProductionRecognitionResultDTO> => {
    if (!image) {
      throw new Error('没有可识别的照片');
    }
    const recognition = await recognitionService.recognize(image.imageId);
    setResult(recognition);
    try {
      const recorded = await recognitionService.record(image.imageId);
      setAsset(recorded);
    } catch {
      // 记录失败不阻断识别流程展示，但保留空 asset 以便反馈阶段降级。
      setAsset(null);
    }
    return recognition;
  }, [image]);

  const submitFeedback = useCallback(
    async (feedback: FeedbackDraft): Promise<boolean> => {
      if (!image || !asset) {
        return false;
      }
      return recognitionService.attachFeedbackAndSubmit(image.imageId, feedback);
    },
    [image, asset],
  );

  const value = useMemo<RecognitionContextType>(
    () => ({
      available: recognitionService.available,
      image,
      result,
      asset,
      selectImage,
      reset,
      recognizeAndRecord,
      submitFeedback,
    }),
    [image, result, asset, selectImage, reset, recognizeAndRecord, submitFeedback],
  );

  return <RecognitionContext.Provider value={value}>{children}</RecognitionContext.Provider>;
};

export const useRecognition = (): RecognitionContextType => {
  const context = useContext(RecognitionContext);
  if (context === undefined) {
    throw new Error('useRecognition must be used within a RecognitionProvider');
  }
  return context;
};
