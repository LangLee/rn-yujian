/**
 * ARMeasureLayer —— AR 自动量尺全屏浮层。
 *
 * 原生 YujianARMeasureView（ARCore / 华为 AR Engine）接管相机背景与水平面检测；
 * 本层只做交互与展示：检测到平面后「点击鱼头 → 拖动实时预览 → 点击鱼尾」，
 * 两个屏幕点经原生 hitTest 得到 AR 世界坐标（米），自动算出真实长度，
 * 测线与长度标签用 react-native-svg / RN 绘制（与手动量尺同款视觉）。
 *
 * 与 VisionCamera 分时复用相机：本浮层挂载期间父级应停用 VisionCamera；
 * 关闭（完成测量 / 右上角 × / 会话失败回落）后由父级恢复取景。
 * 会话失败（无引擎、相机被占等）通过 onFallbackManual 回落手动量尺。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  requireNativeComponent,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { PressableScale } from './ui/PressableScale';
import { PrimaryButton } from './ui/PrimaryButton';
import { RulerGlyph } from './RulerGlyph';
import { MeasureLine, MeasureLineOverlay } from './measure/MeasureLineOverlay';
import { arMeasure } from '../native/arMeasure';
import { palette } from '../constants/colors';
import { font, fs, spacing, typeScale } from '../constants/tokens';
import { haptics } from '../utils/haptics';

interface ARNativeViewProps {
  style?: ViewStyle;
  testID?: string;
  /** 'arcore'（GMS）| 'huawei'（华为/荣耀 AR Engine），决定原生挂载的引擎 */
  engine?: string;
  onPlaneDetected?: (event: { nativeEvent: Record<string, never> }) => void;
  onSessionError?: (event: { nativeEvent: { reason: string } }) => void;
}

// 原生 legacy ViewManager 经新架构 interop 暴露（jest 中由 setup mock 兜底）
const ARMeasureViewNative =
  requireNativeComponent<ARNativeViewProps>('YujianARMeasureView');

/** hitTest 返回的世界坐标（米） */
interface WorldPoint {
  x: number;
  y: number;
  z: number;
  plane: boolean;
}

interface MeasureAnchor {
  screen: { x: number; y: number };
  world: WorldPoint;
}

/** 预览拖动时 hitTest 的节流间隔 */
const LIVE_HIT_INTERVAL_MS = 120;

const worldDistanceCm = (a: WorldPoint, b: WorldPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 100;

interface ARMeasureLayerProps {
  /** 使用哪个引擎：arcore（GMS）| huawei（华为/荣耀 AR Engine） */
  engine: 'arcore' | 'huawei';
  /** 用户确认测量结果 */
  onMeasured: (cm: number) => void;
  /** AR 不可用 / 会话失败 / 用户主动改用：回落手动量尺 */
  onFallbackManual: (reason?: string) => void;
  /** 右上角关闭 */
  onClose: () => void;
}

export const ARMeasureLayer: React.FC<ARMeasureLayerProps> = ({
  engine,
  onMeasured,
  onFallbackManual,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [phase, setPhase] = useState<'scanning' | 'ready' | 'measuring' | 'done'>('scanning');
  const [pointA, setPointA] = useState<MeasureAnchor | null>(null);
  const [previewB, setPreviewB] = useState<MeasureAnchor | null>(null);
  const [confirmedB, setConfirmedB] = useState<MeasureAnchor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastHitAtRef = useRef(0);
  const [measuredCm, setMeasuredCm] = useState<number | null>(null);

  // notice 自动消退
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const handlePlaneDetected = useCallback(() => {
    setPhase((prev) => (prev === 'scanning' ? 'ready' : prev));
    haptics.selection();
  }, []);

  const handleSessionError = useCallback(
    (event: { nativeEvent: { reason: string } }) => {
      onFallbackManual(event.nativeEvent?.reason);
    },
    [onFallbackManual],
  );

  const pointFromEvent = (e: GestureResponderEvent): { x: number; y: number } => ({
    x: e.nativeEvent.pageX,
    y: e.nativeEvent.pageY,
  });

  /** 屏幕点 → AR 世界点；未命中平面返回 null 并提示 */
  const hitTestAt = async (x: number, y: number): Promise<WorldPoint | null> => {
    try {
      const world = await arMeasure.hitTest(x, y);
      if (!world) {
        setNotice('没对准平面，再点一次');
        return null;
      }
      return world;
    } catch {
      setNotice('AR 未就绪，稍等一下再点');
      return null;
    }
  };

  const handleTap = async (e: GestureResponderEvent) => {
    const p = pointFromEvent(e);
    if (phase === 'ready') {
      const world = await hitTestAt(p.x, p.y);
      if (!world) {
        return;
      }
      haptics.selection();
      setPointA({ screen: p, world });
      setPreviewB(null);
      setConfirmedB(null);
      setPhase('measuring');
      return;
    }
    if (phase === 'measuring') {
      const world = await hitTestAt(p.x, p.y);
      if (!world || !pointA) {
        return;
      }
      haptics.confirm();
      setConfirmedB({ screen: p, world });
      setMeasuredCm(worldDistanceCm(pointA.world, world));
      setPhase('done');
    }
  };

  /** measuring 阶段：拖动实时预览（节流 hitTest） */
  const handleMove = async (e: GestureResponderEvent) => {
    if (phase !== 'measuring') {
      return;
    }
    const now = Date.now();
    if (now - lastHitAtRef.current < LIVE_HIT_INTERVAL_MS) {
      return;
    }
    lastHitAtRef.current = now;
    const p = pointFromEvent(e);
    try {
      const world = await arMeasure.hitTest(p.x, p.y);
      if (world) {
        setPreviewB({ screen: p, world });
      }
    } catch {
      // 预览失败静默：保持上一帧
    }
  };

  const resetMeasure = () => {
    haptics.selection();
    setPointA(null);
    setPreviewB(null);
    setConfirmedB(null);
    setMeasuredCm(null);
    setPhase('ready');
  };

  // 测线：done 用确认点，measuring 用实时预览
  const endPoint = phase === 'done' ? confirmedB : previewB;
  const line: MeasureLine | null =
    pointA && endPoint
      ? { x1: pointA.screen.x, y1: pointA.screen.y, x2: endPoint.screen.x, y2: endPoint.screen.y }
      : null;
  const liveCm = pointA && endPoint ? worldDistanceCm(pointA.world, endPoint.world) : null;

  const bannerCopy =
    phase === 'scanning'
      ? '缓慢移动手机，扫描鱼身下的平面'
      : phase === 'ready'
        ? '点击鱼头，再点击鱼尾'
        : phase === 'measuring'
          ? '拖动预览长度，点击鱼尾确认'
          : '完成';

  return (
    <View style={styles.screen}>
      {/* 原生 AR 相机背景（ARCore / 华为 AR Engine 会话随挂载/卸载起停） */}
      <ARMeasureViewNative
        style={StyleSheet.absoluteFill}
        testID="ar-measure-view"
        engine={engine}
        onPlaneDetected={handlePlaneDetected}
        onSessionError={handleSessionError}
      />

      {/* 交互层：点击 / 拖动预览 */}
      <View
        style={StyleSheet.absoluteFill}
        testID="ar-touch-layer"
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleTap}
        onResponderMove={handleMove}
      />

      {/* 视觉层：测线 + 扫描提示（不拦截触摸） */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {line && liveCm != null ? (
          <MeasureLineOverlay
            line={line}
            width={width}
            height={height}
            value={`${liveCm.toFixed(1)} cm`}
            caption={phase === 'done' ? 'AR 实测长度' : '实时测量中'}
            topMin={insets.top + 96}
            bottomMax={height - 260}
          />
        ) : null}

        {/* 扫描状态提示：中央呼吸圆点 */}
        {phase === 'scanning' ? (
          <View style={styles.scanHint}>
            <View style={styles.scanRing} />
            <Text style={styles.scanText}>正在寻找水平面{'\n'}对准鱼身所在的地面或台面</Text>
          </View>
        ) : null}
      </View>

      {/* 顶栏：引导胶囊居中 + 关闭按钮（整行吃安全区 padding，避免压到状态栏） */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}
        pointerEvents="box-none"
      >
        <View style={styles.topSide} pointerEvents="none" />
        <View style={styles.banner} pointerEvents="none">
          <RulerGlyph size={15} color="#EAD9AE" />
          <Text style={styles.bannerText} numberOfLines={1}>
            {bannerCopy}
          </Text>
          <View
            style={[
              styles.calibDot,
              { backgroundColor: phase !== 'scanning' ? palette.accentGold : 'rgba(255,255,255,0.45)' },
            ]}
          />
        </View>
        <View style={styles.topSideRight}>
          <PressableScale
            onPress={onClose}
            scaleTo={0.9}
            accessibilityLabel="关闭 AR 量尺"
            accessibilityRole="button"
          >
            <View style={styles.closeBtn}>
              <Icon name="close" size={19} color="#F6FAF8" />
            </View>
          </PressableScale>
        </View>
      </View>

      {notice ? (
        <View style={[styles.noticeWrap, { top: insets.top + 64 }]} pointerEvents="none">
          <Text style={styles.noticeText} numberOfLines={1}>
            {notice}
          </Text>
        </View>
      ) : null}

      {/* 底部面板 */}
      <View style={[styles.panel, { bottom: insets.bottom + spacing.xl }]}>
        {phase === 'done' && measuredCm != null ? (
          <>
            <Text style={styles.resultValue}>{measuredCm.toFixed(1)} cm</Text>
            <Text style={styles.resultHint}>AR 实测长度，拍照后自动填入鱼获</Text>
            <PrimaryButton
              label={`用 ${measuredCm.toFixed(1)} cm`}
              variant="primary"
              onPress={() => onMeasured(measuredCm)}
              style={styles.primaryBtn}
            />
            <View style={styles.secondaryRow}>
              <PrimaryButton label="重新测量" variant="ghost" onPress={resetMeasure} style={styles.secondaryBtn} />
              <PrimaryButton
                label="改用普通量尺"
                variant="ghost"
                onPress={() => onFallbackManual()}
                style={styles.secondaryBtn}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.panelTitle}>AR 量尺</Text>
            <Text style={styles.panelHint}>
              {phase === 'scanning'
                ? '正在扫描平面，稍作移动即可'
                : phase === 'ready'
                  ? '把鱼头和鱼尾各点一下，长度自动算出'
                  : '拖动手指实时预览，点鱼尾确认'}
            </Text>
            <PrimaryButton
              label="改用普通量尺"
              variant="ghost"
              onPress={() => onFallbackManual()}
              style={styles.fallbackBtn}
            />
          </>
        )}
      </View>
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.viewfinderDark,
  } as ViewStyle,
  /** 顶栏：胶囊居中 + 右侧关闭；paddingTop 吃安全区，关闭按钮随行下移避开状态栏 */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  topSide: {
    flex: 1,
  } as ViewStyle,
  topSideRight: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  } as ViewStyle,
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(10,26,32,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.16)',
  } as ViewStyle,
  bannerText: {
    marginHorizontal: 7,
    color: 'rgba(246,250,248,0.92)',
    fontSize: fs(typeScale.caption),
    letterSpacing: 1,
    ...shadowText,
  } as TextStyle,
  calibDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  } as ViewStyle,
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,26,32,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.2)',
  } as ViewStyle,
  noticeWrap: {
    position: 'absolute',
    alignSelf: 'center',
  } as ViewStyle,
  noticeText: {
    color: '#EAD9AE',
    fontSize: fs(typeScale.caption),
    letterSpacing: 1,
    ...shadowText,
  } as TextStyle,
  scanHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    alignItems: 'center',
  } as ViewStyle,
  scanRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(246,250,248,0.6)',
    marginBottom: spacing.md,
  } as ViewStyle,
  scanText: {
    color: 'rgba(246,250,248,0.88)',
    fontSize: fs(typeScale.caption + 1),
    lineHeight: 22,
    letterSpacing: 2,
    textAlign: 'center',
    ...shadowText,
  } as TextStyle,
  panel: {
    position: 'absolute',
    left: spacing.page,
    right: spacing.page,
    borderRadius: 22,
    backgroundColor: 'rgba(10,26,32,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.16)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  } as ViewStyle,
  panelTitle: {
    color: '#FDFEFD',
    fontFamily: font.serif,
    fontSize: fs(typeScale.h2),
    fontWeight: '600',
    letterSpacing: 3,
  } as TextStyle,
  panelHint: {
    marginTop: spacing.sm,
    color: 'rgba(246,250,248,0.72)',
    fontSize: fs(typeScale.caption),
    letterSpacing: 1,
    textAlign: 'center',
  } as TextStyle,
  resultValue: {
    color: '#EAD9AE',
    fontFamily: font.serif,
    fontSize: fs(34),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  resultHint: {
    marginTop: spacing.xs,
    color: 'rgba(246,250,248,0.72)',
    fontSize: fs(typeScale.caption),
    letterSpacing: 1,
  } as TextStyle,
  primaryBtn: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  } as ViewStyle,
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  } as ViewStyle,
  secondaryBtn: {
    flex: 1,
  } as ViewStyle,
  fallbackBtn: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  } as ViewStyle,
});
