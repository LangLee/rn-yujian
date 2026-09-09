/**
 * FishScanFrame —— 拍照识鱼取景框（还原设计稿鱼形轮廓）。
 *
 * 视觉：
 *  - 一条鱼的完整剪影轮廓线（头左钝圆、圆弧背鳍、尾鳍分叉、臀鳍小突起）；
 *  - 描边为横向渐变：左香槟金 → 右银蓝白；
 *  - 一段白色高光沿轮廓缓慢巡游（流光），8s 一圈，Reduce Motion 时静止；
 *  - 轮廓下方叠一层同渐变的柔光描边，让细线在湖面上仍有存在感。
 */
import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

interface FishScanFrameProps {
  /** 轮廓宽度（高度按 356/616 比例推导） */
  width: number;
  style?: StyleProp<ViewStyle>;
}

/** 鱼形轮廓（viewBox 58 58 616 356 内手工绘制：头左尾右） */
const FISH_PATH = [
  'M 74 255',
  'C 74 213 104 176 148 155',
  'C 186 137 236 124 292 122',
  'C 306 92 334 72 368 72',
  'C 396 72 418 88 426 112',
  'C 430 124 431 132 430 140',
  'C 452 150 482 170 505 194',
  'L 646 106',
  'C 652 102 658 106 655 114',
  'L 574 250',
  'L 574 258',
  'L 652 390',
  'C 656 398 650 406 642 402',
  'L 505 314',
  'C 470 336 420 354 368 360',
  'C 356 386 330 400 302 396',
  'C 282 393 268 380 263 362',
  'C 216 362 168 350 132 330',
  'C 100 312 74 286 74 255',
  'Z',
].join(' ');

const VIEW_ASPECT = 356 / 616;
/** 流光巡游：dash 周期略大于轮廓周长，loop 位移一个周期即无缝衔接 */
const COMET_PERIOD = 2190;
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
      <Svg width={width} height={height} viewBox="58 58 616 356">
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
        {/* 主轮廓：左金右银渐变细线 */}
        <Path
          d={FISH_PATH}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 流光高光：沿轮廓巡游 */}
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
