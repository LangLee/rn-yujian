/**
 * ARMeasureLayer —— AR 自动量尺全屏浮层。
 *
 * 原生 YujianARMeasureView（ARCore / 华为 AR Engine）接管相机背景与水平面检测；
 * 本层只做交互与展示：检测到平面后「按下鱼头锚定 → 拖动全程实时画线 → 松手确认鱼尾」
 * （也兼容点鱼头再点鱼尾的两次轻点），屏幕点经原生 hitTest 得到 AR 世界坐标（米），
 * 自动算出真实长度，
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
import { AppIcon } from './icons/AppIcon';
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
/** 按下后位移超过该值（dp）视为拖动；刚锚定就松手（轻点）不确认鱼尾 */
const DRAG_SLOP_DP = 12;

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
  /** measuring 阶段线尾跟随手指的屏幕点：每个 move 同步更新，白线恒可见 */
  const [fingerB, setFingerB] = useState<{ x: number; y: number } | null>(null);
  /** 线尾最新命中的世界坐标（节流 hitTest），只用于换算 cm 数值 */
  const [previewWorld, setPreviewWorld] = useState<WorldPoint | null>(null);
  const [confirmedB, setConfirmedB] = useState<MeasureAnchor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastHitAtRef = useRef(0);
  /** 预览 hitTest 序号：只接受最新一次结果，防止乱序返回导致数值回跳 */
  const hitSeqRef = useRef(0);
  /** 手势跟踪：区分「刚放下鱼头锚点的轻点」与「确认鱼尾的拖动 / 点击」 */
  const gestureRef = useRef<{ startX: number; startY: number; moved: boolean; placedA: boolean } | null>(null);
  const [measuredCm, setMeasuredCm] = useState<number | null>(null);

  // hitTest 桥接往返期间 phase 可能已变化，异步回调里读最新阶段
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  /** 按下：ready 阶段立刻以按下点锚定鱼头（hitTest 命中后进入 measuring），
   *  拖动全程白线从按下点跟随手指，单个手势即可完成测量 */
  const handleGrant = (e: GestureResponderEvent) => {
    const p = pointFromEvent(e);
    gestureRef.current = { startX: p.x, startY: p.y, moved: false, placedA: false };
    if (phaseRef.current !== 'ready') {
      return;
    }
    hitTestAt(p.x, p.y).then((world) => {
      if (!world || phaseRef.current !== 'ready') {
        return;
      }
      if (gestureRef.current) {
        gestureRef.current.placedA = true;
      }
      haptics.selection();
      setPointA({ screen: p, world });
      setFingerB(p);
      setPreviewWorld(null);
      setConfirmedB(null);
      setMeasuredCm(null);
      setPhase('measuring');
    });
  };

  /** 节流 hitTest：更新线尾世界坐标（cm 数值）；未命中 / 失败静默保持上一帧 */
  const runPreviewHitTest = async (x: number, y: number) => {
    const seq = ++hitSeqRef.current;
    try {
      const world = await arMeasure.hitTest(x, y);
      if (world && seq === hitSeqRef.current) {
        setPreviewWorld(world);
      }
    } catch {
      // 预览失败静默：白线仍跟手，数值保持上一帧
    }
  };

  /** measuring 阶段：线尾屏幕点每个 move 同步跟手（白线恒可见），
   *  世界坐标换算走节流 hitTest，与画线解耦 */
  const handleMove = (e: GestureResponderEvent) => {
    const p = pointFromEvent(e);
    const g = gestureRef.current;
    if (g && Math.hypot(p.x - g.startX, p.y - g.startY) > DRAG_SLOP_DP) {
      g.moved = true;
    }
    if (phaseRef.current !== 'measuring') {
      return;
    }
    setFingerB(p);
    const now = Date.now();
    if (now - lastHitAtRef.current < LIVE_HIT_INTERVAL_MS) {
      return;
    }
    lastHitAtRef.current = now;
    runPreviewHitTest(p.x, p.y);
  };

  /** 松手：刚放下鱼头锚点的轻点不确认；拖动到位 / 点击鱼尾时 hitTest 确认并算长度 */
  const handleRelease = (e: GestureResponderEvent) => {
    const p = pointFromEvent(e);
    const g = gestureRef.current;
    gestureRef.current = null;
    if (phaseRef.current !== 'measuring' || !pointA) {
      return;
    }
    if (g?.placedA && !g.moved) {
      // 本手势只是放下鱼头锚点：等待鱼尾手势
      return;
    }
    setFingerB(p);
    hitTestAt(p.x, p.y).then((world) => {
      if (!world || phaseRef.current !== 'measuring') {
        return; // 未命中：提示已弹出，保持预览线等待重试
      }
      haptics.confirm();
      setConfirmedB({ screen: p, world });
      setMeasuredCm(worldDistanceCm(pointA.world, world));
      setPhase('done');
    });
  };

  /** 系统 / 其他组件抢占（如边缘返回）：结束手势跟踪，已画的锚点与测线保持 */
  const handleTerminate = () => {
    gestureRef.current = null;
  };

  const resetMeasure = () => {
    haptics.selection();
    setPointA(null);
    setFingerB(null);
    setPreviewWorld(null);
    setConfirmedB(null);
    setMeasuredCm(null);
    setPhase('ready');
  };

  // 测线：done 用确认点；measuring 用跟手的预览端点（hitTest 未命中也画线）
  const endScreen = phase === 'done' ? confirmedB?.screen : fingerB;
  const line: MeasureLine | null =
    pointA && endScreen
      ? { x1: pointA.screen.x, y1: pointA.screen.y, x2: endScreen.x, y2: endScreen.y }
      : null;
  const endWorld = phase === 'done' ? confirmedB?.world : previewWorld;
  const liveCm = pointA && endWorld ? worldDistanceCm(pointA.world, endWorld) : null;

  const bannerCopy =
    phase === 'scanning'
      ? '缓慢移动手机，扫描鱼身下的平面'
      : phase === 'ready'
        ? '按住鱼头，拖到鱼尾松手'
        : phase === 'measuring'
          ? '拖动实时预览，松手确认长度'
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

      {/* 交互层：按下锚定鱼头 / 拖动实时画线 / 松手确认 */}
      <View
        style={StyleSheet.absoluteFill}
        testID="ar-touch-layer"
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleTerminate}
      />

      {/* 视觉层：测线 + 扫描提示（不拦截触摸） */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {line ? (
          <MeasureLineOverlay
            line={line}
            width={width}
            height={height}
            value={liveCm != null ? `${liveCm.toFixed(1)} cm` : '-- cm'}
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
              <AppIcon name="close" size={19} color="#F6FAF8" />
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
                  ? '按住鱼头拖到鱼尾松手，长度自动算出'
                  : '拖到鱼尾松手完成，也可点击鱼尾确认'}
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
