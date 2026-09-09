import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { RouteProp } from '@react-navigation/native';
import { useRecognition } from '../contexts/RecognitionContext';
import { recognitionService } from '../services/recognitionService';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { CaptureButton } from '../components/CaptureButton';
import { FishScanFrame } from '../components/FishScanFrame';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenHeader } from '../components';
import { palette } from '../constants/colors';
import { font, spacing, typeScale } from '../constants/tokens';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type IdentifyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Identify'>;
type IdentifyScreenRouteProp = RouteProp<RootStackParamList, 'Identify'>;

const CAMERA_PERM_SEEN_KEY = '@yujian/perm_camera_seen';

/** Quality Gate 文案：只说用户可行动的信息（7.1）。 */
const QUALITY_COPY: Record<string, string> = {
  ready: '鱼体完整，可以拍摄',
  no_fish: '没有看到完整的鱼，调整一下角度再试试',
  uncertain: '鱼看得不太清楚，靠近一点、拍亮一点',
  multiple_fish: '一次拍一条鱼会认得更准',
  incomplete_fish: '保持鱼头鱼尾完整',
  fish_too_small: '让鱼占满取景框会更好认',
};

/** 状态行图标含义：ready/默认 金勾；其他 Gate 提示 感叹；error 关闭。 */
type StatusMark = 'check' | 'warn' | 'close' | 'spinner';

/** 底部快门与相册按钮（还原设计稿：快门中心约在 33.5% 屏宽、相册约在 77.4% 屏宽处）。 */
const SHUTTER_SIZE = 90;
const ALBUM_SIZE = 44;
const SHUTTER_D = SHUTTER_SIZE + 34;
const ALBUM_D = ALBUM_SIZE + 32;
const DOCK_HEIGHT = SHUTTER_D;

/**
 * P02 拍照识鱼（设计文档 7.1 + 高保真稿）：
 * 全屏湖面取景 + 鱼形渐变轮廓框；框内引导文案；
 * 底部快门（银白金属环磨砂玻璃）居左，相册入口居右。
 * 拍照后立即进入 P03，不假装已经完成识别。
 */
export const IdentifyScreen: React.FC = () => {
  const navigation = useNavigation<IdentifyScreenNavigationProp>();
  const route = useRoute<IdentifyScreenRouteProp>();
  const { width: windowWidth } = useWindowDimensions();
  const { image, selectImage, reset } = useRecognition();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [gateStatus, setGateStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permSheet, setPermSheet] = useState(false);
  const pendingCameraRef = useRef(false);

  // 进入 P02 时清理上一条流程的残留状态
  useEffect(() => {
    reset();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 识别页异常退回时带回原因（Recognizing catch → navigate Identify { error }）
  useEffect(() => {
    if (route.params?.error) {
      setError(route.params.error);
      navigation.setParams({ error: undefined });
    }
  }, [route.params?.error, navigation]);

  const handlePicked = useCallback(
    async (uri: string, source: 'camera' | 'gallery') => {
      setLoading(true);
      setError(null);
      setGateStatus(null);
      try {
        const meta = await recognitionService.normalizeImage(uri, source);
        selectImage(meta);
        // 拍照后立即进入 P03；照片尚未识别，不假装已完成
        navigation.navigate('Recognizing');
      } catch (e) {
        setError(e instanceof Error ? e.message : '照片读取失败，请再试一次');
      } finally {
        setLoading(false);
      }
    },
    [selectImage, navigation],
  );

  const requestCameraAndShoot = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: '相机权限',
        message: '只有在你主动拍摄时，渔见才会使用相机',
        buttonPositive: '允许',
        buttonNegative: '拒绝',
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setError('需要相机权限才能拍照，也可以从右下角选择相册照片');
        return;
      }
    }
    launchCamera({ mediaType: 'photo', quality: 1 }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        setError(
          response.errorCode === 'permission'
            ? '需要相机权限才能拍照，也可以从右下角选择相册照片'
            : response.errorMessage ?? '相机启动失败，请再试一次',
        );
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        setError('没有拍到照片，请重新拍摄');
        return;
      }
      void handlePicked(uri, 'camera');
    });
  }, [handlePicked]);

  const openCamera = useCallback(async () => {
    setError(null);
    haptics.confirm(); // S2：拍照核心确认（17.6）
    const seen = await AsyncStorage.getItem(CAMERA_PERM_SEEN_KEY);
    if (!seen) {
      pendingCameraRef.current = true;
      setPermSheet(true);
      return;
    }
    await requestCameraAndShoot();
  }, [requestCameraAndShoot]);

  const openGallery = useCallback(() => {
    setError(null);
    haptics.selection();
    launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        setError(response.errorMessage ?? '相册读取失败，请再试一次');
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        return;
      }
      void handlePicked(uri, 'gallery');
    });
  }, [handlePicked]);

  const imageUri = toFileUri(image?.filePath);

  // 框内状态行（Quality Gate / 加载 / 错误都落在鱼身中央，不另设浮层）
  let statusCopy: string;
  let statusMark: StatusMark;
  let statusError = false;
  if (error) {
    statusCopy = error;
    statusMark = 'close';
    statusError = true;
  } else if (loading) {
    statusCopy = '正在准备照片…';
    statusMark = 'spinner';
  } else if (imageUri) {
    statusCopy = '正在认识这条鱼…';
    statusMark = 'spinner';
  } else if (gateStatus && gateStatus !== 'ready') {
    statusCopy = QUALITY_COPY[gateStatus] ?? '';
    statusMark = 'warn';
  } else {
    statusCopy = QUALITY_COPY.ready;
    statusMark = 'check';
  }

  return (
    <View style={styles.screen}>
      {/* 环境照片背景 + 轻遮罩（保留湖面亮度，保证白色文案可读） */}
      <WaterBackdrop />
      <View style={[StyleSheet.absoluteFill, styles.bgScrim]} pointerEvents="none" />

      {/* 顶部：返回 + 衬线标题 */}
      <ScreenHeader
        title="拍照识鱼"
        onBack={() => navigation.goBack()}
        titleColor="#FDFEFD"
        backColor="#FDFEFD"
      />

      {/* 取景区：全屏透明，鱼形轮廓 + 框内引导文案 */}
      <View style={styles.viewfinder}>
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, styles.viewfinderDim]} />
          </>
        ) : null}
        <View style={styles.frameWrap}>
          <FishScanFrame width={Math.min(windowWidth * 0.84, 360)} />
          <View style={[StyleSheet.absoluteFill, styles.frameCopy]} pointerEvents="none">
            <Text style={styles.headline}>拍下整条鱼</Text>
            <Text style={styles.subline}>让鱼身保持完整，识别更准确</Text>
            <View style={styles.statusRow}>
              {statusMark === 'spinner' ? (
                <ActivityIndicator size="small" color="#F4F8F7" />
              ) : (
                <View style={[styles.statusDot, statusError && styles.statusDotError]}>
                  {statusMark === 'check' ? (
                    <Icon name="checkmark" size={12} color="#FFFFFF" />
                  ) : statusMark === 'close' ? (
                    <Icon name="close" size={11} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.statusWarnMark}>!</Text>
                  )}
                </View>
              )}
              <Text
                style={[styles.statusText, statusError && styles.statusTextError]}
                numberOfLines={2}
              >
                {statusCopy}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 底部：快门居左 + 相册居右（按屏宽百分比定位，随屏幕缩放） */}
      <View
        style={[styles.dock, { bottom: insets.bottom + spacing.md }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.dockItem, { left: windowWidth * 0.335 - SHUTTER_D / 2, top: 0 }]}
          pointerEvents="box-none"
        >
          <CaptureButton onPress={openCamera} disabled={loading} size={SHUTTER_SIZE} icon="camera" />
        </View>
        <View
          style={[
            styles.dockItem,
            {
              right: windowWidth * 0.226 - ALBUM_D / 2,
              top: (DOCK_HEIGHT - ALBUM_D) / 2,
            },
          ]}
          pointerEvents="box-none"
        >
          <CaptureButton
            onPress={openGallery}
            disabled={loading}
            size={ALBUM_SIZE}
            icon="image-outline"
            iconRatio={0.42}
            breath={false}
            accessibilityLabel="从相册选择照片"
          />
        </View>
      </View>

      {/* 首次相机权限引导（16：自有说明 Sheet → 继续 → 系统权限弹窗） */}
      <BottomSheet
        visible={permSheet}
        onClose={() => {
          setPermSheet(false);
          pendingCameraRef.current = false;
        }}
        title="使用相机"
      >
        <Text style={styles.permText}>
          只有在你主动拍摄时，渔见才会使用相机。拍下的鱼获照片保存在你自己的收藏里。
        </Text>
        <PrimaryButton
          label="继续"
          onPress={async () => {
            setPermSheet(false);
            AsyncStorage.setItem(CAMERA_PERM_SEEN_KEY, '1').catch(() => undefined);
            if (pendingCameraRef.current) {
              pendingCameraRef.current = false;
              await requestCameraAndShoot();
            }
          }}
        />
        <PrimaryButton
          label="先不用"
          variant="ghost"
          onPress={() => {
            setPermSheet(false);
            pendingCameraRef.current = false;
          }}
          style={styles.permSecondary}
        />
      </BottomSheet>
    </View>
  );
};

const shadowText: TextStyle = {
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
  textShadowColor: 'rgba(6,20,26,0.5)',
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.viewfinderDark,
  } as ViewStyle,
  bgScrim: {
    backgroundColor: 'rgba(8,24,30,0.34)',
  } as ViewStyle,
  viewfinder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: DOCK_HEIGHT + spacing.sm,
  } as ViewStyle,
  viewfinderDim: {
    backgroundColor: 'rgba(0,0,0,0.16)',
  } as ViewStyle,
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  frameCopy: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  headline: {
    color: '#FDFEFD',
    fontFamily: font.serif,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: 2,
    ...shadowText,
  } as TextStyle,
  subline: {
    marginTop: spacing.xs + 2,
    color: 'rgba(250,252,251,0.86)',
    fontSize: typeScale.meta + 1,
    letterSpacing: 1,
    ...shadowText,
  } as TextStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    maxWidth: 240,
  } as ViewStyle,
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm - 2,
  } as ViewStyle,
  statusDotError: {
    backgroundColor: 'rgba(214,124,110,0.92)',
  } as ViewStyle,
  statusWarnMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  } as TextStyle,
  statusText: {
    flexShrink: 1,
    color: 'rgba(251,253,252,0.92)',
    fontSize: typeScale.meta + 1,
    ...shadowText,
  } as TextStyle,
  statusTextError: {
    color: '#F3C7BD',
  } as TextStyle,
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: DOCK_HEIGHT,
  } as ViewStyle,
  dockItem: {
    position: 'absolute',
  } as ViewStyle,
  permText: {
    color: palette.mutedInk,
    fontSize: typeScale.body,
    lineHeight: 24,
    marginBottom: spacing.lg,
  } as TextStyle,
  permSecondary: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
