import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { FishScanFrame } from '../components/FishScanFrame';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { palette } from '../constants/colors';
import { font, spacing, typeScale } from '../constants/tokens';

type RecognizingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Recognizing'>;

/** P03 状态文案：单步轮换，不显示技术流程列表（7.2 / 17.7）。 */
const PHASES = ['正在观察鱼体', '正在寻找它的特征', '正在匹配鱼种'];
const PHASE_HINTS = [
  '让鱼身保持完整，识别会更顺利',
  '鱼鳞、鱼鳍、体型……每一个特征都在比对',
  '正在鱼鉴里为它寻找名字',
];
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

/**
 * 圆形向外扩散水波纹：
 * 多圈同心正圆由鱼身中心向外扩散并淡出，相位错开形成连续水纹。
 * Reduce Motion 时保留静态几圈，不做扩散。
 */
const Ripple: React.FC<{ index: number; reduceMotion: boolean }> = ({ index, reduceMotion }) => {
  const scale = useRef(new Animated.Value(0.42)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;
  const DURATION = 3000;

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(0.6 + index * 0.22);
      opacity.setValue(0.3 - index * 0.08);
      return;
    }
    let active = true;
    const loop = async () => {
      // 相位错开：每圈延迟 1/4 周期
      await new Promise<void>((resolve) => setTimeout(() => resolve(), (index * DURATION) / 4));
      while (active) {
        scale.setValue(0.42);
        opacity.setValue(0.55);
        await new Promise<void>((resolve) => {
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.45,
              duration: DURATION,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: DURATION,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start(() => resolve());
        });
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [scale, opacity, index, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
};

/**
 * P03 识别处理中（设计稿还原版）：
 * 主题环境照片背景 + 中央写实鱼形（与取景框同款）与圆形水波扩散；
 * 上方衬线标题，中部状态轮换文案，底部小贴士气泡。
 * 业务状态优先：识别 Ready 立即进入 P04，不为播完动画延迟结果。
 */
export const RecognizingScreen: React.FC = () => {
  const navigation = useNavigation<RecognizingScreenNavigationProp>();
  const { recognizeAndRecord } = useRecognition();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [longWait, setLongWait] = useState(false);
  const [veryLong, setVeryLong] = useState(false);

  const startedAt = useMemo(() => Date.now(), []);

  // latest ref：识别只随挂载执行一次；退场转场期间 IdentifyScreen 重挂载会 reset 清空
  // image，若把 recognizeAndRecord 放进依赖会导致 effect 重跑并抛“没有可识别的照片”，
  // 覆盖真正的失败原因。
  const recognizeRef = useRef(recognizeAndRecord);
  recognizeRef.current = recognizeAndRecord;

  // 识别主流程
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await recognizeRef.current();
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
      } catch (e) {
        // 异常（非识别"没认出"）直接退回 P02 并带回原因；RecognitionIssue 只承载有结果的 FAILED
        if (!cancelled) {
          navigation.navigate({
            name: 'Identify',
            params: { error: e instanceof Error ? e.message : '识别失败，请再试一次' },
            merge: true,
          });
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
  }, [navigation, startedAt]);

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

  const waitingLong = veryLong || longWait;
  const statusTitle = waitingLong ? (veryLong ? VERY_LONG_COPY : LONG_WAIT_COPY) : PHASES[phaseIndex];
  const statusHint = waitingLong ? '网络或设备繁忙时，多等一下下' : PHASE_HINTS[phaseIndex];

  // 鱼影呼吸：Alpha 0.75 → 1 → 0.75（3.2s，Reduce Motion 静止）
  const silhouetteOpacity = useRef(new Animated.Value(0.78)).current;
  useEffect(() => {
    if (reduceMotion) {
      silhouetteOpacity.setValue(0.9);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(silhouetteOpacity, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(silhouetteOpacity, {
          toValue: 0.78,
          duration: 1600,
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
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      {/* 顶部：衬线标题（识别中不提供返回，避免中断流程） */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>
          正在认识这条
          <Text style={styles.titleAccent}>鱼</Text>
        </Text>
        <Text style={styles.subtitle}>AI 正在安静地观察并理解它</Text>
      </View>

      {/* 中央：写实鱼形（与取景框同款）+ 圆形水波向外扩散 */}
      <View style={styles.center} pointerEvents="none">
        <Ripple index={0} reduceMotion={reduceMotion} />
        <Ripple index={1} reduceMotion={reduceMotion} />
        <Ripple index={2} reduceMotion={reduceMotion} />
        <Ripple index={3} reduceMotion={reduceMotion} />
        <Animated.View style={styles.fishGlow}>
          <Animated.View
            style={{ opacity: silhouetteOpacity, transform: [{ rotate: '-8deg' }] }}
          >
            <FishScanFrame width={200} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* 中部：状态轮换文案（金色眼睛图标 + 主文案 + 灰色提示） */}
      <View style={styles.statusWrap} pointerEvents="none">
        <View style={styles.statusRow}>
          <Icon name="eye" size={16} color={palette.accentGold} />
          <PhaseText text={statusTitle} color={palette.accentGold} />
        </View>
        <Text style={styles.statusHint} numberOfLines={2}>
          {statusHint}
        </Text>
      </View>

      {/* 底部：小贴士深色磨砂气泡 */}
      <View style={[styles.tipWrap, { bottom: insets.bottom + spacing.xl }]} pointerEvents="none">
        <View style={styles.tipBubble}>
          <Icon name="leaf" size={14} color="#D9C9A3" />
          <Text style={styles.tipText}>小贴士：清晰的鱼体、自然光线有助于更准确识别</Text>
        </View>
      </View>
    </View>
  );
};

const shadowText: TextStyle = {
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 8,
  textShadowColor: 'rgba(6,20,26,0.55)',
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  scrim: {
    backgroundColor: 'rgba(8,24,30,0.30)',
  } as ViewStyle,
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  } as ViewStyle,
  title: {
    color: '#FDFEFD',
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 3,
    ...shadowText,
  } as TextStyle,
  titleAccent: {
    color: palette.accentGold,
  } as TextStyle,
  subtitle: {
    marginTop: spacing.sm,
    color: 'rgba(250,252,251,0.82)',
    fontSize: typeScale.meta + 1,
    letterSpacing: 1.5,
    ...shadowText,
  } as TextStyle,
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  /** 圆形水波：正圆细描边，自鱼身中心向外扩散 */
  ripple: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1.5,
    borderColor: 'rgba(246,250,248,0.78)',
  } as ViewStyle,
  fishGlow: {
    shadowColor: '#F6FAF8',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  } as ViewStyle,
  statusWrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    minHeight: 64,
  } as ViewStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  phase: {
    marginLeft: spacing.sm,
    fontFamily: font.serif,
    fontSize: typeScale.body + 1,
    fontWeight: '600',
    letterSpacing: 2,
    ...shadowText,
  } as TextStyle,
  statusHint: {
    marginTop: spacing.sm,
    color: 'rgba(250,252,251,0.66)',
    fontSize: typeScale.meta,
    letterSpacing: 1,
    textAlign: 'center',
    ...shadowText,
  } as TextStyle,
  tipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  } as ViewStyle,
  tipBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: 'rgba(10,26,32,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(246,250,248,0.14)',
  } as ViewStyle,
  tipText: {
    marginLeft: spacing.sm - 2,
    color: 'rgba(243,246,244,0.88)',
    fontSize: typeScale.meta - 1,
    letterSpacing: 0.5,
  } as TextStyle,
});
