import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useRecognition } from '../contexts/RecognitionContext';
import { YujianTopBar } from '../components/Common';
import { FishIllustration } from '../components/FishIllustration';
import { palette } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';

type RecognizingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Recognizing'>;

/** 3 步骤动画节奏（对应原 400/400/250ms）。 */
const STEP_ONE_MS = 400;
const STEP_TWO_MS = 400;
const STEP_THREE_MS = 250;
const MIN_TOTAL_MS = STEP_ONE_MS + STEP_TWO_MS + STEP_THREE_MS;

/**
 * 识别中页（对应原 RecognizingScreen.kt）：本地推理与步骤动画并行，
 * 完成后按 ready 标志分流到结果页/异常页。
 */
export const RecognizingScreen: React.FC = () => {
  const navigation = useNavigation<RecognizingScreenNavigationProp>();
  const { image, recognizeAndRecord } = useRecognition();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setError('没有可识别的照片');
      return undefined;
    }
    let cancelled = false;
    setError(null);
    setStage(1);
    const timers = [
      setTimeout(() => {
        if (!cancelled) {
          setStage(2);
        }
      }, STEP_ONE_MS),
      setTimeout(() => {
        if (!cancelled) {
          setStage(3);
        }
      }, STEP_ONE_MS + STEP_TWO_MS),
    ];
    const minimumWait = new Promise<void>((resolve) => {
      setTimeout(resolve, MIN_TOTAL_MS);
    });
    Promise.all([recognizeAndRecord(), minimumWait])
      .then(([result]) => {
        if (cancelled) {
          return;
        }
        if (result.ready) {
          navigation.replace('Result');
        } else {
          navigation.replace('RecognitionIssue');
        }
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        setError(e instanceof Error ? e.message : '识别失败，请重新选择照片');
      });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [image, recognizeAndRecord, navigation]);

  const imageUri = toFileUri(image?.filePath);

  return (
    <View style={styles.screen}>
      <YujianTopBar
        title="正在认识这条鱼"
        subtitle={error === null ? '先找鱼，再识别鱼种' : '这次没认出来'}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.preview}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, styles.previewDim]} />
          </>
        ) : (
          <FishIllustration size={150} bodyColor="rgba(46,139,131,0.78)" />
        )}
        <View style={styles.pulseOuter} pointerEvents="none" />
        <View style={styles.pulseInner} pointerEvents="none" />
        <FishIllustration size={126} bodyColor="rgba(46,139,131,0.72)" />
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{error === null ? '本机识别中' : '识别未完成'}</Text>
        </View>
      </View>

      <View style={styles.stepCard}>
        <Text style={styles.stepCardTitle}>我正在看这些</Text>
        <RecognitionStep
          label="检测照片中的鱼体"
          completed={stage >= 1}
          active={stage === 1 && error === null}
        />
        <RecognitionStep
          label="检查鱼体是否完整清晰"
          completed={stage >= 2}
          active={stage === 2 && error === null}
        />
        <RecognitionStep
          label="比对鱼种特征"
          completed={stage >= 3}
          active={stage === 3 && error === null}
        />
      </View>

      {error !== null ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="重新选择照片"
          >
            <Text style={styles.retryButtonText}>重新选择照片</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>检测与识别都在手机本地完成</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progressFraction(stage) * 100)}%` },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
};

const progressFraction = (stage: number): number => {
  switch (stage) {
    case 1:
      return 0.34;
    case 2:
      return 0.68;
    case 3:
      return 0.92;
    default:
      return 0.05;
  }
};

const RecognitionStep: React.FC<{
  label: string;
  completed: boolean;
  active: boolean;
}> = ({ label, completed, active }) => (
  <View style={styles.stepRow}>
    <View style={[styles.stepDot, completed && styles.stepDotCompleted]}>
      <Text style={[styles.stepDotText, completed && styles.stepDotTextCompleted]}>
        {completed ? '✓' : '·'}
      </Text>
    </View>
    <Text style={styles.stepLabel}>{label}</Text>
    <Text
      style={[
        styles.stepStatus,
        active ? { color: palette.warmOrange } : completed ? { color: palette.waterTeal } : undefined,
      ]}
    >
      {active ? '正在进行' : completed ? '完成' : '等待'}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  preview: {
    height: 312,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 28,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDim: {
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  pulseOuter: {
    position: 'absolute',
    width: 184,
    height: 184,
    borderRadius: 92,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pulseInner: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  badge: {
    position: 'absolute',
    top: 18,
    left: 18,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: palette.waterTeal,
    fontSize: 12,
    fontWeight: '600',
  },
  stepCard: {
    marginHorizontal: 20,
    marginVertical: 18,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },
  stepCardTitle: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.stepIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotCompleted: {
    backgroundColor: palette.waterTeal,
  },
  stepDotText: {
    color: palette.mutedInk,
    fontWeight: '700',
  },
  stepDotTextCompleted: {
    color: '#FFFFFF',
  },
  stepLabel: {
    flex: 1,
    color: palette.deepInk,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 14,
  },
  stepStatus: {
    color: palette.mutedInk,
    fontSize: 11,
    fontWeight: '600',
  },
  errorBlock: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  errorText: {
    color: palette.qualityInvalid,
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    height: 50,
    alignSelf: 'stretch',
    borderRadius: 25,
    backgroundColor: palette.waterTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  progressBlock: {
    paddingHorizontal: 64,
    paddingVertical: 12,
    alignItems: 'center',
  },
  progressText: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  progressTrack: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 7,
    borderRadius: 50,
    backgroundColor: palette.progressTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 50,
    backgroundColor: palette.waterTeal,
  },
});
