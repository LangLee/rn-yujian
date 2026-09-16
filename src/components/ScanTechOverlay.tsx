import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * 识别过程科技感动态模版（P03）：
 * 全屏照片之上，居中一个缩小的识别取景框 —— 框内呼吸辉光 + 扫描线往返、
 * 框边两枚光点沿四边循环流动、金色四角括号呼吸；
 * 框外倾斜青蓝/淡金/薄雾三层光带循环下扫、双向彗尾流光细线掠过全屏。
 * 所有动效只驱动 transform / opacity（native driver）；Reduce Motion 冻结为静态构图。
 */

const TEAL = '#4D9EA1';
const TEAL_BRIGHT = '#9FF2E8';
const GOLD = '#EAD9AE';
const GOLD_DEEP = '#D9AF69';
const MIST = '#BFEFE7';

/** 识别取景框：居中缩小（约 80% 宽 / 50% 高），扫描动作集中在框内 */
const FRAME_W_RATIO = 0.8;
const FRAME_H_RATIO = 0.5;
const FRAME_TOP_RATIO = 0.16;
const FRAME_RADIUS = 16;
const CORNER_LEN = 30;
const CORNER_BORDER = 2.5;
const BEAM_ROTATE = '-12deg';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface BandStop {
  offset: string;
  color: string;
  opacity: string;
}

const TEAL_BAND: BandStop[] = [
  { offset: '0', color: TEAL, opacity: '0' },
  { offset: '0.22', color: TEAL, opacity: '0.16' },
  { offset: '0.4', color: TEAL, opacity: '0.42' },
  { offset: '0.5', color: TEAL_BRIGHT, opacity: '0.6' },
  { offset: '0.6', color: TEAL, opacity: '0.42' },
  { offset: '0.78', color: TEAL, opacity: '0.16' },
  { offset: '1', color: TEAL, opacity: '0' },
];

const GOLD_BAND: BandStop[] = [
  { offset: '0', color: GOLD_DEEP, opacity: '0' },
  { offset: '0.3', color: GOLD_DEEP, opacity: '0.12' },
  { offset: '0.5', color: '#F6E7C4', opacity: '0.42' },
  { offset: '0.7', color: GOLD_DEEP, opacity: '0.12' },
  { offset: '1', color: GOLD_DEEP, opacity: '0' },
];

const MIST_BAND: BandStop[] = [
  { offset: '0', color: MIST, opacity: '0' },
  { offset: '0.5', color: MIST, opacity: '0.15' },
  { offset: '1', color: MIST, opacity: '0' },
];

/**
 * 倾斜扫描光带：垂直渐变色带 + 中心流光线（横向渐隐），
 * 整条随 translateY 自画面上方扫到下方，淡入淡出循环。
 */
const ScanBeam: React.FC<{
  gradientId: string;
  height: number;
  travel: number;
  duration: number;
  delay: number;
  tint: 'teal' | 'gold' | 'mist';
  peakOpacity: number;
  reduceMotion: boolean;
}> = ({ gradientId, height, travel, duration, delay, tint, peakOpacity, reduceMotion }) => {
  const { width } = useWindowDimensions();
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      y.setValue(travel * 0.42);
      opacity.setValue(tint === 'mist' ? 0.5 : 0.7);
      return;
    }
    let active = true;
    const loop = async () => {
      await wait(delay);
      while (active) {
        y.setValue(0);
        opacity.setValue(0);
        await new Promise<void>((resolve) => {
          Animated.parallel([
            Animated.timing(y, {
              toValue: travel,
              duration,
              easing: tint === 'mist' ? Easing.inOut(Easing.quad) : Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(opacity, {
                toValue: peakOpacity,
                duration: duration * 0.22,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0.1,
                duration: duration * 0.78,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]).start(() => resolve());
        });
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [reduceMotion, y, opacity, travel, duration, delay, tint, peakOpacity]);

  const band = tint === 'teal' ? TEAL_BAND : tint === 'gold' ? GOLD_BAND : MIST_BAND;
  const coreColor = tint === 'teal' ? '#F3FBF9' : tint === 'gold' ? '#FFF6DF' : '#F0FDFA';

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -width * 0.35,
        width: width * 1.7,
        height,
        top: -height,
        opacity,
        transform: [{ translateY: y }, { rotate: BEAM_ROTATE }],
      }}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id={`${gradientId}-band`} x1="0" y1="0" x2="0" y2="1">
            {band.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ))}
          </LinearGradient>
          <LinearGradient id={`${gradientId}-core`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GOLD} stopOpacity="0" />
            <Stop offset="0.5" stopColor={coreColor} stopOpacity="0.95" />
            <Stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill={`url(#${gradientId}-band)`} />
        <Rect
          x="0"
          y={height / 2 - 1.25}
          width="100%"
          height={2.5}
          fill={`url(#${gradientId}-core)`}
        />
      </Svg>
    </Animated.View>
  );
};

/** 框内水平扫描线：多级拖尾 + 发光亮芯，在识别框内自上而下再返回，往返循环。 */
const ScanLine: React.FC<{ travel: number; duration: number; reduceMotion: boolean }> = ({
  travel,
  duration,
  reduceMotion,
}) => {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      y.setValue(travel * 0.5);
      return;
    }
    let active = true;
    const loop = async () => {
      await wait(600);
      while (active) {
        y.setValue(0);
        await new Promise<void>((resolve) => {
          Animated.timing(y, {
            toValue: travel,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start(() => resolve());
        });
        if (!active) {
          break;
        }
        await new Promise<void>((resolve) => {
          Animated.timing(y, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }).start(() => resolve());
        });
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [reduceMotion, y, travel, duration]);

  return (
    <View pointerEvents="none" style={scanLineStyles.container}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        <View style={scanLineStyles.trailFar} />
        <View style={scanLineStyles.trailMid} />
        <View style={scanLineStyles.trailNear} />
        <View style={scanLineStyles.core} />
      </Animated.View>
    </View>
  );
};

/**
 * 彗尾流光细线：SVG 横向渐变拖尾 + 亮头，左右双向掠过并淡出，
 * 多条错相、异速、异向排布，形成数据川流的感觉。
 */
const Streak: React.FC<{
  gradientId: string;
  top: number;
  streakWidth: number;
  duration: number;
  delay: number;
  color: string;
  headColor: string;
  direction: 1 | -1;
  screenWidth: number;
}> = ({ gradientId, top, streakWidth, duration, delay, color, headColor, direction, screenWidth }) => {
  const x = useRef(
    new Animated.Value(direction === 1 ? -streakWidth - 40 : screenWidth + 40),
  ).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const start = direction === 1 ? -streakWidth - 40 : screenWidth + 40;
  const end = direction === 1 ? screenWidth + 40 : -streakWidth - 40;

  useEffect(() => {
    let active = true;
    const loop = async () => {
      await wait(delay);
      while (active) {
        x.setValue(start);
        opacity.setValue(0);
        await new Promise<void>((resolve) => {
          Animated.parallel([
            Animated.timing(x, {
              toValue: end,
              duration,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(opacity, {
                toValue: 0.9,
                duration: duration * 0.35,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: duration * 0.65,
                useNativeDriver: true,
              }),
            ]),
          ]).start(() => resolve());
        });
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [x, opacity, duration, delay, start, end]);

  const tailStops =
    direction === 1
      ? [
          { offset: '0', color, opacity: '0' },
          { offset: '0.45', color, opacity: '0.28' },
          { offset: '0.8', color, opacity: '0.75' },
          { offset: '1', color: headColor, opacity: '0.95' },
        ]
      : [
          { offset: '0', color: headColor, opacity: '0.95' },
          { offset: '0.2', color, opacity: '0.75' },
          { offset: '0.55', color, opacity: '0.28' },
          { offset: '1', color, opacity: '0' },
        ];

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: streakWidth,
        height: 2,
        opacity,
        transform: [{ translateX: x }],
        shadowColor: headColor,
        shadowRadius: 4,
        shadowOpacity: 0.7,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <Svg width="100%" height={2}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            {tailStops.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
                stopOpacity={stop.opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0.25" width="100%" height={1.5} rx={0.75} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
};

/**
 * 框边流光点：随共享进度 t（0→1 匀速循环）沿识别框四边流动。
 * 两个相位差半圈的变体共用同一条时间轴，各自映射到周长上的不同段落。
 */
const PerimeterRunner: React.FC<{
  t: Animated.Value;
  frameW: number;
  frameH: number;
  variant: 'lead' | 'lag';
  color: string;
}> = ({ t, frameW, frameH, variant, color }) => {
  const P = 2 * (frameW + frameH);
  const stops = [0, frameW / P, (frameW + frameH) / P, (2 * frameW + frameH) / P, 1];
  const translateX = t.interpolate({
    inputRange: stops,
    outputRange: variant === 'lead' ? [0, frameW, frameW, 0, 0] : [frameW, frameW, 0, 0, frameW],
  });
  const translateY = t.interpolate({
    inputRange: stops,
    outputRange: variant === 'lead' ? [0, 0, frameH, frameH, 0] : [frameH, frameH, frameH, 0, 0],
  });

  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: color,
        shadowColor: color,
        shadowRadius: 7,
        shadowOpacity: 0.95,
        shadowOffset: { width: 0, height: 0 },
        elevation: 5,
        transform: [{ translateX }, { translateY }],
      }}
    />
  );
};

/**
 * 全屏科技感扫描层：护底 + 网格 + 三层倾斜光带 + 双向流光 + 居中识别框
 * （框内辉光与扫描线、框边流光点、金色四角与刻度）。
 * 纯装饰，pointerEvents 全部关闭；Reduce Motion 时保留静态构图。
 */
export const ScanTechOverlay: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const { width, height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0.5)).current;
  const runnerT = useRef(new Animated.Value(0)).current;

  const frameW = Math.round(width * FRAME_W_RATIO);
  const frameH = Math.round(height * FRAME_H_RATIO);
  const frameLeft = Math.round((width - frameW) / 2);
  const frameTop = Math.round(height * FRAME_TOP_RATIO);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.75);
      runnerT.setValue(0.13);
      return;
    }
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    const runnerLoop = Animated.loop(
      Animated.timing(runnerT, {
        toValue: 1,
        duration: 4600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    runnerLoop.start();
    return () => {
      pulseLoop.stop();
      runnerLoop.stop();
    };
  }, [reduceMotion, pulse, runnerT]);

  const frameOpacity = pulse.interpolate({ inputRange: [0.5, 1], outputRange: [0.35, 0.85] });
  const cornerOpacity = pulse.interpolate({ inputRange: [0.5, 1], outputRange: [0.7, 1] });
  const glowOpacity = pulse.interpolate({ inputRange: [0.5, 1], outputRange: [0.45, 1] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.fx]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={styles.topBand} />
      <View style={styles.bottomBand} />

      {/* 细网格：低透明度青蓝线，衬出仪器取景的观感 */}
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: Math.round((width * i) / 6) }]} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: Math.round((height * i) / 7) }]} />
      ))}

      {/* 倾斜扫描光带：主青蓝 + 副淡金 + 薄雾底层，错相循环下扫 */}
      <ScanBeam
        gradientId="scan-beam-teal"
        height={205}
        travel={height + 410}
        duration={2700}
        delay={120}
        tint="teal"
        peakOpacity={1}
        reduceMotion={reduceMotion}
      />
      <ScanBeam
        gradientId="scan-beam-gold"
        height={118}
        travel={height + 236}
        duration={3900}
        delay={1750}
        tint="gold"
        peakOpacity={0.85}
        reduceMotion={reduceMotion}
      />
      <ScanBeam
        gradientId="scan-beam-mist"
        height={280}
        travel={height + 560}
        duration={5200}
        delay={900}
        tint="mist"
        peakOpacity={0.6}
        reduceMotion={reduceMotion}
      />

      {/* 双向彗尾流光细线：多条错相、异速排布 */}
      {!reduceMotion ? (
        <>
          <Streak
            gradientId="scan-streak-1"
            top={Math.round(height * 0.13)}
            streakWidth={96}
            duration={1500}
            delay={300}
            color={TEAL_BRIGHT}
            headColor="#EAFFFB"
            direction={1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-2"
            top={Math.round(height * 0.24)}
            streakWidth={60}
            duration={1200}
            delay={950}
            color={GOLD}
            headColor="#FFF6DF"
            direction={-1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-3"
            top={Math.round(height * 0.33)}
            streakWidth={124}
            duration={1800}
            delay={650}
            color={TEAL_BRIGHT}
            headColor="#EAFFFB"
            direction={1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-4"
            top={Math.round(height * 0.45)}
            streakWidth={84}
            duration={1350}
            delay={1400}
            color={GOLD}
            headColor="#FFF6DF"
            direction={1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-5"
            top={Math.round(height * 0.57)}
            streakWidth={104}
            duration={1650}
            delay={500}
            color={TEAL_BRIGHT}
            headColor="#EAFFFB"
            direction={-1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-6"
            top={Math.round(height * 0.7)}
            streakWidth={56}
            duration={1150}
            delay={1100}
            color={GOLD}
            headColor="#FFF6DF"
            direction={1}
            screenWidth={width}
          />
          <Streak
            gradientId="scan-streak-7"
            top={Math.round(height * 0.81)}
            streakWidth={88}
            duration={1500}
            delay={800}
            color={TEAL_BRIGHT}
            headColor="#EAFFFB"
            direction={-1}
            screenWidth={width}
          />
        </>
      ) : null}

      {/* 居中识别取景框：辉光 + 扫描线 + 发光描边 + 金色四角 + 刻度 + 框边流光点 */}
      <View style={[styles.frameBox, { left: frameLeft, top: frameTop, width: frameW, height: frameH }]}>
        {/* 框内呼吸辉光（径向渐变） */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: glowOpacity }]}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="scan-inner-glow" cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={TEAL_BRIGHT} stopOpacity="0.14" />
                <Stop offset="0.55" stopColor={TEAL} stopOpacity="0.07" />
                <Stop offset="1" stopColor={TEAL} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#scan-inner-glow)" />
          </Svg>
        </Animated.View>

        {/* 框内水平扫描线（裁剪在框内） */}
        <ScanLine travel={frameH} duration={3400} reduceMotion={reduceMotion} />

        {/* 发光描边（呼吸） */}
        <Animated.View style={[styles.frameBorder, { opacity: frameOpacity }]} />

        {/* 框边流光点：两枚相位差半圈，沿四边循环流动 */}
        <View style={[styles.runnerTrack, { width: frameW, height: frameH }]} pointerEvents="none">
          <PerimeterRunner t={runnerT} frameW={frameW} frameH={frameH} variant="lead" color={GOLD} />
          <PerimeterRunner t={runnerT} frameW={frameW} frameH={frameH} variant="lag" color={TEAL_BRIGHT} />
        </View>

        {/* 金色四角括号（呼吸） */}
        <Animated.View style={[styles.corner, styles.cornerTL, { opacity: cornerOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerTR, { opacity: cornerOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerBL, { opacity: cornerOpacity }]} />
        <Animated.View style={[styles.corner, styles.cornerBR, { opacity: cornerOpacity }]} />

        {/* 四边中点短刻度 */}
        <View style={styles.tickTop} />
        <View style={styles.tickBottom} />
        <View style={styles.tickLeft} />
        <View style={styles.tickRight} />
      </View>
    </View>
  );
};

const scanLineStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: FRAME_RADIUS,
  } as ViewStyle,
  trailFar: {
    height: 26,
    backgroundColor: 'rgba(77,158,161,0.04)',
  } as ViewStyle,
  trailMid: {
    height: 14,
    backgroundColor: 'rgba(77,158,161,0.08)',
  } as ViewStyle,
  trailNear: {
    height: 7,
    backgroundColor: 'rgba(77,158,161,0.16)',
  } as ViewStyle,
  core: {
    height: 2,
    backgroundColor: 'rgba(200,255,246,0.9)',
    shadowColor: TEAL_BRIGHT,
    shadowRadius: 9,
    shadowOpacity: 0.85,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  } as ViewStyle,
});

const styles = StyleSheet.create({
  fx: {
    overflow: 'hidden',
  } as ViewStyle,
  scrim: {
    backgroundColor: 'rgba(8,24,30,0.30)',
  } as ViewStyle,
  topBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    backgroundColor: 'rgba(6,18,23,0.38)',
  } as ViewStyle,
  bottomBand: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 210,
    backgroundColor: 'rgba(6,18,23,0.45)',
  } as ViewStyle,
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(159,242,232,0.05)',
  } as ViewStyle,
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(159,242,232,0.05)',
  } as ViewStyle,
  frameBox: {
    position: 'absolute',
  } as ViewStyle,
  frameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(159,242,232,0.45)',
    borderRadius: FRAME_RADIUS,
    shadowColor: TEAL_BRIGHT,
    shadowRadius: 12,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 0 },
  } as ViewStyle,
  runnerTrack: {
    position: 'absolute',
    left: -3,
    top: -3,
  } as ViewStyle,
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowRadius: 8,
    shadowOpacity: 0.65,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  } as ViewStyle,
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderTopLeftRadius: 12,
  } as ViewStyle,
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderTopRightRadius: 12,
  } as ViewStyle,
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderBottomLeftRadius: 12,
  } as ViewStyle,
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderBottomRightRadius: 12,
  } as ViewStyle,
  tickTop: {
    position: 'absolute',
    top: -1,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(234,217,174,0.6)',
  } as ViewStyle,
  tickBottom: {
    position: 'absolute',
    bottom: -1,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(234,217,174,0.6)',
  } as ViewStyle,
  tickLeft: {
    position: 'absolute',
    left: -1,
    top: '50%',
    marginTop: -7,
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: 'rgba(234,217,174,0.6)',
  } as ViewStyle,
  tickRight: {
    position: 'absolute',
    right: -1,
    top: '50%',
    marginTop: -7,
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: 'rgba(234,217,174,0.6)',
  } as ViewStyle,
});
