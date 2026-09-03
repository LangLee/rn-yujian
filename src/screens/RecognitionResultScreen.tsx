import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuth, isUnauthorizedError } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { useRecognition } from '../contexts/RecognitionContext';
import { catchService } from '../services/catchService';
import { demoSpecies } from '../constants/demoData';
import { TagChip, YujianTopBar } from '../components/Common';
import { DetectorOverlayImage, DetectorOverlayLegend } from '../components/DetectorOverlay';
import { palette } from '../constants/colors';
import {
  CatchSaveDraft,
  FeedbackDraft,
  FeedbackTypeWire,
  FishInputAssessmentDTO,
} from '../types/models';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';

type RecognitionResultScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Result'>;

/** 与 FishDetectionQualityGate.CROP_EXPAND_RATIO 一致。 */
const CROP_EXPAND_RATIO = 0.15;

/** Kotlin String.hashCode 的 JS 等价实现（自定义鱼种 key 生成规则与原 app 一致）。 */
const kotlinHashCode = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
  }
  return hash;
};

const generateSourceEventId = (): string =>
  `APP_${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

const qualityColor = (level: string): string => {
  switch (level) {
    case 'good':
      return palette.waterTeal;
    case 'warning':
      return palette.qualityWarning;
    default:
      return palette.qualityInvalid;
  }
};

const format3 = (value: number): string => value.toFixed(3);
const format2 = (value: number): string => value.toFixed(2);

interface CorrectionOption {
  key: string;
  name: string;
}

/**
 * 识别结果页（对应原 RecognitionResultScreen.kt）：overlay 大图、质量徽章、
 * Detector 元数据卡、Crop Preview、Top-3 候选、纠正鱼种、保存鱼获。
 */
export const RecognitionResultScreen: React.FC = () => {
  const navigation = useNavigation<RecognitionResultScreenNavigationProp>();
  const { session, logout } = useAuth();
  const { reload } = useCatchArchive();
  const { image, result, submitFeedback } = useRecognition();
  const prediction = result?.prediction ?? null;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState(prediction?.top1.speciesKey ?? '');
  const [selectedName, setSelectedName] = useState(prediction?.top1.speciesName ?? '');
  const [showCorrection, setShowCorrection] = useState(prediction?.lowConfidence ?? false);
  const [customName, setCustomName] = useState('');

  // 原行为：没有预测结果时回到识鱼页。
  useEffect(() => {
    if (!prediction) {
      navigation.navigate('Identify');
    }
  }, [prediction, navigation]);

  const assessment = result?.assessment ?? null;
  const qualityLevel = assessment?.qualityLevel ?? 'good';
  const debugReport = result?.debugReport ?? '';
  const corrected = prediction ? selectedName !== prediction.top1.speciesName : false;
  const confidence = prediction
    ? Math.min(100, Math.max(0, Math.round(prediction.top1.confidence * 100)))
    : 0;

  const guideFish = useMemo(
    () => demoSpecies.find((fish) => fish.key === selectedKey) ?? null,
    [selectedKey],
  );

  const correctionOptions = useMemo<CorrectionOption[]>(() => {
    if (!prediction) {
      return [];
    }
    const options: CorrectionOption[] = [
      ...prediction.candidates.map((candidate) => ({
        key: candidate.speciesKey,
        name: candidate.speciesName,
      })),
      ...demoSpecies.map((fish) => ({ key: fish.key, name: fish.name })),
    ];
    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.name)) {
        return false;
      }
      seen.add(option.name);
      return true;
    });
  }, [prediction]);

  if (!prediction) {
    return <View style={styles.screen} />;
  }

  const imageUri = toFileUri(image?.filePath);
  const cropPreviewUri = toFileUri(result?.cropPreviewPath);
  const modelInputUri = toFileUri(result?.modelInputPath);
  const cropPixels = result?.cropPixels;
  const cropSizeLabel =
    cropPixels && cropPixels.length >= 4
      ? `${cropPixels[2] - cropPixels[0]}×${cropPixels[3] - cropPixels[1]} px`
      : '未生成';

  const handleCopyDebug = () => {
    if (!debugReport) {
      return;
    }
    Clipboard.setString(debugReport);
    if (Platform.OS === 'android') {
      ToastAndroid.show('识别调试信息已复制', ToastAndroid.SHORT);
    } else {
      Alert.alert('', '识别调试信息已复制');
    }
  };

  const handleSave = async () => {
    if (!session || !image) {
      setSaveError('登录状态已失效，请重新登录');
      return;
    }
    const customUnknown = selectedKey.startsWith('user_');
    const feedbackType: FeedbackTypeWire = customUnknown
      ? 'new_species_candidate'
      : corrected
        ? 'corrected'
        : 'confirmed';
    const feedback: FeedbackDraft = {
      sourceEventId: generateSourceEventId(),
      imageId: image.imageId,
      feedbackType,
      modelVersion: prediction.modelVersion,
      predictedSpecies: prediction.top1.speciesName,
      confidence: prediction.top1.confidence,
      correctedSpecies: corrected || customUnknown ? selectedName : null,
      userNote: `model_sha256=${prediction.modelSha256};source=${image.source ?? 'unknown'}`,
    };
    const draft: CatchSaveDraft = {
      speciesId: selectedKey,
      speciesName: selectedName,
      confidence: prediction.top1.confidence,
      modelVersion: prediction.modelVersion,
      detectorResult:
        assessment && assessment.primary
          ? {
              detector_version: result?.detectorRun.modelVersion,
              confidence: assessment.primary.confidence,
              quality: assessment.qualityLevel.toUpperCase(),
              quality_reason: assessment.qualityReason,
            }
          : null,
      classifierResult: {
        model_version: prediction.modelVersion,
        prediction_species: prediction.top1.speciesKey,
        confidence: prediction.top1.confidence,
        user_selected_species: selectedKey,
      },
    };

    setSaving(true);
    setSaveError(null);
    try {
      const upload = await catchService.uploadImage(session.accessToken, image.filePath);
      await catchService.saveCatch(session.accessToken, upload, draft);
    } catch (e) {
      setSaving(false);
      if (isUnauthorizedError(e)) {
        await logout();
        return;
      }
      setSaveError(e instanceof Error ? e.message : '保存鱼获失败，请重试');
      return;
    }
    setSaving(false);
    reload();
    // 反馈提交失败不影响保存结果（与原 App 异步提交行为一致）。
    submitFeedback(feedback).catch(() => undefined);
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'My' } }] });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <YujianTopBar title="识别结果" onBack={() => navigation.goBack()} />

      <View style={{ paddingHorizontal: 20 }}>
        <View style={styles.heroCard}>
          {imageUri ? (
            <DetectorOverlayImage
              imagePath={imageUri}
              sourceWidth={result?.sourceWidth ?? 0}
              sourceHeight={result?.sourceHeight ?? 0}
              detectorBox={assessment?.primary ? assessment.primary.box : null}
              cropBox={assessment?.cropBox ?? null}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={styles.qualityBadge}>
            <View style={[styles.qualityDot, { backgroundColor: qualityColor(qualityLevel) }]} />
            <Text style={[styles.qualityBadgeText, { color: qualityColor(qualityLevel) }]}>
              {`本机 AI 识别完成 · ${qualityLevel.toUpperCase()}`}
            </Text>
          </View>
        </View>
        {assessment?.primary ? (
          <DetectorOverlayLegend showCrop={assessment.cropBox != null} />
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Text style={styles.resultLead}>
          {prediction.lowConfidence ? '有几个结果比较接近' : '看起来是'}
        </Text>
        <View style={styles.resultRow}>
          <Text style={styles.resultName}>{selectedName}</Text>
          <View style={styles.confidenceChip}>
            <Text style={styles.confidenceChipText}>{`${confidence}% 把握`}</Text>
          </View>
        </View>
        {corrected ? (
          <Text style={styles.correctedHint}>
            {`AI 原始结果：${prediction.top1.speciesName} · ${confidence}%`}
          </Text>
        ) : null}
        <Text style={styles.resultDescription}>
          {guideFish?.description ??
            `当前模型将这条鱼识别为“${prediction.top1.speciesName}”。保存前你可以确认或纠正鱼种，原始 AI 结果会被完整保留。`}
        </Text>
        <Text style={styles.modelLine}>
          {`模型 ${prediction.modelVersion} · ${prediction.latencyMs} ms`}
        </Text>
        {assessment ? (
          <Text style={styles.gateLine}>
            {`Quality Gate ${assessment.qualityLevel.toUpperCase()} · ${assessment.qualityReason}`}
          </Text>
        ) : null}
      </View>

      {assessment?.qualityLevel === 'warning' ? (
        <QualityWarningCard reason={assessment.qualityReason} />
      ) : null}

      {assessment && image ? (
        <DetectorMetadataCard
          assessment={assessment}
          cropSizeLabel={cropSizeLabel}
          sourceWidth={result?.sourceWidth ?? 0}
          sourceHeight={result?.sourceHeight ?? 0}
        />
      ) : null}

      {cropPreviewUri || modelInputUri ? (
        <CropPreviewCard
          cropPreviewUri={cropPreviewUri}
          cropSizeLabel={cropSizeLabel}
          modelInputUri={modelInputUri}
        />
      ) : null}

      {debugReport.trim().length > 0 ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Pressable
            onPress={handleCopyDebug}
            style={({ pressed }) => [styles.debugButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="复制识别调试信息"
          >
            <Text style={styles.debugButtonText}>复制识别调试信息</Text>
          </Pressable>
          <Text style={styles.debugHint}>
            包含 quality gate、原图 bbox、crop size、预处理、tensor SHA 和完整 logits /
            probability，复制后直接发给我即可。
          </Text>
        </View>
      ) : null}

      {prediction.lowConfidence ? (
        <View style={styles.candidateCard}>
          <Text style={styles.cardTitle}>你也可以选一个候选</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {prediction.candidates.slice(0, 3).map((candidate) => (
              <Pressable
                key={`${candidate.classIndex}-${candidate.speciesKey}`}
                onPress={() => {
                  setSelectedKey(candidate.speciesKey);
                  setSelectedName(candidate.speciesName);
                }}
              >
                <TagChip
                  text={`${candidate.speciesName} ${Math.round(candidate.confidence * 100)}%`}
                  emphasized={candidate.speciesName === selectedName}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showCorrection ? (
        <View style={styles.correctionCard}>
          <Text style={styles.cardTitle}>纠正鱼种</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {correctionOptions.map((option) => (
              <Pressable
                key={`${option.key}-${option.name}`}
                onPress={() => {
                  setSelectedKey(option.key);
                  setSelectedName(option.name);
                  setCustomName('');
                }}
              >
                <TagChip text={option.name} emphasized={option.name === selectedName} />
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
            style={styles.customInput}
            value={customName}
            onChangeText={(text) => setCustomName(text.slice(0, 20))}
            maxLength={20}
            placeholder="没找到？输入鱼种名称"
            placeholderTextColor={palette.mutedInk}
            selectionColor={palette.waterTeal}
          />
          {customName.trim().length > 0 ? (
            <Pressable
              onPress={() => {
                const trimmed = customName.trim();
                setSelectedName(trimmed);
                setSelectedKey(`user_${(kotlinHashCode(trimmed) >>> 0).toString(16)}`);
              }}
              style={({ pressed }) => [styles.useCustomWrap, pressed && { opacity: 0.6 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`使用 ${customName.trim()}`}
            >
              <Text style={styles.useCustomText}>{`使用“${customName.trim()}”`}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.correctionNote}>你的纠正会进入待审核反馈池，不会直接当作训练真值。</Text>
        </View>
      ) : null}

      <View>
        {saveError !== null && saveError.length > 0 ? (
          <View style={styles.saveErrorBox}>
            <Text style={styles.saveErrorText}>{saveError}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && !saving && { opacity: 0.88 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="保存这次鱼获"
        >
          <Icon name="add" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>
            {saving ? '正在保存…' : '保存这次鱼获'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Species', { key: selectedKey })}
          disabled={saving || selectedKey.startsWith('user_')}
          style={({ pressed }) => [
            styles.guideButton,
            (saving || selectedKey.startsWith('user_')) && { opacity: 0.4 },
            pressed && !saving && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="查看鱼鉴"
        >
          <Text style={styles.guideButtonText}>查看鱼鉴</Text>
        </Pressable>
        <View style={styles.footerRow}>
          <Pressable
            onPress={() => navigation.replace('Recognizing')}
            disabled={saving}
            style={({ pressed }) => [styles.footerAction, pressed && { opacity: 0.6 }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="重新识别"
          >
            <Icon name="refresh" size={16} color={palette.waterTeal} />
            <Text style={styles.footerActionText}>重新识别</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowCorrection((value) => !value)}
            disabled={saving}
            style={({ pressed }) => [styles.footerAction, pressed && { opacity: 0.6 }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="这不是我要的鱼"
          >
            <Text style={styles.footerMutedText}>
              {showCorrection ? '收起纠正' : '这不是我要的鱼'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

const QualityWarningCard: React.FC<{ reason: string }> = ({ reason }) => {
  const body =
    reason === 'primary_fish_bbox_touches_image_edge'
      ? '鱼体有一部分贴近或超出画面边缘，已保留这张照片并继续识别。保存前请结合原图确认鱼种。'
      : reason === 'weak_fish_detection_only'
        ? '检测置信度偏低，但仍保留候选并继续识别。请结合原图确认结果。'
        : '检测存在轻微质量风险，但没有阻断本次识别。保存前请结合原图确认鱼种。';
  return (
    <View style={styles.warningCard}>
      <Text style={styles.warningTitle}>画面可用，但需要留意</Text>
      <Text style={styles.warningBody}>{body}</Text>
    </View>
  );
};

const DetectorMetadataCard: React.FC<{
  assessment: FishInputAssessmentDTO;
  cropSizeLabel: string;
  sourceWidth: number;
  sourceHeight: number;
}> = ({ assessment, cropSizeLabel, sourceWidth, sourceHeight }) => {
  const primary = assessment.primary;
  const box = primary?.box;
  return (
    <View style={styles.metaCard}>
      <Text style={styles.cardTitle}>Detector Overlay</Text>
      <Text style={styles.metaLine}>
        {`原图 ${sourceWidth}×${sourceHeight} · Quality Gate ${assessment.qualityLevel.toUpperCase()}`}
      </Text>
      {primary && box ? (
        <>
          <Text style={styles.metaBoxLine}>
            {`原图 bbox [${format3(box.x1)}, ${format3(box.y1)}, ${format3(box.x2)}, ${format3(box.y2)}]`}
          </Text>
          <Text style={styles.metaLine}>
            {`confidence ${format3(primary.confidence)} · bbox_area_ratio ${format3(assessment.bboxAreaRatio ?? 0)}`}
          </Text>
        </>
      ) : null}
      <Text style={styles.metaLine}>
        {`crop size ${cropSizeLabel} · expand ratio ${format2(CROP_EXPAND_RATIO)}`}
      </Text>
    </View>
  );
};

const CropPreviewCard: React.FC<{
  cropPreviewUri: string | null;
  cropSizeLabel: string;
  modelInputUri: string | null;
}> = ({ cropPreviewUri, cropSizeLabel, modelInputUri }) => {
  const cropDims = cropSizeLabel.replace(' px', '');
  return (
    <View style={styles.metaCard}>
      <Text style={styles.cardTitle}>Crop Preview</Text>
      <Text style={styles.metaLine}>
        实际送入 MODEL_M1_v0.2：detector crop → FISH_CROP_LETTERBOX
      </Text>
      <View style={styles.previewRow}>
        {cropPreviewUri ? (
          <PreviewTile
            uri={cropPreviewUri}
            label={`detector crop · ${cropDims}`}
          />
        ) : null}
        {modelInputUri ? <PreviewTile uri={modelInputUri} label="MODEL_M1 input · 224×224" /> : null}
      </View>
    </View>
  );
};

const PreviewTile: React.FC<{ uri: string; label: string }> = ({ uri, label }) => (
  <View style={styles.previewTile}>
    <View style={styles.previewTileBox}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
    </View>
    <Text style={styles.previewTileLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  content: {
    paddingBottom: 28,
    gap: 14,
  },
  heroCard: {
    height: 270,
    borderRadius: 28,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
  },
  qualityBadge: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  qualityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 7,
  },
  resultLead: {
    color: palette.mutedInk,
    fontSize: 13,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  resultName: {
    color: palette.deepInk,
    fontSize: 31,
    fontWeight: '700',
  },
  confidenceChip: {
    marginLeft: 14,
    backgroundColor: palette.softWater,
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  confidenceChipText: {
    color: palette.waterTeal,
    fontSize: 12,
    fontWeight: '600',
  },
  correctedHint: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 8,
  },
  resultDescription: {
    color: palette.deepInk,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 16,
  },
  modelLine: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 8,
  },
  gateLine: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 4,
  },
  warningCard: {
    marginHorizontal: 20,
    backgroundColor: palette.warningCard,
    borderRadius: 22,
    padding: 16,
    gap: 5,
  },
  warningTitle: {
    color: palette.warningTitle,
    fontSize: 15,
    fontWeight: '700',
  },
  warningBody: {
    color: palette.warningText,
    fontSize: 12,
    lineHeight: 19,
  },
  metaCard: {
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    padding: 16,
    gap: 7,
  },
  cardTitle: {
    color: palette.deepInk,
    fontSize: 15,
    fontWeight: '700',
  },
  metaLine: {
    color: palette.mutedInk,
    fontSize: 11,
  },
  metaBoxLine: {
    color: palette.deepInk,
    fontSize: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  previewTile: {
    flex: 1,
    gap: 5,
  },
  previewTileBox: {
    height: 150,
    borderRadius: 16,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
  },
  previewTileLabel: {
    color: palette.mutedInk,
    fontSize: 10,
    lineHeight: 14,
  },
  debugButton: {
    borderWidth: 1,
    borderColor: palette.waterTeal,
    borderRadius: 18,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    paddingVertical: 12,
  },
  debugButtonText: {
    color: palette.waterTeal,
  },
  debugHint: {
    color: palette.mutedInk,
    fontSize: 10,
    marginVertical: 4,
  },
  candidateCard: {
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    paddingVertical: 16,
  },
  correctionCard: {
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    paddingVertical: 16,
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  customInput: {
    marginHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: 18,
    backgroundColor: palette.cardWhite,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: palette.deepInk,
  },
  useCustomWrap: {
    marginTop: 6,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  useCustomText: {
    color: palette.waterTeal,
    fontSize: 14,
  },
  correctionNote: {
    color: palette.mutedInk,
    fontSize: 11,
    marginHorizontal: 16,
    marginTop: 8,
  },
  saveErrorBox: {
    marginHorizontal: 20,
    backgroundColor: palette.warningCard,
    borderRadius: 16,
    padding: 13,
    marginBottom: 10,
  },
  saveErrorText: {
    color: palette.qualityInvalid,
    fontSize: 12,
  },
  saveButton: {
    marginHorizontal: 20,
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.waterTeal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  guideButton: {
    marginHorizontal: 20,
    marginVertical: 2,
    height: 48,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.waterTeal,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideButtonText: {
    color: palette.waterTeal,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  footerActionText: {
    color: palette.waterTeal,
  },
  footerMutedText: {
    color: palette.mutedInk,
  },
});
