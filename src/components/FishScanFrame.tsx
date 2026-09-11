/**
 * FishScanFrame —— 拍照识鱼取景框（写实鱼形剪影）。
 *
 * 视觉：
 *  - 按真实鱼类侧影解剖结构绘制：钝圆吻部、高背弧线、后掠背鳍、
 *    收窄的尾柄、分叉尾鳍、后掠的臀鳍与腹鳍；
 *  - 鳃盖弧线、眼睛（含高光点）、胸鳍、虚线侧线等细节用细线勾勒，
 *    强化“真鱼”质感；
 *  - 描边为横向渐变：左香槟金 → 右银蓝白；
 *  - 一段白色高光沿主轮廓缓慢巡游（流光），Reduce Motion 时静止；
 *  - 轮廓下方叠一层同渐变的柔光描边，让细线在湖面上仍有存在感。
 */
import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

interface FishScanFrameProps {
  /** 轮廓宽度（高度按 264/568 比例推导） */
  width: number;
  style?: StyleProp<ViewStyle>;
}

/** 主轮廓（viewBox 内手工绘制：吻部朝左，顺时针走线，鳍尖均后掠） */
const FISH_PATH = [
  'M 46 186',
  // 吻部 → 额头 → 背鳍前根
  'C 50 162 68 144 100 133',
  'C 126 124 156 116 186 111',
  // 背鳍前缘（外凸）→ 圆滑鳍顶
  'C 208 82 232 58 258 53',
  // 背鳍后缘（内收陡落）
  'C 284 51 312 70 330 97',
  // 背部 → 尾柄 → 上叶尖（单段 S 曲线，过渡无折角）
  'C 370 110 424 132 466 150',
  'C 500 164 548 158 586 97',
  // 上叶后缘 → 尾叉
  'C 592 128 578 160 556 184',
  // 下叶前缘 → 下叶尖
  'C 576 196 588 222 584 252',
  // 下叶后缘 → 尾柄 → 腹部（单段 S 曲线，过渡无折角）
  'C 552 238 506 212 444 239',
  // 臀鳍后缘（短陡）→ 鳍尖（鳍尖落在后根正下方，后掠）
  'C 440 252 434 264 426 272',
  // 臀鳍前缘（长斜）→ 前根
  'C 408 262 394 256 378 247',
  // 腹部中段
  'C 344 254 320 257 296 256',
  'C 282 256 270 255 258 254',
  // 腹鳍后缘（短陡）→ 鳍尖（后掠）
  'C 254 266 252 278 248 286',
  // 腹鳍前缘（长斜）→ 前根
  'C 232 276 214 266 198 256',
  // 喉部 → 下颌
  'C 164 249 124 233 92 214',
  'C 74 204 58 196 46 186',
  'Z',
].join(' ');

/** 鳃盖弧线：自额下向后下方扫过 */
const GILL_PATH = 'M 120 134 C 134 162 138 196 128 228';
/** 胸鳍：鳃盖后方叶形，向后下方展开（略上收，避免贴到腹缘） */
const PECTORAL_PATH = 'M 150 206 C 156 228 174 244 204 250 C 192 236 176 223 166 214 Z';
/** 侧线：鳃后沿体侧中线一直到尾柄（虚点） */
const LATERAL_PATH = 'M 140 186 C 240 196 360 198 498 190';
/** 眼睛位置与半径 */
const EYE = { cx: 96, cy: 169, r: 8.5 };

const VIEW_ASPECT = 264 / 568;
/** 流光巡游：dash 周期略大于主轮廓周长，loop 位移一个周期即无缝衔接 */
const COMET_PERIOD = 2300;
const COMET_LOOP_MS = 8000;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export const FishScanFrame: React.FC<FishScanFrameProps> = ({ width, style }) => {
  const { reduceMotion } = useTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `fishScanGrad${uid}`;

  const cometOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      cometOffset.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(cometOffset, {
        toValue: -COMET_PERIOD,
        duration: COMET_LOOP_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, cometOffset]);

  const height = width * VIEW_ASPECT;

  return (
    <View style={[{ width, height }, styles.container, style]} pointerEvents="none">
      <Svg width={width} height={height} viewBox="32 38 568 264">
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0.2" x2="1" y2="0.8">
            <Stop offset="0" stopColor="#E6C98C" />
            <Stop offset="0.42" stopColor="#D9C592" />
            <Stop offset="0.62" stopColor="#D3D9CE" />
            <Stop offset="1" stopColor="#C2D9E0" />
          </LinearGradient>
        </Defs>

        {/* 柔光底层：让细线在明亮湖面上依然可读 */}
        <Path
          d={FISH_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={5}
          opacity={0.16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 体内细节：鳃盖 / 胸鳍 / 侧线（先画，压在主轮廓之下） */}
        <Path
          d={GILL_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={1.7}
          opacity={0.62}
          strokeLinecap="round"
        />
        <Path
          d={PECTORAL_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={1.7}
          opacity={0.62}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={LATERAL_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={2}
          opacity={0.55}
          strokeLinecap="round"
          strokeDasharray="1.5 11"
        />

        {/* 眼睛：渐变描边圆 + 白色高光点 */}
        <Circle
          cx={EYE.cx}
          cy={EYE.cy}
          r={EYE.r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={2}
          opacity={0.9}
        />
        <Circle cx={EYE.cx - 2.5} cy={EYE.cy - 2.5} r={2} fill="rgba(255,255,255,0.9)" />

        {/* 主轮廓：左金右银渐变细线 */}
        <Path
          d={FISH_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 流光高光：沿主轮廓巡游 */}
        <AnimatedPath
          d={FISH_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`90 ${COMET_PERIOD - 90}`}
          strokeDashoffset={cometOffset as unknown as number}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {} as ViewStyle,
});
