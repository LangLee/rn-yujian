import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { usePreferences } from '../contexts/PreferencesContext';
import { recognitionService } from '../services/recognitionService';
import {
  LocationPermissionStatus,
  locationService,
  precisionRequiresLocation,
} from '../services/locationService';
import { locationPickerHub } from '../utils/locationPickerHub';
import { CatchLocation, SelectedImageMeta } from '../types/models';
import { FishScanFrame } from '../components/FishScanFrame';
import { RulerGlyph } from '../components/RulerGlyph';
import { RulerMeasureLayer } from '../components/RulerMeasureLayer';
import { ARMeasureLayer } from '../components/ARMeasureLayer';
import { arMeasure } from '../native/arMeasure';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PressableScale } from '../components/ui/PressableScale';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { palette } from '../constants/colors';
import { font, fs, spacing, typeScale } from '../constants/tokens';
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
  const { privacy } = usePreferences();
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
  /**
   * 量尺模式：'ar' = AR 自动量尺（ARCore 接管相机），'manual' = 手动校准量尺，
   * 'off' = 关闭。测得长度随快门写入识别流程。
   */
  const [rulerMode, setRulerMode] = useState<'off' | 'ar' | 'manual'>('off');
  const [rulerProbing, setRulerProbing] = useState(false);
  const [measuredCm, setMeasuredCm] = useState<number | null>(null);
  /**
   * 钓点：进入取景页按隐私设置自动定位（'none' 不记录），也可点角标在地图上手动选点。
   * 随快门写入识别流程，与量尺长度一样只对相机拍摄有效。
   */
  const [spotLocation, setSpotLocation] = useState<CatchLocation | null>(null);
  const [locating, setLocating] = useState(false);
  /** 用户手动选点后本次取景期间不被自动定位覆盖 */
  const spotManualRef = useRef(false);
  /** 定位权限状态：驱动「未开启定位 · 点击开启」角标与引导弹层 */
  const [locPerm, setLocPerm] = useState<LocationPermissionStatus>('unavailable');
  const [locPermSheet, setLocPermSheet] = useState(false);
  /** 每次挂载只自动提示一次，避免每次回到取景页都被打断 */
  const locPermPromptedRef = useRef(false);

  // 进入 P02 时清理上一条流程的残留状态
  useEffect(() => {
    reset();
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 定位权限引导：未授权（可再弹）→ 应用内说明 Sheet；
   * 已被永久拒绝 → Alert 引导去系统设置。
   */
  const promptLocationPermission = useCallback((status: LocationPermissionStatus) => {
    if (status === 'blocked') {
      Alert.alert(
        '开启定位权限',
        '记录钓点位置需要定位权限，且你已选择不再询问。请到「系统设置 → 渔见 → 位置」中改为「仅使用期间允许」。',
        [
          { text: '取消', style: 'cancel' },
          { text: '去系统设置', onPress: () => void Linking.openSettings() },
        ],
      );
    } else if (status === 'denied') {
      setLocPermSheet(true);
    }
  }, []);

  /** 静默自动定位；要用定位但权限未开时，主动提示去开启（每次挂载只自动提示一次） */
  const refreshSpotLocation = useCallback(async () => {
    if (!precisionRequiresLocation(privacy.recordPrecision)) {
      setSpotLocation(null);
      return;
    }
    if (spotManualRef.current) {
      return;
    }
    const status = await locationService.getPermissionStatus();
    setLocPerm(status);
    if (status !== 'granted') {
      setSpotLocation(null);
      if (!locPermPromptedRef.current) {
        locPermPromptedRef.current = true;
        promptLocationPermission(status);
      }
      return;
    }
    setLocating(true);
    try {
      const resolved = await locationService.resolveCurrentLocation(
        privacy.recordPrecision === 'waterbody_county' ? 'waterbody_county' : 'precise',
      );
      if (!spotManualRef.current) {
        setSpotLocation(resolved);
      }
    } finally {
      setLocating(false);
    }
  }, [privacy.recordPrecision, promptLocationPermission]);

  /** 定位说明 Sheet「开启定位」→ 系统权限弹窗；永久拒绝 → 引导去系统设置 */
  const continueLocationPermission = useCallback(async () => {
    setLocPermSheet(false);
    const result = await locationService.requestPermission();
    if (result === 'granted') {
      haptics.confirm();
      setLocPerm('granted');
      await refreshSpotLocation();
    } else {
      setLocPerm(result);
      if (result === 'blocked') {
        promptLocationPermission('blocked');
      }
    }
  }, [refreshSpotLocation, promptLocationPermission]);

  // 离开页面时停用相机，回到页面再恢复取景；旧测量值随流程一起作废
  useFocusEffect(
    useCallback(() => {
      setCameraEnabled(true);
      void refreshSpotLocation();
      return () => {
        setCameraEnabled(false);
        setMeasuredCm(null);
        setRulerMode('off');
      };
    }, [refreshSpotLocation]),
  );

  // 识别页异常退回时带回原因（Recognizing catch → navigate Identify { error }）
  useEffect(() => {
    if (route.params?.error) {
      setError(route.params.error);
      navigation.setParams({ error: undefined });
    }
  }, [route.params?.error, navigation]);

  /** 地图选点：返回后覆盖自动定位结果，且本次取景期间不再自动刷新 */
  const openLocationPicker = useCallback(async () => {
    if (!privacy.manualLocationEdit) {
      return;
    }
    haptics.selection();
    navigation.navigate('LocationPicker', {
      initial: spotLocation
        ? { latitude: spotLocation.latitude, longitude: spotLocation.longitude }
        : undefined,
    });
    const picked = await locationPickerHub.requestPick();
    if (picked) {
      spotManualRef.current = true;
      setSpotLocation(picked);
    }
  }, [privacy.manualLocationEdit, navigation, spotLocation]);

  const handlePicked = useCallback(
    async (uri: string, source: 'camera' | 'gallery') => {
      setLoading(true);
      setError(null);
      try {
        const meta = await recognitionService.normalizeImage(uri, source);
        // 量尺测得的长度与钓点只对本次取景的相机拍摄有效，相册照片不携带
        const extras: Partial<SelectedImageMeta> = {};
        if (source === 'camera') {
          if (measuredCm && measuredCm > 0) {
            extras.measuredLengthCm = measuredCm;
          }
          if (spotLocation) {
            extras.location = spotLocation;
          }
        }
        selectImage(Object.keys(extras).length > 0 ? { ...meta, ...extras } : meta);
        // 钓点已随照片消费：回到本页拍摄下一条时重新自动定位
        spotManualRef.current = false;
        setSpotLocation(null);
        // 拍照后立即进入 P03；照片尚未识别，不假装已完成
        navigation.navigate('Recognizing');
      } catch (e) {
        setError(e instanceof Error ? e.message : '照片读取失败，请再试一次');
      } finally {
        setLoading(false);
      }
    },
    [selectImage, navigation, measuredCm, spotLocation],
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

  /** 当前量尺模式镜像（异步探测完成后校验期间是否已被关闭） */
  const rulerModeRef = useRef<'off' | 'ar' | 'manual'>('off');
  rulerModeRef.current = rulerMode;
  const rulerProbingRef = useRef(false);

  /**
   * 量尺开关：优先 AR 自动量尺（ARCore），不可用时回落手动校准量尺。
   * 'installable' 设备触发一次 ARCore 安装引导，未就绪则先进手动量尺。
   */
  const toggleRuler = useCallback(async () => {
    haptics.selection();
    if (rulerModeRef.current !== 'off' || rulerProbingRef.current) {
      setRulerMode('off');
      return;
    }
    rulerProbingRef.current = true;
    setRulerProbing(true);
    try {
      const support = await arMeasure.probeSupport();
      if (rulerModeRef.current !== 'off') {
        return;
      }
      if (support === 'supported') {
        setRulerMode('ar');
        return;
      }
      if (support === 'installable') {
        const ready = await arMeasure.requestInstall();
        if (rulerModeRef.current !== 'off') {
          return;
        }
        setRulerMode(ready ? 'ar' : 'manual');
        return;
      }
      setRulerMode('manual');
    } finally {
      rulerProbingRef.current = false;
      setRulerProbing(false);
    }
  }, []);

  /** AR 会话失败 / 用户改用：回落手动量尺（reason 用于状态文案） */
  const fallbackToManualRuler = useCallback((reason?: string) => {
    setRulerMode('manual');
    if (reason === 'arcore_not_installed') {
      setError('ARCore 未安装，已切换手动量尺');
    } else if (reason === 'unsupported_device') {
      setError('此设备不支持 AR 量尺，已切换手动量尺');
    } else if (reason) {
      setError('AR 量尺启动失败，已切换手动量尺');
    }
  }, []);

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
  } else if (rulerProbing) {
    statusCopy = '正在检查 AR 量尺支持…';
    statusMark = 'spinner';
  } else if (rulerMode !== 'off') {
    statusCopy = measuredCm ? `已测量 ${measuredCm.toFixed(1)} cm，拍照后自动填入` : '量好长度再拍照，识别后自动填入';
    statusMark = 'check';
  } else {
    statusCopy = '让鱼身保持完整，识别更准确';
    statusMark = 'check';
  }

  return (
    <View style={styles.screen}>
      {/* 实时取景背景（权限就绪后自动出画面）；
          AR 量尺期间停用 VisionCamera，把相机让给 ARCore */}
      {device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          outputs={[photoOutput]}
          isActive={cameraEnabled && hasPermission && rulerMode !== 'ar'}
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
            {/* 钓点角标：自动定位结果 / 权限引导 / 地图选点入口（隐私设置为不记录位置时隐藏） */}
            {privacy.recordPrecision !== 'none' ? (
              <PressableScale
                onPress={() => {
                  if (!spotLocation && (locPerm === 'denied' || locPerm === 'blocked')) {
                    // 主动点击永远给引导（不受「每次挂载只提示一次」限制）
                    promptLocationPermission(locPerm);
                    return;
                  }
                  void openLocationPicker();
                }}
                disabled={locating || (!privacy.manualLocationEdit && !!spotLocation)}
                scaleTo={0.96}
                style={styles.locPillHit}
                accessibilityLabel={
                  !spotLocation && (locPerm === 'denied' || locPerm === 'blocked')
                    ? '开启定位权限'
                    : '地图选择钓点'
                }
                accessibilityRole="button"
              >
                <View style={styles.locPill} pointerEvents="none">
                  {locating ? (
                    <ActivityIndicator size="small" color="#EAD9AE" />
                  ) : (
                    <Icon name="location-outline" size={12} color="#EAD9AE" />
                  )}
                  <Text style={styles.locPillText} numberOfLines={1}>
                    {spotLocation
                      ? spotLocation.label
                      : locating
                        ? '正在获取钓点…'
                        : locPerm === 'denied' || locPerm === 'blocked'
                          ? '未开启定位 · 点击开启'
                          : '未定位 · 点击选择钓点'}
                  </Text>
                  {spotLocation && privacy.manualLocationEdit ? (
                    <Icon name="chevron-forward" size={11} color="rgba(251,253,252,0.7)" />
                  ) : null}
                </View>
              </PressableScale>
            ) : null}
          </View>
        </View>
      </View>

      {/* 手动量尺覆盖层：置于 dock 之下，快门 / 相册 / 量尺开关仍可点 */}
      {rulerMode === 'manual' ? (
        <RulerMeasureLayer
          toolbarBottom={insets.bottom + spacing.xl + 12 + DOCK_HEIGHT + 14}
          onMeasuredChange={setMeasuredCm}
        />
      ) : null}

      {/* 底部：简化白环快门水平居中，相册按钮在右侧、量尺开关在左侧（垂直位置与主页拍照按钮对齐） */}
      <View
        style={[styles.dock, { bottom: insets.bottom + spacing.xl + 12 }]}
        pointerEvents="box-none"
      >
        <PressableScale
          onPress={toggleRuler}
          disabled={loading || rulerProbing}
          scaleTo={0.9}
          style={[styles.dockItem, styles.rulerItem]}
          accessibilityLabel={rulerMode !== 'off' ? '关闭量尺' : '打开量尺'}
          accessibilityRole="button"
        >
          <View style={[styles.albumBtn, rulerMode === 'manual' && styles.rulerBtnActive]}>
            {rulerProbing ? (
              <ActivityIndicator size="small" color="#EAD9AE" />
            ) : (
              <RulerGlyph size={22} color={rulerMode !== 'off' ? '#EAD9AE' : '#F6FAF8'} />
            )}
          </View>
          {measuredCm ? <View style={styles.rulerDot} /> : null}
        </PressableScale>
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

      {/* AR 自动量尺全屏浮层：接管相机（VisionCamera 已停用），盖住 dock */}
      {rulerMode === 'ar' ? (
        <ARMeasureLayer
          onMeasured={(cm) => {
            setMeasuredCm(cm);
            setRulerMode('off');
          }}
          onFallbackManual={fallbackToManualRuler}
          onClose={() => setRulerMode('off')}
        />
      ) : null}

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

      {/* 要用定位但权限未开：应用内说明 → 系统权限弹窗；永久拒绝 → 去系统设置 */}
      <BottomSheet
        visible={locPermSheet}
        onClose={() => setLocPermSheet(false)}
        title="使用定位"
      >
        <Text style={styles.permText}>
          开启定位后，拍照识鱼时会自动记录这条鱼获的钓点。渔见只在使用期间读取一次位置，不会在后台持续定位；也可以随时在「隐私与定位」中改为不记录位置。
        </Text>
        <PrimaryButton
          label="开启定位"
          onPress={() => void continueLocationPermission()}
        />
        <PrimaryButton
          label="暂不"
          variant="ghost"
          onPress={() => setLocPermSheet(false)}
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
    paddingBottom: DOCK_HEIGHT + spacing.xl + 20,
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
    fontSize: fs(17),
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
    fontSize: fs(10),
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  } as TextStyle,
  statusText: {
    flexShrink: 1,
    color: 'rgba(251,253,252,0.92)',
    fontSize: fs(typeScale.caption),
    ...shadowText,
  } as TextStyle,
  statusTextError: {
    color: '#F3C7BD',
  } as TextStyle,
  locPillHit: {
    marginTop: spacing.md,
    borderRadius: 15,
  } as ViewStyle,
  locPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: 'rgba(10,26,32,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    maxWidth: 230,
  } as ViewStyle,
  locPillText: {
    color: 'rgba(251,253,252,0.92)',
    fontSize: fs(typeScale.caption),
    maxWidth: 170,
    ...shadowText,
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
  /** 量尺开关：与相册按钮对称，位于快门左侧 */
  rulerItem: {
    left: '50%',
    marginLeft: -(SHUTTER_SIZE / 2 + spacing.xxl + 8 + ALBUM_SIZE),
    top: (DOCK_HEIGHT - ALBUM_SIZE) / 2,
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
  } as ViewStyle,
  /** 量尺激活态：金色描边点亮 */
  rulerBtnActive: {
    borderColor: 'rgba(217,175,105,0.85)',
    backgroundColor: 'rgba(201,169,106,0.24)',
  } as ViewStyle,
  /** 已有测量值的小金点（右上角），提示长度将随照片带上 */
  rulerDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: palette.accentGold,
    borderWidth: 1.5,
    borderColor: 'rgba(11,42,49,0.9)',
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
    fontSize: fs(typeScale.body),
    lineHeight: 24,
    marginBottom: spacing.lg,
  } as TextStyle,
  permSecondary: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
