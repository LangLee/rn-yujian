/**
 * MeasureLineOverlay —— 测线视觉（卡钳线 + 长度标签胶囊）。
 *
 * 手动量尺（RulerMeasureLayer）与 AR 自动量尺（ARMeasureLayer）共用：
 * 柔光底线 + 白色测线 + 端点圆环与垂直刻度，中点上方浮长度标签。
 *
 * 测线用纯 RN View（绝对定位 + rotate 绕中心旋转）绘制：react-native-svg
 * 的绘制面叠在原生相机 GLSurfaceView（AR 量尺背景）之上时内容不渲染
 * （新架构真机实测），普通 View 与标签胶囊同一条渲染路径，任何取景背景
 * 上都可见。纯视觉组件，不含手势与换算逻辑。
 */
import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { font, fs, spacing, typeScale } from '../../constants/tokens';

/** 长度标签胶囊宽度（中点定位与边界钳制） */
export const MEASURE_CHIP_W = 156;

/** 标签中点上方偏移 */
const CHIP_LIFT = 72;
/** 线段最短长度（dp）：低于它不画线体，只画端点圆环（锚点态） */
const MIN_SEG = 1;
/** 卡钳端刻度长度 / 粗细 */
const TICK_LEN = 22;
const TICK_THICK = 1.6;
/** 端点圆环直径 / 描边 / 白芯直径 */
const RING_SIZE = 18;
const RING_BORDER = 2;
const RING_CORE = 5.2;

export interface MeasureLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface MeasureLineOverlayProps {
  line: MeasureLine;
  /** 容器宽度（标签水平边界钳制） */
  width: number;
  /** 容器高度（保留契约：与手动量尺调用方对齐） */
  height: number;
  /** 标签主文案（如 "23.5 cm"） */
  value: string;
  /** 标签副文案（如 "松手完成测量"） */
  caption: string;
  /** 标签 top 钳制下限（顶部安全区） */
  topMin: number;
  /** 标签 top 钳制上限（避开底部工具条） */
  bottomMax: number;
}

/** 以 (midX, midY) 为中心、沿 angleDeg 方向的圆头线段 */
const segmentStyle = (
  midX: number,
  midY: number,
  len: number,
  thick: number,
  color: string,
  angleDeg: number,
): ViewStyle => ({
  position: 'absolute',
  left: midX - len / 2,
  top: midY - thick / 2,
  width: len,
  height: thick,
  borderRadius: thick / 2,
  backgroundColor: color,
  transform: [{ rotate: `${angleDeg}deg` }],
});

/** 端点处的垂直短刻度（卡钳爪） */
const tickStyle = (x: number, y: number, angleDeg: number): ViewStyle => ({
  position: 'absolute',
  left: x - TICK_LEN / 2,
  top: y - TICK_THICK / 2,
  width: TICK_LEN,
  height: TICK_THICK,
  borderRadius: TICK_THICK / 2,
  backgroundColor: 'rgba(253,254,253,0.88)',
  transform: [{ rotate: `${angleDeg + 90}deg` }],
});

/** 端点圆环：深色底圈 + 金色描边 + 白芯 */
const EndpointRing: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <View
    style={{
      position: 'absolute',
      left: x - RING_SIZE / 2,
      top: y - RING_SIZE / 2,
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      backgroundColor: 'rgba(10,26,32,0.45)',
      borderWidth: RING_BORDER,
      borderColor: '#D9C592',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <View
      style={{
        width: RING_CORE,
        height: RING_CORE,
        borderRadius: RING_CORE / 2,
        backgroundColor: '#FDFEFD',
      }}
    />
  </View>
);

export const MeasureLineOverlay: React.FC<MeasureLineOverlayProps> = ({
  line,
  width,
  height,
  value,
  caption,
  topMin,
  bottomMax,
}) => {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const showSeg = len >= MIN_SEG;

  const midX = (line.x1 + line.x2) / 2;
  const midY = (line.y1 + line.y2) / 2;
  const chipLeft = Math.min(
    Math.max(midX - MEASURE_CHIP_W / 2, spacing.sm),
    Math.max(width - MEASURE_CHIP_W - spacing.sm, spacing.sm),
  );
  const chipTop = Math.min(Math.max(midY - CHIP_LIFT, topMin), Math.max(bottomMax, topMin));
  // height 目前不参与钳制，仅为契约保留
  void height;

  return (
    <>
      {/* 柔光底层：让测线在明亮水面上仍可读 */}
      {showSeg ? (
        <View style={segmentStyle(midX, midY, len, 6, 'rgba(253,254,253,0.32)', angleDeg)} />
      ) : null}
      {/* 主测线（白） */}
      {showSeg ? (
        <View
          testID="measure-line-body"
          style={segmentStyle(midX, midY, len, 2.4, '#FDFEFD', angleDeg)}
        />
      ) : null}
      {/* 卡钳端刻度：起 / 终点各一短垂线 */}
      {showSeg ? <View style={tickStyle(line.x1, line.y1, angleDeg)} /> : null}
      {showSeg ? <View style={tickStyle(line.x2, line.y2, angleDeg)} /> : null}
      {/* 端点圆环 */}
      <EndpointRing x={line.x1} y={line.y1} />
      <EndpointRing x={line.x2} y={line.y2} />
      <View style={[styles.chip, { left: chipLeft, top: chipTop }]}>
        <Text style={styles.chipValue}>{value}</Text>
        <Text style={styles.chipCaption}>{caption}</Text>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  /** 长度标签：深色磨砂胶囊 + 金色衬线数值 */
  chip: {
    position: 'absolute',
    width: MEASURE_CHIP_W,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(10,26,32,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  } as ViewStyle,
  chipValue: {
    color: '#EAD9AE',
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  chipCaption: {
    marginTop: 1,
    color: 'rgba(246,250,248,0.72)',
    fontSize: fs(typeScale.caption - 1),
    letterSpacing: 1,
  } as TextStyle,
});
