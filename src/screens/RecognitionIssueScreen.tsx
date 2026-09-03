import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useRecognition } from '../contexts/RecognitionContext';
import { YujianTopBar } from '../components/Common';
import { DetectorOverlayImage } from '../components/DetectorOverlay';
import { palette } from '../constants/colors';
import { FishInputStatusWire } from '../types/models';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';

type RecognitionIssueScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'RecognitionIssue'
>;

interface IssueCopy {
  title: string;
  body: string;
}

const issueCopyFor = (status: FishInputStatusWire): IssueCopy => {
  switch (status) {
    case 'no_fish':
      return { title: '没有检测到鱼', body: '请重新拍摄或选择包含鱼的照片。' };
    case 'uncertain':
      return {
        title: '没有确认到清晰鱼体',
        body: '照片里可能有鱼，但当前画面不够确定。请换一张鱼体更清晰的照片。',
      };
    case 'multiple_fish':
      return { title: '检测到多条鱼', body: '请重新拍摄单条鱼，或选择主体更明确的照片。' };
    case 'incomplete_fish':
      return {
        title: '鱼体没有完整进入画面',
        body: '请尽量让鱼头、鱼尾和主要鳍部完整出现在照片中。',
      };
    case 'fish_too_small':
      return { title: '鱼离镜头有点远', body: '靠近一点再拍，更容易准确识别鱼种。' };
    case 'ready':
    default:
      return { title: '鱼体已准备好', body: '正在进入鱼种识别。' };
  }
};

/** 识别异常分流页（对应原 RecognitionIssueScreen.kt，INVALID 状态文案）。 */
export const RecognitionIssueScreen: React.FC = () => {
  const navigation = useNavigation<RecognitionIssueScreenNavigationProp>();
  const { image, result, reset } = useRecognition();

  // 原行为：没有结果或结果 ready 时直接回到识鱼页。
  useEffect(() => {
    if (!result || result.ready) {
      navigation.navigate('Identify');
    }
  }, [result, navigation]);

  if (!result || result.ready) {
    return <View style={styles.screen} />;
  }

  const copy = issueCopyFor(result.status);
  const assessment = result.assessment;
  const imageUri = toFileUri(image?.filePath);

  return (
    <View style={styles.screen}>
      <YujianTopBar
        title="检查照片"
        subtitle="先确认鱼体，再判断鱼种"
        onBack={() => navigation.goBack()}
      />

      {imageUri ? (
        <DetectorOverlayImage
          imagePath={imageUri}
          sourceWidth={result.sourceWidth}
          sourceHeight={result.sourceHeight}
          detectorBox={assessment.primary ? assessment.primary.box : null}
          cropBox={assessment.cropBox}
          style={styles.overlay}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{copy.title}</Text>
        <Text style={styles.cardBody}>{copy.body}</Text>
        <Text style={styles.qualityLine}>
          {`Quality Gate ${assessment.qualityLevel.toUpperCase()} · ${assessment.qualityReason}`}
        </Text>
        {assessment.primary ? (
          <Text style={styles.confidenceLine}>
            {`鱼体检测置信度 ${Math.trunc(assessment.primary.confidence * 100)}%`}
          </Text>
        ) : null}
        <Text style={styles.detectorLine}>
          {`Detector ${result.detectorRun.modelVersion} · ${result.detectorRun.latencyMs} ms`}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            reset();
            navigation.navigate('Identify');
          }}
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="重新选择照片"
        >
          <Text style={styles.primaryButtonText}>重新选择照片</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.replace('Recognizing')}
          style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="再检测一次"
        >
          <Text style={styles.secondaryButtonText}>再检测一次</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  overlay: {
    marginHorizontal: 20,
    marginVertical: 8,
    height: 290,
    borderRadius: 28,
  },
  card: {
    margin: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  cardTitle: {
    color: palette.deepInk,
    fontSize: 22,
    fontWeight: '700',
  },
  cardBody: {
    color: palette.mutedInk,
    fontSize: 14,
    lineHeight: 22,
  },
  qualityLine: {
    color: palette.qualityInvalid,
    fontSize: 11,
  },
  confidenceLine: {
    color: palette.waterTeal,
    fontSize: 12,
    fontWeight: '600',
  },
  detectorLine: {
    color: '#89938F',
    fontSize: 11,
  },
  actions: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 10,
    alignItems: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.waterTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.waterTeal,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: palette.waterTeal,
  },
});
