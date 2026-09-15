import React, { useEffect } from 'react';
import { Image, ImageStyle, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { GlassCard } from '../components/ui/GlassCard';
import { EmptyState } from '../components/ui/EmptyState';
import { spacing } from '../constants/tokens';
import { FishInputStatusWire } from '../types/models';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';

type RecognitionIssueScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'RecognitionIssue'
>;

interface IssueCopy {
  body: string;
}

/** 异常文案：告诉用户发生了什么 + 下一步怎么做，不带 Error Code 与后台术语（1.4 / 15）。 */
const issueCopyFor = (status: FishInputStatusWire): IssueCopy => {
  switch (status) {
    case 'no_fish':
      return { body: '照片里没有找到完整的鱼，可以重新拍一张试试。' };
    case 'uncertain':
      return { body: '照片里可能有鱼，但看得不太清楚，换一张更清晰的照片会更好。' };
    case 'multiple_fish':
      return { body: '一次拍一条鱼会认得更准，可以重新拍一张。' };
    case 'incomplete_fish':
      return { body: '鱼头或鱼尾没有完整进入画面，重新拍一张试试。' };
    case 'fish_too_small':
      return { body: '鱼离镜头有点远，靠近一点再拍会更容易认出来。' };
    case 'ready':
    default:
      return { body: '这次没能认出来，可以重新识别或换一张照片。' };
  }
};

/**
 * 识别异常（FAILED 状态，7.3 / 15）：
 * 「这次没能认出来」+ 重新识别 / 重拍 / 从相册；
 * 保留原照片，内容不丢失；无抖动、无红闪、无报警声音（17.21）。
 */
export const RecognitionIssueScreen: React.FC = () => {
  const navigation = useNavigation<RecognitionIssueScreenNavigationProp>();
  const isFocused = useIsFocused();
  // 重新拍摄不再显式 reset：IdentifyScreen 重挂载时自会清空上下文；
  // 先 reset 会触发本页「无结果则 goBack」守卫，与 navigate 打架把页面卡在空白态
  const { image, result } = useRecognition();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();

  // 没有结果或结果其实已就绪时退回上一页；只在获得焦点时执行，
  // 退场转场期间 Identify 重挂载 reset 清空 result 时不再误触发 goBack
  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (!result || result.ready) {
      navigation.goBack();
    }
  }, [isFocused, result, navigation]);

  if (!result || result.ready) {
    return (
      <View style={[styles.screen, { backgroundColor: profile.surface.canvas }]}>
        <WaterBackdrop />
      </View>
    );
  }

  const copy = issueCopyFor(result.status);
  const imageUri = toFileUri(image?.filePath);

  return (
    <View style={[styles.screen, { backgroundColor: profile.surface.canvas }]}>
      <WaterBackdrop />
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl }]}>
        {imageUri ? (
          <GlassCard noPadding style={styles.photoCard}>
            <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
          </GlassCard>
        ) : null}
        <EmptyState
          variant="memory"
          title="这次没能认出来"
          description={copy.body}
          actionLabel="重新识别"
          onAction={() => navigation.replace('Recognizing')}
          secondaryActionLabel="重新拍摄或从相册选择"
          onSecondaryAction={() => navigation.navigate('Identify')}
          footnote="这张照片还在，不会丢失"
          style={styles.empty}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  content: {
    flex: 1,
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  photoCard: {
    borderRadius: 20,
    overflow: 'hidden',
  } as ViewStyle,
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
  } as ImageStyle,
  empty: {
    paddingTop: spacing.md,
  } as ViewStyle,
});
