import React from 'react';
import Svg, { Circle, Ellipse, G, Polygon } from 'react-native-svg';
import { palette } from '../constants/colors';

interface FishIllustrationProps {
  size?: number;
  bodyColor?: string;
}

/**
 * 鱼插画（对应原 FishIllustration.kt 的 Canvas 绘制）：
 * 椭圆鱼身（-2° 旋转）+ 三角尾 + 背鳍 + 深色眼睛，全部使用比例坐标。
 */
export const FishIllustration: React.FC<FishIllustrationProps> = ({
  size = 132,
  bodyColor = palette.fishGreen,
}) => {
  const w = size;
  const h = size;
  const eye = w * 0.038;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* 鱼身：Rect(w*.23, h*.34, w*.84, h*.68) 绕中心旋转 -2° */}
      <G transform={`rotate(-2 ${(w * 0.23 + w * 0.84) / 2} ${(h * 0.34 + h * 0.68) / 2})`}>
        <Ellipse
          cx={(w * 0.23 + w * 0.84) / 2}
          cy={(h * 0.34 + h * 0.68) / 2}
          rx={(w * 0.84 - w * 0.23) / 2}
          ry={(h * 0.68 - h * 0.34) / 2}
          fill={bodyColor}
        />
      </G>
      {/* 尾巴 */}
      <Polygon
        points={`${w * 0.25},${h * 0.51} ${w * 0.06},${h * 0.34} ${w * 0.06},${h * 0.69}`}
        fill={bodyColor}
        opacity={0.95}
      />
      {/* 背鳍 */}
      <Polygon
        points={`${w * 0.5},${h * 0.35} ${w * 0.59},${h * 0.21} ${w * 0.67},${h * 0.35}`}
        fill={bodyColor}
        opacity={0.78}
      />
      {/* 眼睛 */}
      <Circle cx={w * 0.73 + eye / 2} cy={h * 0.43 + eye / 2} r={eye / 2} fill={palette.deepInk} />
    </Svg>
  );
};
