import React from 'react';
import { StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';

/**
 * 页面底部水岸草丛前景装饰（Login V2.1 / Register V2 / Edit Profile 冻结规则）：
 * - 锚定页面绝对底边，约 8–10% 视觉高度；
 * - 低对比 / 低存在感，石头保持次要；
 * - 仅为装饰，不遮挡底部文字与 CTA；
 * - 页面自有前景，不属于背景母版，无自动动画。
 */

interface FooterGrassProps {
  /** 覆盖高度约束（默认窗口高 9%） */
  height?: number;
  style?: ViewStyle;
}

export const FooterGrass: React.FC<FooterGrassProps> = ({ height, style }) => {
  const { height: windowH } = useWindowDimensions();
  const h = height ?? Math.round(windowH * 0.09);
  const w = 430; // 视口宽度基准，Svg 按宽度百分比铺满
  return (
    <View style={[styles.wrap, { height: h }, style]} pointerEvents="none">
      <Svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${Math.round(h)}`}
        preserveAspectRatio="xMidYMax slice"
      >
        {/* 两块次要从属石头 */}
        <Ellipse cx={70} cy={h - 6} rx={34} ry={11} fill="#5F7A74" opacity={0.16} />
        <Ellipse cx={378} cy={h - 4} rx={26} ry={8} fill="#5F7A74" opacity={0.12} />
        {/* 草叶：左右自然生长，中间低伏 */}
        {GRASS.map((blade, index) => (
          <Path
            key={index}
            d={`M ${blade.x} ${h} Q ${blade.x + blade.tip * 0.45} ${h - h * blade.ratio * 0.62} ${
              blade.x + blade.tip
            } ${h - h * blade.ratio}`}
            fill="none"
            stroke="#4E6E68"
            strokeWidth={2.2}
            strokeLinecap="round"
            opacity={0.2 + (index % 3) * 0.03}
          />
        ))}
      </Svg>
    </View>
  );
};

/** 草叶集合：x 为根部位置，tip 为叶尖横向偏移，ratio 为叶高占比 */
const GRASS: { x: number; tip: number; ratio: number }[] = [
  { x: 26, tip: -14, ratio: 0.52 },
  { x: 44, tip: 10, ratio: 0.66 },
  { x: 62, tip: -8, ratio: 0.42 },
  { x: 84, tip: 16, ratio: 0.74 },
  { x: 104, tip: -18, ratio: 0.5 },
  { x: 126, tip: 12, ratio: 0.34 },
  { x: 150, tip: -10, ratio: 0.58 },
  { x: 176, tip: 14, ratio: 0.46 },
  { x: 205, tip: -12, ratio: 0.28 },
  { x: 232, tip: 10, ratio: 0.38 },
  { x: 258, tip: -14, ratio: 0.5 },
  { x: 284, tip: 12, ratio: 0.62 },
  { x: 310, tip: -10, ratio: 0.42 },
  { x: 336, tip: 16, ratio: 0.7 },
  { x: 358, tip: -12, ratio: 0.48 },
  { x: 380, tip: 10, ratio: 0.56 },
  { x: 402, tip: -14, ratio: 0.36 },
];

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  } as ViewStyle,
});
