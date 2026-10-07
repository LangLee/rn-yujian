/**
 * RulerMeasureLayer —— 拍照页「量尺」模式覆盖层。
 *
 * 交互：长按屏幕任意一点（~280ms 触觉确认）→ 拖到另一点 → 松手，
 * 画出一条卡钳式测量线（金银渐变 + 端点刻度），并给出两点真实距离。
 *
 * 手势用 RN 原生 responder 自实现「长按后拖拽」，不用 RNGH 的
 * activateAfterLongPress：其在 Android 上等待期内手指漂移超过系统
 * touchSlop（约 8dp）即静默失败，真机长按几乎必然没反应；自实现的
 * 容差是长按成熟前漂移 ≤32dp 都算长按，且起线锚点取长按成熟时
 * 手指所在位置，自然抖动不影响。
 *
 * 像素换算真实长度需要比例尺（px/cm）：纯像素没有物理含义，
 * 所以先「校准」——长按量一个已知长度的参照物（银行卡 / A4 纸 /
 * 一元硬币 / 自定义），选它的实际长度即得比例尺；校准后保持手机
 * 高度不变再量鱼身，长度才有效（引导文案已说明）。
 *
 * 测得的长度通过 onMeasuredChange 上抛给拍照页，随快门写入识别流程。
 *
 * 分层结构（自下而上）：
 *  1. 手势层：全屏 responder 视图（长按起笔 / 拖拽 / 松手）
 *  2. 视觉层：pointerEvents none，测线 / 长度标签 / 顶部引导，不拦截触摸
 *  3. 控件层：pointerEvents box-none，仅底部工具条按钮可点
 * 底部快门 / 相册 / 量尺开关由父级渲染在更上层，不受手势层影响。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  Text,
  TextStyle,
  TextInput,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { BottomSheet } from './ui/BottomSheet';
import { PressableScale } from './ui/PressableScale';
import { PrimaryButton } from './ui/PrimaryButton';
import { RulerGlyph } from './RulerGlyph';
import { MeasureLine, MeasureLineOverlay } from './measure/MeasureLineOverlay';
import { palette } from '../constants/colors';
import { font, fs, spacing, typeScale } from '../constants/tokens';
import { haptics } from '../utils/haptics';

/** 长按多久后允许起笔拖拽 */
const LONG_PRESS_MS = 280;
/** 长按成熟前允许的最大漂移（dp），超过视为滑动手势，放弃本次长按 */
const PRE_ARM_DRIFT_PX = 32;
/** 线段最短像素（dp），低于视为误触，松手后丢弃 */
const MIN_LINE_PX = 24;

/** 校准参照物预设：日常随身、长度稳定可信的物体 */
const CALIBRATION_PRESETS: { key: string; label: string; cm: number }[] = [
  { key: 'card', label: '银行卡 / 身份证', cm: 8.56 },
  { key: 'a4-long', label: 'A4 纸 · 长边', cm: 29.7 },
  { key: 'a4-short', label: 'A4 纸 · 短边', cm: 21 },
  { key: 'coin', label: '一元硬币 · 直径', cm: 2.5 },
];

const lineLength = (line: MeasureLine): number =>
  Math.hypot(line.x2 - line.x1, line.y2 - line.y1);

interface RulerMeasureLayerProps {
  /** 一条完成的测线换算出的真实长度（cm）；清除 / 校准后回传 null */
  onMeasuredChange: (cm: number | null) => void;
  /** 底部工具条距屏幕底部的位置（父级按快门 dock 高度传入） */
  toolbarBottom: number;
}

export const RulerMeasureLayer: React.FC<RulerMeasureLayerProps> = ({
  onMeasuredChange,
  toolbarBottom,
}) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [line, setLine] = useState<MeasureLine | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 比例尺：每厘米对应的像素数；null = 尚未校准 */
  const [pxPerCm, setPxPerCm] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  /** 短暂提示（校准完成 / 引导），2.6s 自动消失 */
  const [notice, setNotice] = useState<string | null>(null);
  /** 防止同一条测线在 effect 里重复上报 */
  const reportedRef = useRef<number | null>(null);
  /** 按压跟踪：起始点 / 最新点 / 触摸 id（多点触控时只跟第一根手指） */
  const pressRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  /** 长按成熟（armed）前待执行的起线定时器 */
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armedRef = useRef(false);

  const linePx = line ? lineLength(line) : 0;
  const measuredCm =
    pxPerCm != null && linePx >= MIN_LINE_PX ? linePx / pxPerCm : null;
  const customCm = Number(customText);
  const customValid = customText.trim() !== '' && Number.isFinite(customCm) && customCm >= 0.5 && customCm <= 300;

  const clearArmTimer = () => {
    if (armTimerRef.current != null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  };

  useEffect(() => clearArmTimer, []);

  /** 从事件里取本次按压那根手指的坐标（多点触控时按 identifier 匹配；
   *  typings 与运行时的 identifier 原始类型不一致，两侧统一 String 比较） */
  const pointOf = (e: GestureResponderEvent): { x: number; y: number } => {
    const id = pressRef.current?.id;
    const match =
      id != null
        ? e.nativeEvent.touches?.find((t) => String(t.identifier) === id)
        : undefined;
    if (match) {
      return { x: match.pageX, y: match.pageY };
    }
    return { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };

  /** 按下：记录起点并开始长按计时；到点后以手指当前位置为锚点起线 */
  const handleGrant = (e: GestureResponderEvent) => {
    const p = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    pressRef.current = {
      id: String(e.nativeEvent.identifier),
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
    };
    armedRef.current = false;
    clearArmTimer();
    armTimerRef.current = setTimeout(() => {
      const press = pressRef.current;
      if (!press) {
        return;
      }
      armedRef.current = true;
      reportedRef.current = null;
      setNotice(null);
      setDragging(true);
      setLine({ x1: press.x, y1: press.y, x2: press.x, y2: press.y });
      haptics.selection();
    }, LONG_PRESS_MS);
  };

  const handleMove = (e: GestureResponderEvent) => {
    const press = pressRef.current;
    if (!press) {
      return;
    }
    const p = pointOf(e);
    pressRef.current = { ...press, x: p.x, y: p.y };
    if (armedRef.current) {
      setLine((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : prev));
    } else if (Math.hypot(p.x - press.startX, p.y - press.startY) > PRE_ARM_DRIFT_PX) {
      // 长按尚未成熟就大幅移动：视为滑动，放弃本次长按
      clearArmTimer();
      pressRef.current = null;
    }
  };

  const handleRelease = (e: GestureResponderEvent) => {
    clearArmTimer();
    const wasArmed = armedRef.current;
    armedRef.current = false;
    const p = pointOf(e);
    pressRef.current = null;
    if (!wasArmed) {
      return;
    }
    setDragging(false);
    setLine((prev) => {
      if (!prev) {
        return prev;
      }
      const next = { ...prev, x2: p.x, y2: p.y };
      return lineLength(next) >= MIN_LINE_PX ? next : null;
    });
  };

  /** 系统 / 其他组件抢占（如边缘返回）：中止本次按压，已画测线保持 */
  const handleTerminate = () => {
    clearArmTimer();
    armedRef.current = false;
    pressRef.current = null;
    setDragging(false);
  };

  // 松手结算：一条完整测线 + 已校准 → 上抛真实长度，并给一次确认触觉
  useEffect(() => {
    if (dragging || !line || measuredCm == null) {
      return;
    }
    if (reportedRef.current === measuredCm) {
      return;
    }
    reportedRef.current = measuredCm;
    onMeasuredChange(measuredCm);
    haptics.confirm();
  }, [dragging, line, measuredCm, onMeasuredChange]);

  // notice 自动消退
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const clearLine = () => {
    reportedRef.current = null;
    setLine(null);
    onMeasuredChange(null);
    haptics.selection();
  };

  const openCalibration = () => {
    if (linePx < MIN_LINE_PX) {
      setNotice('先长按量一条已知物体的线');
      return;
    }
    haptics.selection();
    setCustomOpen(false);
    setSheetOpen(true);
  };

  /** 用当前测线（已知物体）+ 实际长度求比例尺 */
  const confirmCalibration = (cm: number) => {
    if (linePx < MIN_LINE_PX || cm <= 0) {
      return;
    }
    setPxPerCm(linePx / cm);
    setLine(null);
    reportedRef.current = null;
    onMeasuredChange(null);
    setSheetOpen(false);
    setCustomOpen(false);
    setCustomText('');
    setNotice('已校准，长按鱼头拖到鱼尾量鱼');
    haptics.confirm();
  };

  // 测线标签文案
  const chipValue =
    measuredCm != null
      ? `${measuredCm.toFixed(1)} cm`
      : pxPerCm == null
        ? '待校准'
        : '测量中';
  const chipCaption = measuredCm != null ? (dragging ? '松手完成测量' : '拍照后自动填入') : '点「校准」设置比例尺';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 1. 手势层：全屏长按拖拽（RN 原生 responder，见文件头说明） */}
      <View
        style={StyleSheet.absoluteFill}
        testID="ruler-touch-layer"
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleTerminate}
      />

      {/* 2. 视觉层：测线 + 长度标签 + 顶部引导（不拦截触摸） */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {line ? (
          <MeasureLineOverlay
            line={line}
            width={width}
            height={height}
            value={chipValue}
            caption={chipCaption}
            topMin={insets.top + 72}
            bottomMax={height - toolbarBottom - 120}
          />
        ) : null}

        {/* 顶部引导：校准状态一眼可见 */}
        <View style={[styles.banner, { top: insets.top + spacing.md }]}>
          <RulerGlyph size={15} color="#E6C98C" />
          <Text style={styles.bannerText} numberOfLines={1}>
            {pxPerCm != null ? '长按鱼头，拖到鱼尾' : '长按量一下已知物体'}
          </Text>
          <View
            style={[
              styles.calibDot,
              { backgroundColor: pxPerCm != null ? palette.accentGold : 'rgba(255,255,255,0.45)' },
            ]}
          />
        </View>
        {notice ? (
          <View style={[styles.noticeWrap, { top: insets.top + spacing.md + 42 }]}>
            <Text style={styles.noticeText} numberOfLines={1}>
              {notice}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 3. 控件层：底部工具条 */}
      <View style={[styles.toolbar, { bottom: toolbarBottom }]} pointerEvents="box-none">
        <View style={styles.toolInfo}>
          {measuredCm != null ? (
            <>
              <Text style={styles.toolValue}>{measuredCm.toFixed(1)} cm</Text>
              <Text style={styles.toolHint}>已测量，将随照片填入</Text>
            </>
          ) : pxPerCm != null ? (
            <>
              <Text style={styles.toolValueDim}>-- cm</Text>
              <Text style={styles.toolHint}>长按屏幕开始测量</Text>
            </>
          ) : (
            <>
              <Text style={styles.toolValueDim}>未校准</Text>
              <Text style={styles.toolHint}>先量已知物体再校准</Text>
            </>
          )}
        </View>
        <PressableScale
          onPress={openCalibration}
          scaleTo={0.94}
          style={styles.toolBtnHit}
          accessibilityLabel="校准比例尺"
          accessibilityRole="button"
        >
          <View style={styles.toolBtn}>
            <Text style={styles.toolBtnText}>校准</Text>
          </View>
        </PressableScale>
        <PressableScale
          onPress={clearLine}
          scaleTo={0.94}
          style={styles.toolBtnHit}
          accessibilityLabel="清除测量线"
          accessibilityRole="button"
        >
          <View style={[styles.toolBtn, linePx < MIN_LINE_PX && styles.toolBtnDisabled]}>
            <Text style={styles.toolBtnText}>清除</Text>
          </View>
        </PressableScale>
      </View>

      {/* 校准 Sheet：当前测线对应哪个已知长度 */}
      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="这条线有多长？"
      >
        <Text style={styles.sheetCopy}>
          选刚画出的线对应的实际长度完成校准。校准后保持手机高度不变，量鱼才准。
        </Text>
        {CALIBRATION_PRESETS.map((preset) => (
          <PressableScale
            key={preset.key}
            onPress={() => confirmCalibration(preset.cm)}
            scaleTo={0.985}
          >
            <View style={styles.presetRow}>
              <Text style={styles.presetName}>{preset.label}</Text>
              <Text style={styles.presetCm}>{preset.cm} cm</Text>
            </View>
          </PressableScale>
        ))}
        <PressableScale onPress={() => setCustomOpen((v) => !v)} scaleTo={0.985}>
          <View style={styles.presetRow}>
            <Text style={styles.presetName}>自定义长度…</Text>
            <Icon name="chevron-forward" size={15} color={palette.mutedInk} />
          </View>
        </PressableScale>
        {customOpen ? (
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customText}
              onChangeText={setCustomText}
              placeholder="实际长度（cm）"
              placeholderTextColor="rgba(23,59,75,0.4)"
              keyboardType="decimal-pad"
              maxLength={6}
              autoFocus
            />
            <PrimaryButton
              label="确定"
              variant="secondaryMuted"
              disabled={!customValid}
              onPress={() => confirmCalibration(customCm)}
              style={styles.customBtn}
            />
          </View>
        ) : null}
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
  /** 顶部引导胶囊 */
  banner: {
    position: 'absolute',
    alignSelf: 'center',
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
  /** 底部工具条：状态 + 校准 / 清除 */
  toolbar: {
    position: 'absolute',
    left: spacing.page,
    right: spacing.page,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(10,26,32,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.16)',
  } as ViewStyle,
  toolInfo: {
    flex: 1,
    minWidth: 0,
  } as ViewStyle,
  toolValue: {
    color: '#EAD9AE',
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  toolValueDim: {
    color: 'rgba(246,250,248,0.9)',
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  toolHint: {
    marginTop: 1,
    color: 'rgba(246,250,248,0.62)',
    fontSize: fs(typeScale.caption - 1),
    letterSpacing: 0.5,
  } as TextStyle,
  toolBtnHit: {
    marginLeft: spacing.sm,
    borderRadius: 14,
  } as ViewStyle,
  toolBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(246,250,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  toolBtnDisabled: {
    opacity: 0.45,
  } as ViewStyle,
  toolBtnText: {
    color: '#F6FAF8',
    fontSize: fs(typeScale.caption + 1),
    fontWeight: '600',
    letterSpacing: 2,
  } as TextStyle,
  sheetCopy: {
    color: palette.mutedInk,
    fontSize: fs(typeScale.meta),
    lineHeight: 21,
    marginBottom: spacing.md,
  } as TextStyle,
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(23,59,75,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(23,59,75,0.08)',
    marginBottom: spacing.sm,
  } as ViewStyle,
  presetName: {
    color: palette.deepInk,
    fontSize: fs(typeScale.body - 1),
    fontWeight: '600',
  } as TextStyle,
  presetCm: {
    color: '#9A7B3F',
    fontFamily: font.serif,
    fontSize: fs(typeScale.body - 1),
    fontWeight: '700',
  } as TextStyle,
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  } as ViewStyle,
  customInput: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(23,59,75,0.14)',
    paddingHorizontal: 12,
    color: palette.deepInk,
    fontSize: fs(typeScale.body),
  } as TextStyle,
  customBtn: {
    width: 96,
  } as ViewStyle,
});
