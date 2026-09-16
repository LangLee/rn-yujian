/**
 * MeasureLineOverlay —— 测线视觉（卡钳线 + 长度标签胶囊）。
 *
 * 手动量尺（RulerMeasureLayer）与 AR 自动量尺（ARMeasureLayer）共用：
 * 渲染金银渐变测线、柔光底层、端点圆环与垂直刻度，中点上方浮长度标签。
 * 纯视觉组件，不含手势与换算逻辑。
 */
import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Stop } from 'react-native-svg';
import { font, fs, spacing, typeScale } from '../../constants/tokens';

/** 长度标签胶囊宽度（中点定位与边界钳制） */
export const MEASURE_CHIP_W = 156;

export interface MeasureLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface MeasureLineOverlayProps {
  line: MeasureLine;
  /** 容器尺寸（SVG 坐标系与之一致） */
  width: number;
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
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const T = 11;
  const tick = { ax: line.x1 + nx * T, ay: line.y1 + ny * T, bx: line.x1 - nx * T, by: line.y1 - ny * T };

  const midX = (line.x1 + line.x2) / 2;
  const midY = (line.y1 + line.y2) / 2;
  const chipLeft = Math.min(
    Math.max(midX - MEASURE_CHIP_W / 2, spacing.sm),
    Math.max(width - MEASURE_CHIP_W - spacing.sm, spacing.sm),
  );
  const chipTop = Math.min(Math.max(midY - 72, topMin), Math.max(bottomMax, topMin));

  return (
    <>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient
            id="rulerMeasureGrad"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#E6C98C" />
            <Stop offset="0.6" stopColor="#D9C592" />
            <Stop offset="1" stopColor="#C2D9E0" />
          </LinearGradient>
        </Defs>
        {/* 柔光底层：让测线在明亮水面上仍可读 */}
        <Line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="rgba(253,254,253,0.30)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <Line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="url(#rulerMeasureGrad)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        {/* 卡钳端刻度：起 / 终点各一短垂线 */}
        <Line
          x1={tick.ax}
          y1={tick.ay}
          x2={tick.bx}
          y2={tick.by}
          stroke="rgba(253,254,253,0.88)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <Line
          x1={tick.ax + dx}
          y1={tick.ay + dy}
          x2={tick.bx + dx}
          y2={tick.by + dy}
          stroke="rgba(253,254,253,0.88)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {/* 端点：深色底圈 + 渐变描边 + 白芯 */}
        <Circle
          cx={line.x1}
          cy={line.y1}
          r={9}
          fill="rgba(10,26,32,0.45)"
          stroke="url(#rulerMeasureGrad)"
          strokeWidth={2}
        />
        <Circle cx={line.x1} cy={line.y1} r={2.6} fill="#FDFEFD" />
        <Circle
          cx={line.x2}
          cy={line.y2}
          r={9}
          fill="rgba(10,26,32,0.45)"
          stroke="url(#rulerMeasureGrad)"
          strokeWidth={2}
        />
        <Circle cx={line.x2} cy={line.y2} r={2.6} fill="#FDFEFD" />
      </Svg>
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
