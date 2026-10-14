import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { useTheme } from '../contexts/ThemeContext';
import { palette } from '../constants/colors';
import { toFileUri } from '../utils/fileUri';
import { PressableScale } from '../components';
import {
  AIAmbientField,
  AI_STATE_MIN_MS,
  AIPhase,
} from '../components/coreui/AIAmbientField';
import { RecognitionStatusCard } from '../components/coreui/RecognitionStatusCard';

type RecognizingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Recognizing'>;

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * 冻结三状态序列（V1.2 State Timeline Spec V1.3，恰好三个用户可见状态）：
 * 图片识别中 ≥900ms → 已定位到鱼体 ≥600ms → 鱼种识别中 ≥1250ms → RESOLVE。
 * 图片识别中内含早/晚两个冻结关键帧（01 全卡「正在准备识别」→ 02 轻量卡
 * 「正在理解照片」），是同一状态内的视觉演化，不是两个用户可见状态。
 */
const STATE_ORDER: AIPhase[] = ['imageRecognizing', 'fishLocated', 'speciesRecognizing'];

/** 状态卡冻结文案（四张冻结关键帧 PNG 逐字；V1.2 视觉状态集权威） */
const CARD_COPY = {
  imageRecognizingEarly: { title: '正在准备识别', subtitle: 'AI 已获取这张照片' },
  imageRecognizingLate: { title: '正在理解照片', subtitle: '查找鱼获线索' },
  fishLocated: { title: '已定位到鱼体', subtitle: '正在分析这次鱼获' },
  speciesRecognizing: { title: '正在认识这条鱼', subtitle: '分析鱼体特征' },
};

/** 状态 1 内早→晚演化点（Motion Spec §3：入场 420ms 完成后交棒晚关键帧） */
const EARLY_TO_LATE_MS = 420;
/** 早→晚卡片交叉淡出 */
const CARD_CROSSFADE_MS = 240;
/** 名义完整视觉故事（900+600+1250；推理更快时保留三段语义节拍到故事走完） */
const STORY_MS = AI_STATE_MIN_MS.imageRecognizing + AI_STATE_MIN_MS.fishLocated + AI_STATE_MIN_MS.speciesRecognizing;
/** 收场转场（V1.2 RESOLVE：冻结段位 → ResolveStrength=(1-p)² 整体淡出） */
const RESOLVE_MS = 200;
const TIMEOUT_MS = 45000;

/**
 * P03 识别处理中（Recognition Processing 冻结设计 V1.2）：
 * 全屏刚拍下的照片（视觉主导、无处理色罩）+ AI Edge Field（四能量岛
 * 边缘光场）+ 鱼焦点（定位后视觉主角）+ RecognitionStatusCard。
 * 禁止 HUD / 扫描框 / 进度条 / 伪百分比。
 * 结果路由由真实推理门控：推理更快 → 等故事走完（2.75s + 200ms RESOLVE）；
 * 推理更慢 → 停留在当前真实状态不伪造后续；失败立即路由。
 * Haptic / Sound = NONE（V1.2 冻结）。
 */
export const RecognizingScreen: React.FC = () => {
  const navigation = useNavigation<RecognizingScreenNavigationProp>();
  const { image, recognizeAndRecord } = useRecognition();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();

  const [stateIndex, setStateIndex] = useState(0);
  /** 状态 1 内部的早/晚关键帧演化（不构成第四个状态） */
  const [cardLate, setCardLate] = useState(false);
  const [resolveStarted, setResolveStarted] = useState(false);

  // 退场转场期间 IdentifyScreen 重挂载会 reset 清空 image，
  // 用挂载瞬间的照片冻结本屏展示，避免结果转场时照片先闪没。
  const [photoUri] = useState(() => toFileUri(image?.filePath));
  /* 相册选图与屏幕比例不一致：完整居中展示（contain，不改比例）；
     相机流保持铺满（cover）。同样在挂载瞬间冻结。 */
  const [photoFit] = useState<'cover' | 'contain'>(() =>
    image?.source === 'gallery' ? 'contain' : 'cover',
  );

  const startedAt = useMemo(() => Date.now(), []);

  // latest ref：识别只随挂载执行一次；退场转场期间 IdentifyScreen 重挂载会 reset 清空
  // image，若把 recognizeAndRecord 放进依赖会导致 effect 重跑并抛“没有可识别的照片”，
  // 覆盖真正的失败原因。
  const recognizeRef = useRef(recognizeAndRecord);
  recognizeRef.current = recognizeAndRecord;

  // 收场（RESOLVE）：先冻结光场段位/粒子（Motion Contract §7），
  // 再以 ResolveStrength=(1-p)²（Easing.out(quad)）淡出 ambient/状态/鱼焦点。
  const resolve = useRef(new Animated.Value(0)).current;
  const resolveOpacity = resolve.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const runResolve = () => {
    setResolveStarted(true);
    Animated.timing(resolve, {
      toValue: 1,
      duration: RESOLVE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  /* 冻结状态推进：只前进不回退（推理更慢时在当前状态停留更久；
     Reduce Motion 只去除运动表达，状态节奏/语义不变——ReduceMotion §13） */
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setCardLate(true), EARLY_TO_LATE_MS));
    let acc = 0;
    for (let i = 1; i < STATE_ORDER.length; i++) {
      acc += AI_STATE_MIN_MS[STATE_ORDER[i - 1]];
      timers.push(setTimeout(() => setStateIndex(i), acc));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  /* 状态 1 早→晚卡片交叉淡出 */
  const cardFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(cardFade, {
      toValue: cardLate ? 1 : 0,
      duration: reduceMotion ? 180 : CARD_CROSSFADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [cardLate, reduceMotion, cardFade]);

  // 识别主流程
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await recognizeRef.current();
        if (cancelled) {
          return;
        }
        const proceed = () => {
          if (result.ready && result.prediction) {
            navigation.replace('Result');
          } else {
            navigation.replace('RecognitionIssue');
          }
        };
        // 呈现时间管理（V1.2）：结果就绪后补完 2.75s 三状态故事，
        // 最后 200ms RESOLVE 冻结淡出与路由衔接
        const elapsed = Date.now() - startedAt;
        const fadeDelay = Math.max(0, STORY_MS - elapsed - RESOLVE_MS);
        setTimeout(runResolve, fadeDelay);
        setTimeout(proceed, fadeDelay + RESOLVE_MS);
      } catch (e) {
        // 异常（非识别"没认出"）直接退回 P02 并带回原因；RecognitionIssue 只承载有结果的 FAILED。
        // popTo：弹回栈里原有的拍照页，避免 push 新实例后旧 Recognizing 残留在栈中
        if (!cancelled) {
          navigation.popTo(
            'Identify',
            { error: e instanceof Error ? e.message : '识别失败，请再试一次' },
            { merge: true },
          );
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

  const phase = STATE_ORDER[Math.min(stateIndex, STATE_ORDER.length - 1)];

  /* 状态卡文案：状态 1 随早/晚演化，状态 2/3 固定 */
  const earlyCopy = CARD_COPY.imageRecognizingEarly;
  const lateCopy = CARD_COPY.imageRecognizingLate;
  const settledCopy =
    phase === 'fishLocated' ? CARD_COPY.fishLocated : CARD_COPY.speciesRecognizing;

  return (
    <View style={styles.screen}>
      {/* 环境层：全屏照片 + 边缘受光 + 四岛能量带 + 发丝 + 粒子 + 鱼焦点 */}
      <AIAmbientField
        phase={phase}
        photoUri={photoUri}
        photoFit={photoFit}
        resolveOpacity={resolveOpacity}
        frozen={resolveStarted}
      />

      {/* L8. 状态 UI + 返回（随收场一起淡出） */}
      <Animated.View style={[styles.uiLayer, { opacity: resolveOpacity }]} pointerEvents="box-none">
        <PressableScale
          onPress={() => navigation.goBack()}
          accessibilityLabel="返回"
          style={[styles.back, { top: insets.top + 8 }]}
        >
          <AppIcon name="back" size={26} color="rgba(255,255,255,0.95)" />
        </PressableScale>

        {/* RecognitionStatusCard：中下位置（冻结稿 58%-75% 高度带）。
            状态 1 早/晚两张卡交叉淡化（全卡 ↔ 轻量变体）；状态 2/3 全卡。 */}
        <View style={styles.cardDock} pointerEvents="none">
          {phase === 'imageRecognizing' ? (
            <>
              <Animated.View style={[styles.cardLayer, { opacity: cardFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                <RecognitionStatusCard title={earlyCopy.title} subtitle={earlyCopy.subtitle} style={styles.card} />
              </Animated.View>
              <Animated.View style={[styles.cardLayer, { opacity: cardFade }]}>
                <RecognitionStatusCard title={lateCopy.title} subtitle={lateCopy.subtitle} lightweight />
              </Animated.View>
            </>
          ) : (
            <RecognitionStatusCard title={settledCopy.title} subtitle={settledCopy.subtitle} style={styles.card} />
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.viewfinderDark,
  } as ViewStyle,
  uiLayer: {
    ...StyleSheet.absoluteFillObject,
  } as ViewStyle,
  /** 返回键：冻结稿为裸露白色箭头（无圆形衬底/边框），左缘约 8dp */
  back: {
    position: 'absolute',
    left: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  cardDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    bottom: SCREEN_H * 0.24,
  } as ViewStyle,
  cardLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  card: {
    width: '87%',
  } as ViewStyle,
});
