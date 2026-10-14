import React from 'react';
import { StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * 页面底部水岸草丛前景装饰（Login V2.1 / Register V2 / Edit Profile 冻结规则）：
 * - 锚定页面绝对底边，约 8–10% 视觉高度（冻结稿实测 7–9%）；
 * - 左右自然生长、中间低伏，橄榄/鼠尾草绿取样自冻结稿；
 * - 顶部雾化渐隐入内容白场，石头保持次要（低对比灰绿）；
 * - 仅为装饰，不遮挡底部文字与 CTA（设计契约：原生 UI 矢量绘制，
 *   不作为位图资产出货，也永不并入 Morning_Lake_Master_V1）。
 */

interface FooterGrassProps {
  /** 覆盖高度约束（默认窗口高约 8.5%） */
  height?: number;
  style?: ViewStyle;
}

/** 视口宽度基准，Svg 按宽度铺满裁切 */
const W = 430;

/** 冻结稿草丛取样色板：深橄榄 → 鼠尾草，辅以少量灰绿 */
const BLADE_COLORS = [
  '#657924',
  '#6D8223',
  '#73882B',
  '#779034',
  '#7B945A',
  '#82935D',
  '#848B3E',
  '#8A9E3D',
];

/** 确定性伪随机：草丛形态稳定，不随重绘抖动 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Blade {
  x: number;
  tip: number;
  /** 叶尖高度占草丛条带比例 */
  ratio: number;
  width: number;
  color: string;
  opacity: number;
  /** 弯曲控制点横向占比（0.35–0.7，打破平行感） */
  curve: number;
}

/* 丛生草叶：26 丛 × 3-5 叶扇形展开，左右丛高、中间丛低；
   倾角/弯度/宽度/透明度均带随机变化，避免机械平行 */
const BLADES: Blade[] = (() => {
  const rand = seededRandom(20260915);
  const blades: Blade[] = [];
  const clumpCount = 26;
  for (let c = 0; c < clumpCount; c += 1) {
    const cx = (c + 0.5 + (rand() - 0.5) * 0.8) * (W / clumpCount);
    const edge = Math.abs((2 * cx) / W - 1);
    const clumpHeight = Math.min(1, 0.18 + Math.pow(edge, 1.3) * 0.75 + rand() * 0.25);
    const inClump = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < inClump; b += 1) {
      const x = Math.min(Math.max(cx + (rand() - 0.5) * 14, 2), W - 2);
      const ratio = Math.min(1, Math.max(0.1, clumpHeight * (0.55 + rand() * 0.5)));
      blades.push({
        x,
        tip: (rand() - 0.5) * 2 * (10 + rand() * 20),
        ratio,
        width: 1 + ratio * 2.4 + rand() * 1.1,
        color: BLADE_COLORS[Math.floor(rand() * BLADE_COLORS.length)],
        opacity: 0.4 + rand() * 0.5,
        curve: 0.35 + rand() * 0.35,
      });
    }
  }
  /* 少量亮色细叶穿插（近景高光） */
  for (let i = 0; i < 16; i += 1) {
    const x = rand() * W;
    const edge = Math.abs((2 * x) / W - 1);
    blades.push({
      x,
      tip: (rand() > 0.5 ? 1 : -1) * (6 + rand() * 14),
      ratio: Math.min(1, 0.2 + Math.pow(edge, 1.2) * 0.7 + rand() * 0.25),
      width: 1 + rand() * 0.8,
      color: '#A7BA9A',
      opacity: 0.5 + rand() * 0.3,
      curve: 0.4 + rand() * 0.3,
    });
  }
  /* 边缘几笔深色重叶，压出前后层次 */
  for (let i = 0; i < 6; i += 1) {
    const x = rand() > 0.5 ? rand() * W * 0.22 : W - rand() * W * 0.22;
    blades.push({
      x,
      tip: (rand() - 0.5) * 2 * (14 + rand() * 16),
      ratio: 0.62 + rand() * 0.34,
      width: 2.4 + rand() * 0.9,
      color: '#4E6022',
      opacity: 0.5 + rand() * 0.2,
      curve: 0.4 + rand() * 0.3,
    });
  }
  return blades.sort((a, b) => a.ratio - b.ratio);
})();

export const FooterGrass: React.FC<FooterGrassProps> = ({ height, style }) => {
  const { height: windowH } = useWindowDimensions();
  const h = height ?? Math.round(windowH * 0.085);
  return (
    <View style={[styles.wrap, { height: h }, style]} pointerEvents="none">
      <Svg
        width="100%"
        height={h}
        viewBox={`0 0 ${W} ${Math.round(h)}`}
        preserveAspectRatio="xMidYMax slice"
      >
        <Defs>
          {/* 顶部雾化：草丛上缘渐隐入内容白场（冻结稿草顶 ~93% 无硬切线） */}
          <LinearGradient id="grass-mist" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F6FAFA" stopOpacity="0.95" />
            <Stop offset="0.55" stopColor="#F6FAFA" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#F6FAFA" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* 底部草体质量感：多层错落低透明橄榄色宽带，避免直线土缘 */}
        <Ellipse cx={70} cy={h} rx={110} ry={12} fill="#73882B" opacity={0.07} />
        <Ellipse cx={215} cy={h} rx={150} ry={10} fill="#779034" opacity={0.06} />
        <Ellipse cx={355} cy={h} rx={125} ry={14} fill="#82935D" opacity={0.09} />
        <Ellipse cx={430} cy={h - 2} rx={90} ry={16} fill="#73882B" opacity={0.08} />
        <Ellipse cx={0} cy={h - 1} rx={80} ry={15} fill="#82935D" opacity={0.08} />

        {/* 从属石头：低对比灰绿，保持次要 */}
        <Ellipse cx={88} cy={h - 6} rx={30} ry={9} fill="#5F7A74" opacity={0.16} />
        <Ellipse cx={362} cy={h - 4} rx={23} ry={7} fill="#8797A7" opacity={0.14} />

        {BLADES.map((blade, index) => (
          <Path
            key={index}
            d={`M ${blade.x.toFixed(1)} ${h} Q ${(
              blade.x +
              blade.tip * blade.curve
            ).toFixed(1)} ${(h - h * blade.ratio * 0.62).toFixed(1)} ${(
              blade.x + blade.tip
            ).toFixed(1)} ${(h - h * blade.ratio).toFixed(1)}`}
            fill="none"
            stroke={blade.color}
            strokeWidth={blade.width.toFixed(2)}
            strokeLinecap="round"
            opacity={blade.opacity.toFixed(2)}
          />
        ))}

        {/* 雾化渐隐层盖在草叶之上，让叶尖溶进白场 */}
        <Rect x="0" y="0" width={W} height={Math.round(h * 0.6)} fill="url(#grass-mist)" />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  } as ViewStyle,
});
