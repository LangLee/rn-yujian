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
import { AppIcon } from '../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { RouteProp } from '@react-navigation/native';
import { useRecognition } from '../contexts/RecognitionContext';
import { recognitionService } from '../services/recognitionService';
import { SelectedImageMeta } from '../types/models';
import { GUIDE_FRAME, ViewfinderCornerMarks } from '../components/ViewfinderCornerMarks';
import { RulerGlyph } from '../components/RulerGlyph';
import { RulerMeasureLayer } from '../components/RulerMeasureLayer';
import { ARMeasureLayer } from '../components/ARMeasureLayer';
import { arMeasure } from '../native/arMeasure';
import { BottomSheet } from '../components/ui/BottomSheet';
import { FirstUseCameraGuide } from '../components/FirstUseCameraGuide';
import { PressableScale } from '../components/ui/PressableScale';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { palette } from '../constants/colors';
import { fs, spacing, typeScale } from '../constants/tokens';
import { haptics } from '../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

type IdentifyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Identify'>;
type IdentifyScreenRouteProp = RouteProp<RootStackParamList, 'Identify'>;

const CAMERA_PERM_SEEN_KEY = '@yujian/perm_camera_seen';
/** 首次拍照教学完成态：仅在用户真实关闭教学（跳过 / 开始拍摄）后写入 */
const FIRST_USE_GUIDE_KEY = '@yujian/first_use_camera_guide_done';

/** 底部快门与相册按钮（简化版：快门水平居中，相册在其右侧）。 */
const SHUTTER_SIZE = 74;
const SHUTTER_INNER = 56;
const ALBUM_SIZE = 46;
const DOCK_HEIGHT = SHUTTER_SIZE;

/** 量尺入口暂时下线：隐藏 dock 上的测距按钮（量尺代码保留，恢复入口改回 true） */
const RULER_ENABLED = false;

/**
 * P02 拍照识鱼（自定义相机页）：
 * 全屏实时取景（react-native-vision-camera）+ 四角取景范围线（与首次教学 Hero 同款）；
 * 底部为简化的白环快门 + 半透明相册图标按钮。
 * 拍照后立即进入 P03（识别过程的边缘光晕动效见 RecognizingScreen / AIAmbientField）。
 * 取景过程不获取位置：钓点在识别成功后的结果页选择地点时才申请定位权限并自动定位。
 */
export const IdentifyScreen: React.FC = () => {
  const navigation = useNavigation<IdentifyScreenNavigationProp>();
  const route = useRoute<IdentifyScreenRouteProp>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { selectImage, reset } = useRecognition();
  const insets = useSafeAreaInsets();

  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'quality' });
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();

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
  /** AR 浮层使用的引擎：arcore（GMS）| huawei（华为/荣耀 AR Engine） */
  const [arEngine, setArEngine] = useState<'arcore' | 'huawei'>('arcore');
  const [measuredCm, setMeasuredCm] = useState<number | null>(null);
  /** 关闭相机权限说明 Sheet */
  const closePermSheet = useCallback(() => {
    setPermSheet(false);
  }, []);

  // 进入 P02 时清理上一条流程的残留状态
  useEffect(() => {
    reset();
    // 进入取景页即预热端侧模型（detector/classifier + SAM 轮廓分割会话）：
    // 首次识别不再承担 1-2s 冷启动，识别与 SAM 分割都不至于错过动效截止
    recognitionService.warmup().catch(() => {
      // 预热失败不阻塞取景（如模型资产缺失），识别时再报具体错误
    });
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 离开页面时停用相机，回到页面再恢复取景；旧测量值随流程一起作废
  useFocusEffect(
    useCallback(() => {
      setCameraEnabled(true);
      return () => {
        setCameraEnabled(false);
        setMeasuredCm(null);
        setRulerMode('off');
      };
    }, []),
  );

  // 进入取景页就补上相机权限请求：没授权时取景一直黑屏，等用户按快门再问就晚了。
  // 首次启动先出自有说明 Sheet，之后再直接弹系统权限弹窗。
  useEffect(() => {
    if (hasPermission || !canRequestPermission) {
      return;
    }
    if (permAskedRef.current || permSheet) {
      return;
    }
    permAskedRef.current = true;
    void (async () => {
      const seen = await AsyncStorage.getItem(CAMERA_PERM_SEEN_KEY);
      if (!seen) {
        setPermSheet(true);
        return;
      }
      try {
        await requestPermission();
      } finally {
        // 系统弹窗结束即可，无需其他收尾
      }
    })();
  }, [hasPermission, canRequestPermission, requestPermission, permSheet]);

  /**
   * 首次拍照教学（First-use Camera Guide V1）：
   * 相机权限已授 + 取景设备就绪后展示一次；教学是全屏 Modal，天然阻断快门穿透。
   * 未完成（中途杀进程等）不写完成态，下次进入取景页还会再教。
   */
  const [firstUseGuide, setFirstUseGuide] = useState(false);
  const firstUseGuideCheckedRef = useRef(false);
  useEffect(() => {
    if (!hasPermission || !device || firstUseGuideCheckedRef.current) {
      return;
    }
    firstUseGuideCheckedRef.current = true;
    void (async () => {
      const done = await AsyncStorage.getItem(FIRST_USE_GUIDE_KEY);
      if (!done) {
        setFirstUseGuide(true);
      }
    })();
  }, [hasPermission, device]);
  /** 教学被真实关闭（跳过 / 开始拍摄 / 返回键）：写完成态，不触发快门 */
  const finishFirstUseGuide = useCallback(() => {
    setFirstUseGuide(false);
    AsyncStorage.setItem(FIRST_USE_GUIDE_KEY, '1').catch(() => undefined);
  }, []);

  // 识别页异常退回时带回原因（Recognizing catch → navigate Identify { error })
  useEffect(() => {
    if (route.params?.error) {
      setError(route.params.error);
      navigation.setParams({ error: undefined });
    }
  }, [route.params?.error, navigation]);

  // 空首页「从相册选择」入口：进入后自动拉起既有相册选择（不新建第二套 Picker）
  const albumPromptedRef = useRef(false);
  const openGalleryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!route.params?.openAlbum || albumPromptedRef.current) {
      return;
    }
    albumPromptedRef.current = true;
    navigation.setParams({ openAlbum: undefined });
    const t = setTimeout(() => openGalleryRef.current?.(), 350);
    return () => clearTimeout(t);
  }, [route.params?.openAlbum, navigation]);

  const handlePicked = useCallback(
    async (uri: string, source: 'camera' | 'gallery') => {
      setLoading(true);
      setError(null);
      try {
        const meta = await recognitionService.normalizeImage(uri, source);
        // 量尺测得的长度只对本次取景的相机拍摄有效，相册照片不携带；
        // 钓点不再随取景获取：由结果页选择地点时按需申请定位并填入
        const extras: Partial<SelectedImageMeta> = {};
        if (source === 'camera' && measuredCm && measuredCm > 0) {
          extras.measuredLengthCm = measuredCm;
        }
        selectImage(Object.keys(extras).length > 0 ? { ...meta, ...extras } : meta);
        // 拍照后立即进入 P03；照片尚未识别，不假装已完成
        navigation.navigate('Recognizing');
      } catch (e) {
        setError(e instanceof Error ? e.message : '照片读取失败，请再试一次');
      } finally {
        setLoading(false);
      }
    },
    [selectImage, navigation, measuredCm],
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
        if (!canRequestPermission) {
          // 已被系统标记为不再询问：弹窗弹不出来，只能去系统设置里手动开
          Alert.alert(
            '开启相机权限',
            '拍照识鱼需要相机权限，且你已选择不再询问。请到「系统设置 → 渔见 → 相机」中改为允许。',
            [
              { text: '取消', style: 'cancel' },
              { text: '去系统设置', onPress: () => void Linking.openSettings() },
            ],
          );
        } else {
          setError('需要相机权限才能拍照，也可以从右下角选择相册照片');
        }
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
    canRequestPermission,
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
  openGalleryRef.current = openGallery;

  /** 当前量尺模式镜像（异步探测完成后校验期间是否已被关闭） */
  const rulerModeRef = useRef<'off' | 'ar' | 'manual'>('off');
  rulerModeRef.current = rulerMode;
  const rulerProbingRef = useRef(false);

  /**
   * 量尺开关：优先 AR 自动量尺（GMS 设备走 ARCore，华为/荣耀走 AR Engine），
   * 不可用时回落手动校准量尺；'installable' 触发一次引擎安装引导。
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
      const { level, engine } = await arMeasure.probeSupport();
      if (rulerModeRef.current !== 'off') {
        return;
      }
      if (level === 'supported' && engine) {
        setArEngine(engine);
        setRulerMode('ar');
        return;
      }
      if (level === 'installable' && engine) {
        const ready = await arMeasure.requestInstall(engine);
        if (rulerModeRef.current !== 'off') {
          return;
        }
        if (ready) {
          setArEngine(engine);
          setRulerMode('ar');
        } else {
          setRulerMode('manual');
        }
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
    if (reason === 'engine_not_installed') {
      setError('当前系统未提供 AR 引擎，已切换手动量尺');
    } else if (reason === 'engine_too_old') {
      setError('AR 引擎版本过旧，可在系统更新后重试；已切换手动量尺');
    } else if (reason === 'unsupported_device') {
      setError('此设备不支持 AR 量尺，已切换手动量尺');
    } else if (reason) {
      setError('AR 量尺启动失败，已切换手动量尺');
    }
  }, []);

  /**
   * 状态行只在需要反馈时出现（错误 / 准备中 / 权限 / 量尺）；
   * 取景就绪的常态不展示任何引导文案——拍摄教学已由首次引导浮层承担。
   */
  let statusCopy: string | null;
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
  } else if (!hasPermission) {
    statusCopy = '未开启相机权限，点击快门去开启';
    statusMark = 'warn';
  } else if (rulerProbing) {
    statusCopy = '正在检查 AR 量尺支持…';
    statusMark = 'spinner';
  } else if (rulerMode !== 'off') {
    statusCopy = measuredCm ? `已测量 ${measuredCm.toFixed(1)} cm，拍照后自动填入` : '量好长度再拍照，识别后自动填入';
    statusMark = 'check';
  } else {
    statusCopy = null;
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
          /* Android 默认 performance 模式是 SurfaceView，在窗口上挖洞且不参与 RN 合成；
             跳转识别页停用相机时洞里露出的是 Activity 白色窗口背景（一闪而过的白蒙版）。
             compatible 模式用 TextureView，停流时露出的是本页深色背景。 */
          implementationMode="compatible"
          onError={(e) => {
            if (!error) {
              setError(e.message || '相机出错，请重新进入页面');
            }
          }}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.bgScrim]} pointerEvents="none" />

      {/* 取景区：四角取景范围线，与首次教学引导页同款同几何（GUIDE_FRAME 冻结稿比例：
          顶 198/1672 屏高、宽 826/941 屏宽、高 570/1672 屏高，白色 L 角标臂长 5.8% 外挑框边）；
          常态无文案，仅异常/进行中状态在框下出现状态行。
          首次教学浮层显示期间整块隐藏——教学层用整页背景照片 + 同款同位置框线自绘取景框。 */}
      {!firstUseGuide ? (
      <View style={[styles.viewfinder, { paddingTop: Math.round(GUIDE_FRAME.topRatio * windowHeight) }]}>
        <View style={styles.frameWrap}>
          <ViewfinderCornerMarks
            width={GUIDE_FRAME.widthRatio * windowWidth}
            height={GUIDE_FRAME.heightRatio * windowHeight}
          />
          {statusCopy ? (
            <View style={styles.frameCopy}>
              <View style={styles.statusRow}>
                {statusMark === 'spinner' ? (
                  <ActivityIndicator size="small" color="#F4F8F7" />
                ) : (
                  <View style={[styles.statusDot, statusError && styles.statusDotError]}>
                    {statusMark === 'check' ? (
                      <AppIcon name="check" size={10} color="#FFFFFF" />
                    ) : statusMark === 'close' ? (
                      <AppIcon name="close" size={9} color="#FFFFFF" />
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
          ) : null}
        </View>
      </View>
      ) : null}

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
        {RULER_ENABLED ? (
          <PressableScale
            onPress={toggleRuler}
            disabled={loading || rulerProbing}
            scaleTo={0.9}
            style={[styles.dockItem, styles.rulerItem]}
            accessibilityLabel={rulerMode !== 'off' ? '关闭量尺' : '打开量尺'}
            accessibilityRole="button"
          >
            <View style={[styles.albumBtn, rulerMode !== 'off' && styles.rulerBtnActive]}>
              {rulerProbing ? (
                <ActivityIndicator size="small" color="#EAD9AE" />
              ) : (
                <RulerGlyph size={22} color={rulerMode !== 'off' ? '#EAD9AE' : '#F6FAF8'} />
              )}
            </View>
            {measuredCm ? <View style={styles.rulerDot} /> : null}
          </PressableScale>
        ) : null}
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
            <AppIcon name="gallery" size={22} color="#F6FAF8" />
          </View>
        </PressableScale>
      </View>

      {/* AR 自动量尺全屏浮层：接管相机（VisionCamera 已停用），盖住 dock */}
      {rulerMode === 'ar' ? (
        <ARMeasureLayer
          engine={arEngine}
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
        onClose={closePermSheet}
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
          onPress={closePermSheet}
          style={styles.permSecondary}
        />
      </BottomSheet>

      {/* 首次拍照教学（两页：竖屏横鱼 / 竖拍竖鱼，横屏教学页已移除），关闭前阻断拍照操作 */}
      <FirstUseCameraGuide visible={firstUseGuide} onFinish={finishFirstUseGuide} />
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
    /* 顶部锚定：取景框顶按 GUIDE_FRAME 冻结比例（y198/1672 ≈ 11.8% 屏高，
       内联 paddingTop），与首次教学引导页示范框同一视觉位置 */
    justifyContent: 'flex-start',
  } as ViewStyle,
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  frameCopy: {
    alignItems: 'center',
    marginTop: spacing.xl,
  } as ViewStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
