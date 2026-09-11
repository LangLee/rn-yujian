import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { RouteProp } from '@react-navigation/native';
import { useRecognition } from '../contexts/RecognitionContext';
import { recognitionService } from '../services/recognitionService';
import { FishScanFrame } from '../components/FishScanFrame';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PressableScale } from '../components/ui/PressableScale';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { palette } from '../constants/colors';
import { font, spacing, typeScale } from '../constants/tokens';
import { haptics } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type IdentifyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Identify'>;
type IdentifyScreenRouteProp = RouteProp<RootStackParamList, 'Identify'>;

const CAMERA_PERM_SEEN_KEY = '@yujian/perm_camera_seen';

/** 底部快门与相册按钮（简化版：快门水平居中，相册在其右侧）。 */
const SHUTTER_SIZE = 74;
const SHUTTER_INNER = 56;
const ALBUM_SIZE = 46;
const DOCK_HEIGHT = SHUTTER_SIZE;

/**
 * P02 拍照识鱼（自定义相机页）：
 * 全屏实时取景（react-native-vision-camera）+ 写实鱼形渐变轮廓框；
 * 顶部仅保留右上角透明圆形关闭按钮；
 * 底部为简化的白环快门 + 半透明相册图标按钮。
 * 拍照后立即进入 P03，识别走原有端侧 pipeline（normalizeImage → Recognizing）。
 */
export const IdentifyScreen: React.FC = () => {
  const navigation = useNavigation<IdentifyScreenNavigationProp>();
  const route = useRoute<IdentifyScreenRouteProp>();
  const { width: windowWidth } = useWindowDimensions();
  const { selectImage, reset } = useRecognition();
  const insets = useSafeAreaInsets();

  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });
  const { hasPermission, requestPermission } = useCameraPermission();

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permSheet, setPermSheet] = useState(false);
  const permAskedRef = useRef(false);

  // 进入 P02 时清理上一条流程的残留状态
  useEffect(() => {
    reset();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 离开页面时停用相机，回到页面再恢复取景
  useFocusEffect(
    useCallback(() => {
      setCameraEnabled(true);
      return () => setCameraEnabled(false);
    }, []),
  );

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

  /** 快门：直接在取景页拍摄，不再跳系统相机 */
  const shoot = useCallback(async () => {
    if (shooting || loading) {
      return;
    }
    setError(null);
    if (!hasPermission) {
      const seen = await AsyncStorage.getItem(CAMERA_PERM_SEEN_KEY);
      if (!seen && !permAskedRef.current) {
        permAskedRef.current = true;
        setPermSheet(true);
        return;
      }
      const granted = await requestPermission();
      if (!granted) {
        setError('需要相机权限才能拍照，也可以从右下角选择相册照片');
        return;
      }
    }
    if (!device) {
      setError('相机启动中，请稍候再试');
      return;
    }
    haptics.confirm(); // S2：拍照核心确认（17.6）
    setShooting(true);
    try {
      // PhotoFile.filePath 是文件系统路径，不是 file:// URL
      const photoFile = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      const uri = `file://${photoFile.filePath}`;
      await handlePicked(uri, 'camera');
    } catch (e) {
      setError(e instanceof Error ? e.message : '拍摄失败，请再试一次');
    } finally {
      setShooting(false);
    }
  }, [
    shooting,
    loading,
    hasPermission,
    requestPermission,
    device,
    photoOutput,
    handlePicked,
  ]);

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

  let statusCopy: string;
  let statusMark: 'check' | 'warn' | 'close' | 'spinner';
  let statusError = false;
  if (error) {
    statusCopy = error;
    statusMark = 'close';
    statusError = true;
  } else if (loading || shooting) {
    statusCopy = '正在准备照片…';
    statusMark = 'spinner';
  } else if (!device) {
    statusCopy = '相机启动中…';
    statusMark = 'spinner';
  } else {
    statusCopy = '让鱼身保持完整，识别更准确';
    statusMark = 'check';
  }

  return (
    <View style={styles.screen}>
      {/* 实时取景背景（权限就绪后自动出画面） */}
      {device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          outputs={[photoOutput]}
          isActive={cameraEnabled && hasPermission}
          onError={(e) => {
            if (!error) {
              setError(e.message || '相机出错，请重新进入页面');
            }
          }}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.bgScrim]} pointerEvents="none" />

      {/* 取景区：写实鱼形轮廓 + 框下引导文案 */}
      <View style={styles.viewfinder}>
        <View style={styles.frameWrap}>
          <FishScanFrame width={Math.min(windowWidth * 0.88, 400)} />
          <View style={styles.frameCopy}>
            <Text style={styles.headline}>拍下整条鱼</Text>
            <View style={styles.statusRow}>
              {statusMark === 'spinner' ? (
                <ActivityIndicator size="small" color="#F4F8F7" />
              ) : (
                <View style={[styles.statusDot, statusError && styles.statusDotError]}>
                  {statusMark === 'check' ? (
                    <Icon name="checkmark" size={10} color="#FFFFFF" />
                  ) : statusMark === 'close' ? (
                    <Icon name="close" size={9} color="#FFFFFF" />
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

      {/* 底部：简化白环快门水平居中，相册按钮在其右侧 */}
      <View
        style={[styles.dock, { bottom: insets.bottom + spacing.md }]}
        pointerEvents="box-none"
      >
        <PressableScale
          onPress={shoot}
          disabled={loading || shooting}
          scaleTo={0.9}
          style={[styles.dockItem, styles.shutterItem]}
          accessibilityLabel="拍照识别"
          accessibilityRole="button"
        >
          <View style={styles.shutter}>
            <View style={styles.shutterCore} />
          </View>
        </PressableScale>
        <PressableScale
          onPress={openGallery}
          disabled={loading}
          scaleTo={0.9}
          style={[styles.dockItem, styles.albumItem]}
          accessibilityLabel="从相册选择照片"
          accessibilityRole="button"
        >
          <View style={styles.albumBtn}>
            <Icon name="images-outline" size={22} color="#F6FAF8" />
          </View>
        </PressableScale>
      </View>

      {/* 首次相机权限引导（自有说明 Sheet → 继续 → 系统权限弹窗） */}
      <BottomSheet
        visible={permSheet}
        onClose={() => setPermSheet(false)}
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
            const granted = await requestPermission();
            if (!granted) {
              setError('需要相机权限才能拍照，也可以从右下角选择相册照片');
            }
          }}
        />
        <PrimaryButton
          label="先不用"
          variant="ghost"
          onPress={() => setPermSheet(false)}
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
    backgroundColor: 'rgba(8,24,30,0.18)',
  } as ViewStyle,
  viewfinder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: DOCK_HEIGHT + spacing.xl,
  } as ViewStyle,
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  frameCopy: {
    alignItems: 'center',
    marginTop: spacing.xl,
  } as ViewStyle,
  headline: {
    color: '#FDFEFD',
    fontFamily: font.serif,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 1.5,
    ...shadowText,
  } as TextStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    maxWidth: 220,
  } as ViewStyle,
  statusDot: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
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
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  } as TextStyle,
  statusText: {
    flexShrink: 1,
    color: 'rgba(251,253,252,0.92)',
    fontSize: typeScale.caption,
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
  /** 快门整圆中心对准屏幕水平中线 */
  shutterItem: {
    left: '50%',
    marginLeft: -SHUTTER_SIZE / 2,
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
  } as ViewStyle,
  /** 相册按钮：与快门保持明显间距，垂直居中对齐 */
  albumItem: {
    left: '50%',
    marginLeft: SHUTTER_SIZE / 2 + spacing.xxl + 8,
    top: (DOCK_HEIGHT - ALBUM_SIZE) / 2,
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
  } as ViewStyle,
  /** 简化快门：白色细环 + 实心白芯 */
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(253,254,253,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  shutterCore: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#FDFEFD',
  } as ViewStyle,
  /** 相册按钮：半透明深色圆底 + 细白描边 */
  albumBtn: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: ALBUM_SIZE / 2,
    backgroundColor: 'rgba(10,26,32,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
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
