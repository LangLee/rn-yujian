import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { launchImageLibrary } from 'react-native-image-picker';
import { useRecognition } from '../contexts/RecognitionContext';
import { ScreenHeader } from '../components';
import { MorningLakeScene } from '../components/coreui';
import { ResultHeroViewport, RESULT_MARGIN } from '../components/result/ResultKit';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { useWindowDimensions } from 'react-native';
import { font, fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';
import { recognitionService } from '../services/recognitionService';
import { FishInputStatusWire } from '../types/models';
import { RootStackParamList } from '../navigation/types';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';

type RecognitionIssueScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'RecognitionIssue'
>;

interface IssueCopy {
  title: string;
  body: string;
}

/**
 * 异常文案（冻结稿 08/09 错误态 + 运行时安全扩展态）：一句「发生了什么」+
 * 一句「下一步怎么做」，不带 Error Code 与后台术语（1.4 / 15）。
 * 08/09 冻结原文逐字；multiple_fish / incomplete_fish / fish_too_small 为
 * 运行时细分恢复态（技术失败不入 3+2 冻结集的同一精神：安全兜底，不暴露内部细节）。
 */
const issueCopyFor = (status: FishInputStatusWire): IssueCopy => {
  switch (status) {
    case 'no_fish':
      return {
        title: '没有找到可识别的鱼',
        body: '请让鱼完整出现在画面中，再试一次。',
      };
    case 'uncertain':
      return {
        title: '照片不够清晰，无法识别',
        body: '请拍摄更清晰的照片，确保鱼的整体轮廓清晰，没有遮挡。',
      };
    case 'multiple_fish':
      return {
        title: '一次只能识别一条鱼',
        body: '画面里的鱼有点多，单独拍一条会认得更准。',
      };
    case 'incomplete_fish':
      return {
        title: '鱼没有完整入镜',
        body: '鱼头或鱼尾被裁掉了，退后一点让整条鱼进入画面再拍一张。',
      };
    case 'fish_too_small':
      return {
        title: '鱼离镜头有点远',
        body: '靠近一点，让鱼占据画面更多位置，会更容易认出来。',
      };
    case 'ready':
    default:
      return {
        title: '这次没能认出来',
        body: '可以重新拍摄，或从相册选择一张清晰的照片。',
      };
  }
};

/**
 * 识别恢复态（ERROR_NO_FISH / ERROR_IMAGE_QUALITY 家族，冻结稿 08/09）：
 * 与识别结果页同一页面骨架（清晨湖面背景 + BACK_TITLE 顶导 + Hero 卡），
 * Hero 用 Cover Fill 铺满卡片（居中裁剪，不让照片缩成一条留大片空白）；恢复面板（标题 + 指引）+
 * 主「重新拍摄」/ 次「从相册选择」全宽按钮，返回为三级操作。
 * 不建鱼获记录；冷静恢复基调，无报警红、无光效（17.21 / Closure §9.9）。
 */
export const RecognitionIssueScreen: React.FC = () => {
  const navigation = useNavigation<RecognitionIssueScreenNavigationProp>();
  const isFocused = useIsFocused();
  // 重新拍摄不再显式 reset：IdentifyScreen 重挂载时自会清空上下文；
  // 先 reset 会触发本页「无结果则 goBack」守卫，与 navigate 打架把页面卡在空白态
  const { image, result, selectImage } = useRecognition();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  /* 相册重选进行中：selectImage 会清空 result，需让路给 Recognizing，
     避免触发下方「无结果则 goBack」守卫与 navigate 打架 */
  const pickingRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (pickingRef.current) {
      return;
    }
    if (!result || result.ready) {
      navigation.goBack();
    }
  }, [isFocused, result, navigation]);

  /* 从相册换一张照片直接重新识别（复用结果页同一流程） */
  const repickFromGallery = () => {
    haptics.selection();
    launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, (response) => {
      if (response.didCancel || response.errorCode) {
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        return;
      }
      void (async () => {
        try {
          const meta = await recognitionService.normalizeImage(uri, 'gallery');
          pickingRef.current = true;
          selectImage(meta);
          navigation.navigate('Recognizing');
        } catch {
          // 选片失败静默返回，不打断当前失败页
        }
      })();
    });
  };

  if (!result || result.ready) {
    return (
      <View style={[styles.screen, { backgroundColor: coreColors.lakeWhite }]}>
        <MorningLakeScene level="content" />
      </View>
    );
  }
  const copy = issueCopyFor(result.status);
  const imageUri = toFileUri(image?.filePath);
  const contentWidth = Math.min(windowWidth - RESULT_MARGIN * 2, 440);
  const textPrimary = coreColors.deepLakeBlue;

  return (
    <View style={styles.screen}>
      {/* BG_CONTENT：与结果页同一清晨湖畔世界 */}
      <MorningLakeScene level="content" />
      <ScreenHeader
        title="识别结果"
        onBack={() => navigation.goBack()}
        titleColor={textPrimary}
        backColor={textPrimary}
      />
      <View style={styles.content}>
        {/* Hero：Cover Fill —— 等比铺满卡片、居中裁剪。原 Evidence Contain 会把
            竖版照片缩成卡片中一条，两侧留大片支撑面，观感像「没拍上」 */}
        <ResultHeroViewport
          uri={imageUri}
          mode="cover"
          width={contentWidth}
          accessibilityLabel="待识别照片"
        />

        {/* 恢复面板（关键帧 08/09：居中标题 + 居中指引，磨砂浅蓝白卡面，
            标题 22sp 衬线，指引 ≤3 行灰蓝） */}
        <View style={styles.recoveryPanel}>
          <Text style={[styles.recoveryTitle, { color: textPrimary }]} numberOfLines={2}>
            {copy.title}
          </Text>
          <Text style={styles.recoveryBody} numberOfLines={3}>
            {copy.body}
          </Text>
        </View>

        {/* 恢复对（Action Button V1.1）：主任务重新拍摄 PRIMARY / 备选从相册选择 SECONDARY_STRONG */}
        <PrimaryButton
          label="重新拍摄"
          icon="camera-outline"
          variant="primary"
          onPress={() => navigation.popTo('Identify')}
          style={styles.retakeBtn}
        />
        <PrimaryButton
          label="从相册选择"
          icon="image-outline"
          variant="secondaryStrong"
          onPress={repickFromGallery}
          style={styles.galleryBtn}
        />
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: coreColors.lakeWhite,
  } as ViewStyle,
  content: {
    paddingHorizontal: RESULT_MARGIN,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  } as ViewStyle,
  /** 恢复面板：磨砂浅蓝白卡面，居中排版（关键帧 08/09） */
  recoveryPanel: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 24,
    paddingVertical: 20,
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  } as ViewStyle,
  recoveryTitle: {
    fontFamily: font.serif,
    fontSize: fs(22),
    lineHeight: fs(30),
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  } as TextStyle,
  recoveryBody: {
    marginTop: 8,
    fontSize: fs(14),
    lineHeight: fs(21),
    letterSpacing: 0.5,
    color: coreColors.mistBlueGray,
    textAlign: 'center',
  } as TextStyle,
  retakeBtn: {
    marginTop: 18,
  } as ViewStyle,
  galleryBtn: {
    marginTop: 12,
  } as ViewStyle,
});
