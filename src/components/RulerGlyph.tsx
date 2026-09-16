/**
 * RulerGlyph —— 量尺图标。
 *
 * Ionicons 没有尺子字形，这里用 SVG 自绘：斜置直尺 + 长短刻度，
 * 线性细描边风格与拍照页的玻璃质感（FishScanFrame 金银渐变）一致。
 */
import React from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

interface RulerGlyphProps {
  size?: number;
  color?: string;
}

export const RulerGlyph: React.FC<RulerGlyphProps> = ({ size = 22, color = '#F6FAF8' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G transform="rotate(-45 12 12)" strokeLinecap="round">
      <Rect
        x={2.2}
        y={8.9}
        width={19.6}
        height={6.2}
        rx={1.4}
        stroke={color}
        strokeWidth={1.6}
        fill="none"
      />
      <Line x1={6} y1={8.9} x2={6} y2={11.4} stroke={color} strokeWidth={1.4} />
      <Line x1={9.5} y1={8.9} x2={9.5} y2={12.6} stroke={color} strokeWidth={1.4} />
      <Line x1={13} y1={8.9} x2={13} y2={11.4} stroke={color} strokeWidth={1.4} />
      <Line x1={16.5} y1={8.9} x2={16.5} y2={12.6} stroke={color} strokeWidth={1.4} />
    </G>
  </Svg>
);
