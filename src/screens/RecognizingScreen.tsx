import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { FishIllustration } from '../components/FishIllustration';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { spacing, typeScale } from '../constants/tokens';

type RecognizingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Recognizing'>;

/** P03 状态文案：单步轮换，不显示技术流程列表（7.2 / 17.7）。 */
const PHASES = ['正在观察鱼体', '正在寻找它的特征', '正在匹配鱼种'];
const LONG_WAIT_COPY = '还在仔细看看这条鱼……';
const VERY_LONG_COPY = '这次识别花得久一点';

const PHASE_INTERVAL_MS = 2400;
const MIN_VISIBLE_MS = 800;
const LONG_WAIT_MS = 3000;
const VERY_LONG_MS = 6000;
const TIMEOUT_MS = 45000;

/** 状态文案淡出 → 换词 → 淡入（Fade out 120-160ms，Gap ~60ms，Fade in 180-220ms）。 */
const PhaseText: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(text);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      setShown(text);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (text === shown) {
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setShown(text);
      setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }, 60);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <Animated.Text style={[styles.phase, { color, opacity }]}>{shown}</Animated.Text>;
};

/** 极轻水波扩散：Alpha 0.10 → 0，Duration 1800-2600ms，间隔不规则（17.7）。 */
const Ripple: React.FC<{ index: number; color: string; amplitude: number }> = ({
  index,
  color,
  amplitude,
}) => {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const runOnce = () =>
      new Promise<void>((resolve) => {
        scale.setValue(0.5);
        opacity.setValue(0.1 * amplitude);
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.7,
            duration: 2200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      });
    const loop = async () => {
      // 不同初始相位去同步（17.34）
      await new Promise<void>((resolve) => setTimeout(() => resolve(), index * 1300));
      while (active) {
        await runOnce();
        const gap = 1600 + Math.random() * 1800;
        await new Promise<void>((resolve) => setTimeout(() => resolve(), gap));
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [scale, opacity, index, amplitude]);

  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          borderColor: color,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
};

/**
 * P03 识别处理中（设计文档 7.2 / 17.7 / 17.32）：
 * 等待自然、安静；不展示"分离好的鱼"、不显示百分比 / 流程列表 / 扫描圈。
 * 业务状态优先：识别 Ready 立即进入 P04，不为播完动画延迟结果。
 */
export const RecognizingScreen: React.FC = () => {
  const navigation = useNavigation<RecognizingScreenNavigationProp>();
  const { recognizeAndRecord } = useRecognition();
  const { profile, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [longWait, setLongWait] = useState(false);
  const [veryLong, setVeryLong] = useState(false);

  const startedAt = useMemo(() => Date.now(), []);

  // 识别主流程
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await recognizeAndRecord();
        if (cancelled) {
          return;
        }
        const elapsed = Date.now() - startedAt;
        const proceed = () => {
          if (result.ready && result.prediction) {
            navigation.replace('Result');
          } else {
            navigation.replace('RecognitionIssue');
          }
        };
        if (elapsed < MIN_VISIBLE_MS) {
          setTimeout(proceed, MIN_VISIBLE_MS - elapsed);
        } else {
          proceed();
        }
      } catch {
        if (!cancelled) {
          navigation.replace('RecognitionIssue');
        }
      }
    })();
    const timeout = setTimeout(() => {
      if (!cancelled) {
        navigation.replace('RecognitionIssue');
      }
    }, TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [recognizeAndRecord, navigation, startedAt]);

  // 文案轮换 + 长等待文案（17.32）
  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseIndex((value) => Math.min(value + 1, PHASES.length - 1));
    }, PHASE_INTERVAL_MS);
    const longTimer = setTimeout(() => setLongWait(true), LONG_WAIT_MS);
    const veryLongTimer = setTimeout(() => setVeryLong(true), VERY_LONG_MS);
    return () => {
      clearInterval(phaseTimer);
      clearTimeout(longTimer);
      clearTimeout(veryLongTimer);
    };
  }, []);

  const copy = veryLong ? VERY_LONG_COPY : longWait ? LONG_WAIT_COPY : PHASES[phaseIndex];

  // 鱼影呼吸：Alpha 0.08 → 0.14 → 0.08（2600-3600ms，禁止描边跑光与 CT 扫描感）
  const silhouetteOpacity = useRef(new Animated.Value(0.1)).current;
  useEffect(() => {
    if (reduceMotion) {
      silhouetteOpacity.setValue(0.12);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(silhouetteOpacity, {
          toValue: 0.16,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(silhouetteOpacity, {
          toValue: 0.08,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, silhouetteOpacity]);

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <View style={[styles.center, { paddingBottom: insets.bottom }]} pointerEvents="none">
        {/* 极轻水波 */}
        <Ripple
          index={0}
          color={profile.surface.accent}
          amplitude={profile.motion.rippleAlpha}
        />
        <Ripple
          index={1}
          color={profile.surface.accent}
          amplitude={profile.motion.rippleAlpha}
        />
        {/* 鱼影 */}
        <Animated.View style={{ opacity: silhouetteOpacity }}>
          <FishIllustration size={150} bodyColor={profile.surface.textPrimary} />
        </Animated.View>
        {/* 单步轮换状态文案 */}
        <View style={styles.copyWrap}>
          <PhaseText text={copy} color={profile.surface.textSecondary} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  ripple: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
  } as ViewStyle,
  copyWrap: {
    marginTop: spacing.xl + 12,
    minHeight: 32,
    justifyContent: 'center',
  } as ViewStyle,
  phase: {
    fontSize: typeScale.body,
    letterSpacing: 1,
  } as TextStyle,
});
