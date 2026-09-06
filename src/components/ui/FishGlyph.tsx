import React from 'react';
import Svg, { Ellipse, Polygon } from 'react-native-svg';

interface FishGlyphProps {
  size?: number;
  color: string;
  opacity?: number;
}

/**
 * 鱼 Glyph（4.3）：日历标记用。小、符号化、低对比、不卡通。
 * 日历里有鱼获的日期用小鱼 glyph 替代普通圆点（10.1）。
 */
export const FishGlyph: React.FC<FishGlyphProps> = ({ size = 12, color, opacity = 0.9 }) => {
  const w = size;
  const h = size * 0.62;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Ellipse cx={w * 0.58} cy={h * 0.5} rx={w * 0.36} ry={h * 0.4} fill={color} opacity={opacity} />
      <Polygon
        points={`${w * 0.28},${h * 0.5} ${w * 0.04},${h * 0.16} ${w * 0.04},${h * 0.84}`}
        fill={color}
        opacity={opacity * 0.9}
      />
    </Svg>
  );
};
