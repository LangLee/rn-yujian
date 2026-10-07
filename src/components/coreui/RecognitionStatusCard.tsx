import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TextStyle, View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { font, fs } from '../../constants/tokens';
import { AI_BLUE_CORE, AI_BLUE_HOT, AI_GOLD_CORE, AI_GOLD_HOT, STATUS_BG, STATUS_TEXT_SECONDARY } from './AIAmbientField';

/**
 * RecognitionStatusCard —— 识别处理状态卡（冻结规格
 * design/pages/recognition/processing/spec/Recognition_Processing_Visual_Spec_V1_1.md
 * 「Status overlay」节；V1.2 三状态映射）。
 *
 * 默认变体（图片识别中·早 / 已定位到鱼体 / 鱼种识别中）：
 *   名义高 112dp、圆角 30dp、#1A2C35 @ 0.85、金色 #F6D99B @ ~0.50 1dp 边、
 *   水平内边距 28dp、指示器 54dp / 4dp 环、标题 20sp medium、副标题 14sp。
 * 轻量变体（图片识别中·晚关键帧 02「正在理解照片」）：指示器 40dp / 3dp 环、
 *   标题 18sp、副标题 14sp、无大面积深色玻璃（更透明胶囊衬底 + 亮金边）。
 * 环形指示器：蓝/金双弧反向慢旋 + 弱底轨、中空（无进度语义）。
 * 禁止：HUD、scanner frame、loading bar。
 */

interface RecognitionStatusCardProps {
  title: string;
  subtitle: string;
  /** 轻量变体（图片识别中·晚：无深色玻璃底） */
  lightweight?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const RecognitionStatusCard: React.FC<RecognitionStatusCardProps> = ({
  title,
  subtitle,
  lightweight = false,
  style,
}) => {
  const { reduceMotion } = useTheme();
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  const RING = lightweight ? 40 : 54;
  const RING_STROKE = lightweight ? 3 : 4;
  const trackR = RING / 2 - RING_STROKE / 2 - 1;
  const trackCirc = 2 * Math.PI * trackR;

  /* 蓝弧顺时针慢旋（~4.6s/圈） */
  const blueArc = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(blueArc, {
        toValue: 1,
        duration: 4600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, blueArc]);

  /* 金弧逆时针慢旋（~6.2s/圈） */
  const goldArc = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(goldArc, {
        toValue: 1,
        duration: 6200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, goldArc]);

  const blueAngle = blueArc.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const goldAngle = goldArc.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={[lightweight ? styles.cardLight : styles.card, style]}>
      {/* AI Ring Indicator：双弧 + 弱底轨（中空） */}
      <View style={[styles.ringWrap, { width: RING, height: RING }]}>
        <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`rb${uid}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={AI_BLUE_HOT} />
              <Stop offset="1" stopColor={AI_BLUE_CORE} />
            </LinearGradient>
            <LinearGradient id={`rg${uid}`} x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={AI_GOLD_HOT} />
              <Stop offset="1" stopColor={AI_GOLD_CORE} />
            </LinearGradient>
          </Defs>
          {/* 底轨 */}
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={trackR}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
          />
        </Svg>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: reduceMotion ? '20deg' : blueAngle }] }]}
          pointerEvents="none"
        >
          <Svg width={RING} height={RING} pointerEvents="none">
            {/* 蓝弧（约 120° 扇段） */}
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={trackR}
              fill="none"
              stroke={`url(#rb${uid})`}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${trackCirc / 3} ${trackCirc}`}
            />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: reduceMotion ? '200deg' : goldAngle }] }]}
          pointerEvents="none"
        >
          <Svg width={RING} height={RING} pointerEvents="none">
            {/* 金弧（约 70° 扇段） */}
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={trackR}
              fill="none"
              stroke={`url(#rg${uid})`}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${trackCirc / 5} ${trackCirc}`}
            />
          </Svg>
        </Animated.View>
      </View>

      {/* 文案 */}
      <View style={styles.textCol}>
        <Text style={[lightweight ? styles.titleLight : styles.title, lightweight && styles.textShadow]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[lightweight ? styles.subtitleLight : styles.subtitle, lightweight && styles.textShadow]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** 深色半透明玻璃：#1A2C35 @ 0.85 + 1.2dp 亮金边（关键帧金边清晰可辨）+ 30dp 圆角 + 名义高 112dp */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    minHeight: 112,
    backgroundColor: STATUS_BG,
    borderRadius: 30,
    borderWidth: 1.2,
    borderColor: 'rgba(246,217,155,0.8)',
    paddingHorizontal: 28,
    // 极轻投影托起玻璃片;金边柔光外溢呼应边缘光场
    shadowColor: '#F6D99B',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  } as ViewStyle,
  /** 轻量变体（图片识别中·晚关键帧 02）：更透明的玻璃胶囊 + 明亮暖金边 */
  cardLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(26,44,53,0.34)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(246,217,155,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#F6D99B',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  } as ViewStyle,
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  textCol: {
    flex: 1,
    gap: 4,
  } as ViewStyle,
  /** 标题 20sp medium（冻结规格 Status overlay） */
  title: {
    fontFamily: font.serif,
    fontSize: fs(20),
    fontWeight: '600',
    letterSpacing: 2,
    color: '#F4F9FA',
  } as TextStyle,
  titleLight: {
    fontFamily: font.serif,
    fontSize: fs(18),
    fontWeight: '600',
    letterSpacing: 2,
    color: '#F4F9FA',
  } as TextStyle,
  /** 副标题 14sp */
  subtitle: {
    fontFamily: font.sans,
    fontSize: fs(14),
    lineHeight: fs(20),
    letterSpacing: 0.5,
    color: STATUS_TEXT_SECONDARY,
  } as TextStyle,
  subtitleLight: {
    fontFamily: font.sans,
    fontSize: fs(14),
    lineHeight: fs(20),
    letterSpacing: 0.5,
    color: STATUS_TEXT_SECONDARY,
  } as TextStyle,
  /** 轻量变体直压照片，加极弱文字投影保可读 */
  textShadow: {
    textShadowColor: 'rgba(8,24,30,0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
});
