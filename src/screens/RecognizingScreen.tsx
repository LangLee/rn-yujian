import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ImageStyle, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { ScanTechOverlay } from '../components/ScanTechOverlay';
import { palette } from '../constants/colors';
import { font, fs, spacing, typeScale } from '../constants/tokens';
import { toFileUri } from '../utils/fileUri';

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

/** 底部不定态进度条：金色流光在轨道内循环滑过，替代具体百分比。 */
const ShimmerBar: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const TRACK_W = 172;
  const FILL_W = 68;
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      x.setValue(0.45);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1250,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-FILL_W, TRACK_W] });

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width: FILL_W, transform: [{ translateX }] }]} />
    </View>
  );
};

/**
 * P03 识别处理中：
 * 全屏展示刚拍下的照片 + 科技感扫描动态模版（ScanTechOverlay）。
 * 上方「AI 识别中」衬线标题与呼吸圆点，下方状态轮换文案、流光进度条与小贴士。
 * 业务状态优先：识别 Ready 立即进入 P04，不为播完动画延迟结果。
 */
export const RecognizingScreen: React.FC = () => {
  const navigation = useNavigation<RecognizingScreenNavigationProp>();
  const { image, recognizeAndRecord } = useRecognition();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [longWait, setLongWait] = useState(false);
  const [veryLong, setVeryLong] = useState(false);

  // 退场转场期间 IdentifyScreen 重挂载会 reset 清空 image，
  // 用挂载瞬间的照片冻结本屏展示，避免结果转场时照片先闪没。
  const [photoUri] = useState(() => toFileUri(image?.filePath));

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

  // 照片入场：轻微放大回落 + 淡入，接上快门定格的动势（Reduce Motion 直接显示）
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, enter]);
  const photoScale = enter.interpolate({ inputRange: [0, 1], outputRange: [1.07, 1] });

  // 「AI 识别中」圆点呼吸：0.35 ↔ 1
  const dotPulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (reduceMotion) {
      dotPulse.setValue(0.85);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 0.35,
          duration: 620,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, dotPulse]);

  return (
    <View style={styles.screen}>
      {/* 全屏照片（挂载瞬间冻结）；无照片兜底为深色取景底色 */}
      {photoUri ? (
        <Animated.Image
          source={{ uri: photoUri }}
          resizeMode="cover"
          style={[
            StyleSheet.absoluteFill,
            styles.photo,
            { opacity: enter, transform: [{ scale: photoScale }] },
          ]}
        />
      ) : null}

      {/* 科技感扫描动态模版：护底 / 网格 / 扫描光带 / 流光 / HUD 边框 */}
      <ScanTechOverlay reduceMotion={reduceMotion} />

      {/* 顶部：呼吸圆点 + AI 识别中 + 衬线标题（识别中不提供返回，避免中断流程） */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]} pointerEvents="none">
        <View style={styles.eyebrowRow}>
          <Animated.View style={[styles.eyebrowDot, { opacity: dotPulse }]} />
          <Text style={styles.eyebrow}>AI 识别中</Text>
        </View>
        <Text style={styles.title}>
          正在认识这条
          <Text style={styles.titleAccent}>鱼</Text>
        </Text>
      </View>

      {/* 底部：状态轮换文案 + 流光进度条 + 小贴士气泡 */}
      <View style={[styles.footer, { bottom: insets.bottom + spacing.lg }]} pointerEvents="none">
        <View style={styles.statusRow}>
          <Icon name="eye" size={15} color={palette.accentGold} />
          <PhaseText text={statusTitle} color={palette.accentGold} />
        </View>
        <Text style={styles.statusHint} numberOfLines={2}>
          {statusHint}
        </Text>
        <ShimmerBar reduceMotion={reduceMotion} />
        <View style={styles.tipBubble}>
          <Icon name="leaf" size={13} color="#D9C9A3" />
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
    backgroundColor: palette.viewfinderDark,
  } as ViewStyle,
  photo: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  } as ViewStyle,
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.accentGold,
    shadowColor: palette.accentGold,
    shadowRadius: 5,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
    marginRight: spacing.sm - 2,
  } as ViewStyle,
  eyebrow: {
    color: '#9FF2E8',
    fontSize: fs(typeScale.meta - 1),
    fontWeight: '600',
    letterSpacing: 4,
    ...shadowText,
  } as TextStyle,
  title: {
    marginTop: spacing.sm,
    color: '#FDFEFD',
    fontFamily: font.serif,
    fontSize: fs(24),
    fontWeight: '600',
    letterSpacing: 3,
    ...shadowText,
  } as TextStyle,
  titleAccent: {
    color: palette.accentGold,
  } as TextStyle,
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  } as ViewStyle,
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  phase: {
    marginLeft: spacing.sm,
    fontFamily: font.serif,
    fontSize: fs(typeScale.body + 1),
    fontWeight: '600',
    letterSpacing: 2,
    ...shadowText,
  } as TextStyle,
  statusHint: {
    marginTop: spacing.sm,
    color: 'rgba(250,252,251,0.66)',
    fontSize: fs(typeScale.meta),
    letterSpacing: 1,
    textAlign: 'center',
    ...shadowText,
  } as TextStyle,
  barTrack: {
    width: 172,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(246,250,248,0.16)',
    overflow: 'hidden',
    marginTop: spacing.lg,
    marginBottom: spacing.lg + 2,
  } as ViewStyle,
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#EAD9AE',
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
    fontSize: fs(typeScale.meta - 1),
    letterSpacing: 0.5,
  } as TextStyle,
});
