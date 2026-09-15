import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/**
 * 空状态核心图案（聚焦插画主体、去除环境的线性图形）。
 * 透明背景，颜色由外部注入（主题 accent / 次要色），
 * 同一份资源随清晨/白天/傍晚/夜晚主题变化，与背景协调。
 */
export type EmptyStateVariant = 'home' | 'myCatch' | 'fishbook' | 'memory' | 'search' | 'today';

interface EmptyIllustrationProps {
  variant: EmptyStateVariant;
  /** 主体线条色 */
  color: string;
  /** 弱元素色（水波、气泡、月亮等） */
  mutedColor: string;
  /** 显示高度，默认 108 */
  height?: number;
}

/** 统一描边风格：圆头圆角、线性不填充 */
const strokeProps = (color: string, width = 3) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

/** 1. 首页无鱼获：跃出水面的鱼 + 涟漪（视觉主体中心对齐 viewBox 中线 x=80） */
const HomeArt: React.FC<{ color: string; mutedColor: string }> = ({ color, mutedColor }) => (
  <>
    <G {...strokeProps(color)}>
      <Path d="M59 40 C69 26 95 22 109 34 C113 37 116 40 117 43 C116 46 113 49 109 52 C95 64 69 60 59 46 C58 44 58 42 59 40 Z" />
      <Path d="M59 43 L43 30 L49 43 L43 56 Z" />
      {/* 背鳍：两端落在鱼身上缘轮廓上 */}
      <Path d="M79 29 Q89 16 99 24" />
    </G>
    <Circle cx={103} cy={40} r={1.7} fill={color} />
    <G {...strokeProps(mutedColor, 2.4)} opacity={0.55}>
      {/* 涟漪：以鱼为中心对称分布 */}
      <Path d="M59 76 Q80 86 101 76" />
      <Path d="M39 78 Q47 83 55 80" />
      <Path d="M105 80 Q113 84 121 81" />
      <Circle cx={57} cy={62} r={1.5} fill={mutedColor} stroke="none" />
      <Circle cx={125} cy={66} r={1.2} fill={mutedColor} stroke="none" />
    </G>
  </>
);

/** 2. 我的鱼获为空：钓箱 + 斜插鱼竿 + 水波 */
const MyCatchArt: React.FC<{ color: string; mutedColor: string }> = ({ color, mutedColor }) => (
  <>
    <G {...strokeProps(color)}>
      <Rect x={46} y={54} width={50} height={28} rx={6} />
      <Path d="M46 63 L96 63" />
      <Path d="M60 54 C60 45 82 45 82 54" />
      <Path d="M122 22 Q104 38 92 54" />
      {/* 渔线从竿梢（122,22）同点引出，避免脱节 */}
      <Path d="M122 22 Q138 40 134 58 Q132 66 126 64" />
    </G>
    <G {...strokeProps(mutedColor, 2.4)} opacity={0.55}>
      <Path d="M30 90 Q50 95 70 90 T110 90" />
    </G>
  </>
);

/** 3. 图鉴为零：圆域内的鱼 + 未点亮的气泡 + 水草 */
const FishbookArt: React.FC<{ color: string; mutedColor: string }> = ({ color, mutedColor }) => (
  <>
    <G {...strokeProps(color)}>
      <Circle cx={80} cy={50} r={28} />
      <Path d="M64 50 C69 44 78 42 85 47 L90 43 L90 57 L85 53 C78 58 69 56 64 50 Z" />
    </G>
    {/* 眼点在头部内侧，避开轮廓线 */}
    <Circle cx={81} cy={48.5} r={1.4} fill={color} />
    <G {...strokeProps(mutedColor, 2.4)} opacity={0.5}>
      <Circle cx={34} cy={38} r={3} />
      <Circle cx={126} cy={34} r={4} />
      <Circle cx={122} cy={66} r={2.5} />
      <Path d="M48 90 Q52 80 48 72" />
      <Path d="M112 90 Q108 82 112 74" />
    </G>
  </>
);

/** 4. 回忆不完整：半浸水面的照片（内有山水）+ 波纹 */
const MemoryArt: React.FC<{ color: string; mutedColor: string }> = ({ color, mutedColor }) => (
  <>
    {/* 照片整体下移，底缘压到主波纹上形成半浸感 */}
    <G {...strokeProps(color)} transform="rotate(-8 80 54)">
      <Rect x={50} y={30} width={58} height={46} rx={5} />
      <Path d="M58 66 L68 54 L74 61 L80 54 L86 62" />
      <Circle cx={97} cy={42} r={4} />
    </G>
    <G {...strokeProps(mutedColor, 2.4)} opacity={0.55}>
      <Path d="M30 84 Q45 78 60 84 T90 84 T120 84" />
      <Path d="M44 94 Q59 88 74 94 T104 94" opacity={0.6} />
    </G>
  </>
);

/** 5. 鱼种搜索无结果：鱼看向放大镜（头朝右）+ 放大镜 */
const SearchArt: React.FC<{ color: string; mutedColor: string }> = ({ color }) => (
  <>
    <G {...strokeProps(color)}>
      {/* 头朝右的鱼：视线朝向放大镜 */}
      <Path d="M68 46 C60 36 40 34 30 42 L24 37 L24 55 L30 50 C40 58 60 56 68 46 Z" />
      <Path d="M54 36 Q48 28 40 33" />
      <Circle cx={106} cy={58} r={15} />
      <Path d="M117 69 L131 83" strokeWidth={4} />
    </G>
    <Circle cx={38} cy={44} r={1.5} fill={color} />
  </>
);

/** 6. 今日无鱼获：月下小渔船 + 水波 */
const TodayArt: React.FC<{ color: string; mutedColor: string }> = ({ color, mutedColor }) => (
  <>
    <G {...strokeProps(color)}>
      <Path d="M44 62 Q80 68 116 62 Q112 78 96 79 L64 79 Q48 78 44 62 Z" />
      <Rect x={68} y={50} width={16} height={12} rx={2} />
      {/* 桅杆下端止于船舷上缘（y=62），不穿透 */}
      <Path d="M102 62 L102 36" />
      <Path d="M102 36 L112 40 L102 44" />
    </G>
    <G {...strokeProps(mutedColor, 2.4)} opacity={0.55}>
      <Circle cx={30} cy={30} r={6} />
      <Path d="M26 90 Q46 95 66 90 T106 90 T130 90" />
    </G>
  </>
);

const artFor: Record<EmptyStateVariant, React.FC<{ color: string; mutedColor: string }>> = {
  home: HomeArt,
  myCatch: MyCatchArt,
  fishbook: FishbookArt,
  memory: MemoryArt,
  search: SearchArt,
  today: TodayArt,
};

export const EmptyIllustration: React.FC<EmptyIllustrationProps> = ({
  variant,
  color,
  mutedColor,
  height = 108,
}) => {
  const Art = artFor[variant];
  const [boxWidth, setBoxWidth] = React.useState(0);
  // 显式等比尺寸（比例与 viewBox 160:100 一致），不依赖 preserveAspectRatio 的
  // 平台差异（meet 在部分平台对齐异常导致图案居左），实测容器宽后取窄边
  const svgWidth = boxWidth > 0 ? Math.min(boxWidth, Math.round(height * 1.6)) : Math.round(height * 1.6);
  return (
    <View
      style={{ width: '100%', height, alignItems: 'center', backgroundColor: 'transparent' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - boxWidth) > 0.5) {
          setBoxWidth(w);
        }
      }}
      pointerEvents="none"
    >
      {/* Svg 根视图在部分平台会带默认背景，显式置透明，避免图案区出现非圆角色块 */}
      <Svg
        viewBox="0 0 160 100"
        width={svgWidth}
        height={height}
        style={{ backgroundColor: 'transparent' }}
      >
        <Art color={color} mutedColor={mutedColor} />
      </Svg>
    </View>
  );
};
