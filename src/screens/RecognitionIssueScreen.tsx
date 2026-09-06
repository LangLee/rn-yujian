import React, { useEffect } from 'react';
import { Image, ImageStyle, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { GlassCard } from '../components/ui/GlassCard';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { EmptyState } from '../components/ui/EmptyState';
import { palette } from '../constants/colors';
import { spacing, typeScale } from '../constants/tokens';
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
  const { image, result, reset } = useRecognition();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();

  // 没有结果或结果其实已就绪时直接回 P02
  useEffect(() => {
    if (!result || result.ready) {
      navigation.navigate('Identify');
    }
  }, [result, navigation]);

  if (!result || result.ready) {
    return <View style={styles.screen} />;
  }

  const copy = issueCopyFor(result.status);
  const imageUri = toFileUri(image?.filePath);

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl }]}>
        {imageUri ? (
          <GlassCard noPadding style={styles.photoCard}>
            <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
          </GlassCard>
        ) : null}
        <EmptyState
          title="这次没能认出来"
          description={copy.body}
          style={styles.empty}
        />
        <PrimaryButton
          label="重新识别"
          onPress={() => navigation.replace('Recognizing')}
          style={styles.primary}
        />
        <PrimaryButton
          label="重新拍摄或从相册选择"
          variant="ghost"
          onPress={() => {
            reset();
            navigation.navigate('Identify');
          }}
          style={styles.secondary}
        />
        <Text style={[styles.keepNote, { color: profile.surface.textSecondary }]}>
          这张照片还在，不会丢失
        </Text>
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
  primary: {
    marginTop: spacing.md,
  } as ViewStyle,
  secondary: {
    marginTop: spacing.sm,
  } as ViewStyle,
  keepNote: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: typeScale.caption,
  } as TextStyle,
});
