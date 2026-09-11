import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import type { AnimationObject } from 'lottie-react-native';
import { StackNavigationProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { RemoteCatch } from '../types/models';
import { palette } from '../constants/colors';
import { font, spacing } from '../constants/tokens';
import { countDistinctDays, formatCaptureWhen, formatLength, formatWeight } from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { homeFeedback } from '../services/homeFeedback';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { RemoteImage } from '../components/RemoteImage';
import { CaptureButton } from '../components/CaptureButton';
import { EmptyState } from '../components/ui/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';
import { CardCarousel } from '../components/ui/CardCarousel';
import cameraFlash from '../assets/home/animation/camera_flash.json';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** 居中大卡宽度：占屏宽 76%，两侧卡片只露出较小一部分 */
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.76);
/** 首卡/末卡也能居中：内容区两侧留出 (屏宽 - 卡宽) / 2 */
const SIDE_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const CARD_GAP = 18;
const CARD_HEIGHT = Math.max(300, Math.min(SCREEN_HEIGHT * 0.44, 450));
const CARD_STEP = CARD_WIDTH + CARD_GAP;
/** 两侧卡片下沉量与缩放，形成中间高、两侧低的立体层次 */
const SIDE_DROP = 22;
const SIDE_SCALE = 0.86;
/** 补偿侧卡缩放留出的空隙：把侧卡向外推，使其贴住屏幕边缘并轻压在居中卡后 */
const SIDE_PUSH = Math.round((CARD_WIDTH * (1 - SIDE_SCALE)) / 2) - 2;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp>();
  const { profile, reduceMotion } = useTheme();
  const { session } = useAuth();
  const { catches, statistics, loading, reload } = useCatchArchive();
  const { nickname: localNickname } = usePreferences();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const flashRef = useRef<LottieView>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const profileScale = useRef(new Animated.Value(1)).current;

  const visibleCatches = useMemo(() => catches.slice(0, 6), [catches]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        visibleCatches.map(
          async (item) => [item.id, await catchMemoryService.load(item.id)] as const,
        ),
      );
      if (mounted) setMemories(Object.fromEntries(entries));
    })();
    return () => { mounted = false; };
  }, [visibleCatches]);

  /* 环境水声：仅用户开启后循环（Audio_Spec），离开首页即停 */
  useEffect(() => {
    let enabled = false;
    homeFeedback.isAmbientEnabled().then((on) => {
      enabled = on;
      if (on) homeFeedback.startAmbient();
    });
    return () => {
      if (enabled) homeFeedback.stopAmbient();
    };
  }, []);

  const speciesCount =
    statistics.speciesCount ||
    new Set(catches.map((c) => c.speciesId).filter(Boolean)).size;
  const dayCount = countDistinctDays(catches);

  const stats = [
    { label: '鱼种', value: speciesCount, target: 'Guide' as const },
    { label: '渔获', value: catches.length, target: 'MyCatches' as const },
    { label: '天记录', value: dayCount, target: 'Calendar' as const },
  ];

  const accessToken = session?.accessToken ?? null;
  const tp = profile.surface.textPrimary;
  const ts = profile.surface.textSecondary;

  /* 个人中心入口：scale .96→1 + 柔和确认音 + Soft 触感（220ms） */
  const openProfile = () => {
    homeFeedback.playProfileOpen();
    homeFeedback.hapticProfile();
    Animated.sequence([
      Animated.timing(profileScale, {
        toValue: 0.96,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(profileScale, {
        toValue: 1,
        speed: 20,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();
    navigation.navigate('Profile');
  };

  /* 相机入口：闪白 180ms + 快门音 + Medium 触感 */
  const handleCapture = () => {
    homeFeedback.playCapture();
    homeFeedback.hapticCapture();
    flashOpacity.setValue(1);
    flashRef.current?.reset();
    flashRef.current?.play();
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 220,
      delay: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    navigation.navigate('Identify');
  };

  return (
    <View style={styles.root}>
      {/* 环境背景：与其他模块一致，跟随个人主题设置 */}
      <WaterBackdrop />

      {/* 拍照闪白（camera_flash.json，覆盖全屏） */}
      {!reduceMotion && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: flashOpacity }]} pointerEvents="none">
          <LottieView
            ref={flashRef}
            source={cameraFlash as unknown as AnimationObject}
            loop={false}
            style={styles.fill}
          />
        </Animated.View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: 176 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor={profile.surface.accent}
            progressBackgroundColor={profile.isDark ? '#12333D' : '#FFFFFF'}
          />
        }
      >
        {/* ── 品牌区 ─────────────────────────────────────────── */}
        <View style={[styles.brandRow, styles.pageInset]}>
          <PressableScale onPress={openProfile} scaleTo={0.97}>
            <View>
              <Text style={[styles.brand, { color: tp }]}>渔见</Text>
              <Text style={[styles.brandSub, { color: ts }]}>拍照收藏每次渔获</Text>
            </View>
          </PressableScale>

          {/* 头像入口（profile_button_glass：玻璃圆钮 + 默认头像 + 箭头） */}
          <Animated.View style={{ transform: [{ scale: profileScale }] }}>
            <PressableScale onPress={openProfile} scaleTo={0.94} style={styles.avatarHit}>
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: profile.surface.glassStrong,
                    borderColor: profile.surface.glassBorder,
                  },
                ]}
              >
                <Icon name="person-outline" size={18} color={tp} />
              </View>
            </PressableScale>
          </Animated.View>
        </View>

        {/* ── 统计胶囊（数字滚动 600–900ms，首次进入一次） ────── */}
        <View
          style={[
            styles.statBar,
            styles.pageInset,
            { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
          ]}
        >
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && (
                <View
                  style={[styles.statDivider, { backgroundColor: profile.surface.glassBorder }]}
                />
              )}
              <PressableScale
                onPress={() => navigation.navigate(stat.target)}
                scaleTo={0.97}
                style={styles.statCell}
              >
                <CountUp value={stat.value} color={tp} reduceMotion={reduceMotion} />
                <Text style={[styles.statLabel, { color: ts }]}>{stat.label}</Text>
              </PressableScale>
            </React.Fragment>
          ))}
        </View>

        {/* ── 渔获卡轮播（中间大卡，两侧露边 + 下沉立体） ─────── */}
        {loading && catches.length === 0 ? (
          <View
            style={[
              styles.loadingCard,
              styles.pageInset,
              { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
            ]}
          >
            <Text style={[styles.loadingText, { color: ts }]}>正在打开你的鱼获…</Text>
          </View>
        ) : visibleCatches.length === 0 ? (
          <EmptyState
            title="第一条鱼，会从这里开始"
            description="拍下你的渔获，渔见会安静地帮你认出它、收藏它"
            style={[styles.empty, styles.pageInset]}
          />
        ) : (
          <View style={{ marginTop: spacing.xl }}>
            <CardCarousel
              count={visibleCatches.length}
              cardWidth={CARD_WIDTH}
              cardHeight={CARD_HEIGHT}
              gap={CARD_GAP}
              sideScale={SIDE_SCALE}
              sideDrop={SIDE_DROP}
              sidePush={SIDE_PUSH}
              onChange={(next) => {
                setActiveIndex(next);
                homeFeedback.playCardSwipe();
                homeFeedback.hapticSwipe();
              }}
              renderItem={({ index, isActive, scrollX }) => (
                <CatchCard
                  key={visibleCatches[index].id}
                  item={visibleCatches[index]}
                  memory={memories[visibleCatches[index].id]}
                  accessToken={accessToken}
                  isLatest={index === 0}
                  isActive={isActive}
                  index={index}
                  scrollX={scrollX}
                  reduceMotion={reduceMotion}
                  onPress={() =>
                    navigation.navigate('CatchDetail', {
                      catchId: visibleCatches[index].id,
                      initialCatch: visibleCatches[index],
                    })
                  }
                />
              )}
            />
          </View>
        )}
      </ScrollView>

      {/* ── 底部相机按钮（呼吸 2000ms / 1.05，规范值） ─────────── */}
      <View
        style={[styles.cameraDock, { bottom: insets.bottom + spacing.xl }]}
        pointerEvents="box-none"
      >
        <CaptureButton
          onPress={handleCapture}
          size={84}
          breath
          breathPeriodMs={2000}
          breathScaleTo={1.05}
          accessibilityLabel="拍照识别"
        />
      </View>
    </View>
  );
};

/* ─── 统计数字滚动 ────────────────────────────────────────────────────────── */

const CountUp: React.FC<{ value: number; color: string; reduceMotion: boolean }> = ({
  value,
  color,
  reduceMotion,
}) => {
  const [display, setDisplay] = useState(0);
  const lastValue = useRef(-1);

  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const counter = new Animated.Value(0);
    const id = counter.addListener(({ value: t }) => setDisplay(Math.round(t)));
    Animated.timing(counter, {
      toValue: value,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => counter.removeListener(id));
    return () => counter.removeListener(id);
  }, [value, reduceMotion]);

  return (
    <Text style={[styles.statValue, { color }]}>{display}</Text>
  );
};

/* ─── 渔获卡 ─────────────────────────────────────────────────────────────── */

const CatchCard: React.FC<{
  item: RemoteCatch;
  memory?: CatchMemoryData;
  accessToken: string | null;
  isLatest: boolean;
  isActive: boolean;
  index: number;
  scrollX: Animated.Value;
  reduceMotion: boolean;
  onPress: () => void;
}> = ({ item, memory, accessToken, isLatest, isActive, index, scrollX, reduceMotion, onPress }) => {
  const lengthLabel = formatLength(memory?.lengthCm ?? null, 'cm');
  const weightLabel = formatWeight(memory?.weightKg ?? null, 'kg');
  const location = memory?.location?.trim();

  /* 轮播几何：中间原大，两侧缩小 + 下沉 + 变淡，形成立体层次 */
  const scale = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
    extrapolate: 'clamp',
  });
  const opacity = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [0.6, 1, 0.6],
    extrapolate: 'clamp',
  });
  const translateY = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [SIDE_DROP, 0, SIDE_DROP],
    extrapolate: 'clamp',
  });
  /* 3D 倾斜：滑动过程中 rotateY ±6°，停稳回 0° */
  const rotateY = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: ['-6deg', '0deg', '6deg'],
    extrapolate: 'clamp',
  });
  /* 向内位移补偿缩放空隙：侧卡收向居中卡、轻压其下；卡片远端仍延伸出屏幕，视觉上贴住边界 */
  const translateX = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [-SIDE_PUSH, 0, SIDE_PUSH],
    extrapolate: 'clamp',
  });

  /* 鱼漂浮：translateY 0→-8→0，4s easeInOut 循环 */
  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -8,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatY, reduceMotion]);

  /* 卡片进入：opacity 0→1、scale .94→1，450ms spring */
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const enterScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.94)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(enterScale, {
        toValue: 1,
        speed: 20,
        bounciness: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [enter, enterScale, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.cardHit,
        {
          opacity: Animated.multiply(enter, opacity),
          transform: [
            { translateX },
            { scale: Animated.multiply(enterScale, scale) },
            { translateY },
          ],
          zIndex: isActive ? 2 : 1,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ perspective: 1000 }, { rotateY }] }}>
        <PressableScale onPress={onPress} scaleTo={0.985} style={{ width: CARD_WIDTH }}>
          <View style={styles.card}>
            {item.imageUrl ? (
              <Animated.View style={{ transform: [{ translateY: floatY }] }}>
                <RemoteImage
                  url={item.imageUrl}
                  authToken={accessToken}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              </Animated.View>
            ) : (
              <View style={[styles.cardImage, styles.cardFallback]}>
                <Text style={styles.cardFallbackText}>渔见</Text>
              </View>
            )}

            {/* 底部渐变遮罩 */}
            <View style={styles.cardOverlay}>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={`scrim${index}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#08252F" stopOpacity="0" />
                    <Stop offset="0.5" stopColor="#08252F" stopOpacity="0.1" />
                    <Stop offset="1" stopColor="#08252F" stopOpacity="0.82" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#scrim${index})`} />
              </Svg>

              {/* 卡片信息：居左，参考设计稿 */}
              <View style={styles.cardInfo}>
                {isLatest && <Text style={styles.cardKicker}>最近发现</Text>}
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.speciesName || '这条鱼还在确认中'}
                </Text>
                <View style={styles.cardMetaRow}>
                  <View style={styles.cardMetaItem}>
                    <Icon name="time-outline" size={14} color="rgba(255,255,255,0.78)" />
                    <Text style={styles.cardMetaText}>{formatCaptureWhen(item.capturedAt)}</Text>
                  </View>
                  {!!lengthLabel && (
                    <View style={styles.cardMetaItem}>
                      <Icon name="resize-outline" size={14} color="rgba(255,255,255,0.78)" />
                      <Text style={styles.cardMetaText}>{lengthLabel}</Text>
                    </View>
                  )}
                  {!!weightLabel && (
                    <View style={styles.cardMetaItem}>
                      <Icon name="scale-outline" size={14} color="rgba(255,255,255,0.78)" />
                      <Text style={styles.cardMetaText}>{weightLabel}</Text>
                    </View>
                  )}
                </View>
                {!!location && (
                  <View style={styles.cardMetaItem}>
                    <Icon name="location-outline" size={14} color="rgba(255,255,255,0.78)" />
                    <Text style={styles.cardMetaText} numberOfLines={1}>{location}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
};

/* ─── 样式 ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 } as ViewStyle,
  flex: { flex: 1 } as ViewStyle,
  fill: { flex: 1 } as ViewStyle,
  content: { paddingHorizontal: 0 } as ViewStyle,
  /** 页面通用左右留白（外距）：轮播以外的内容块使用，轮播通栏贴边 */
  pageInset: { marginHorizontal: spacing.page } as ViewStyle,

  // 品牌区
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 8,
  } as ViewStyle,
  brand: {
    fontFamily: font.serif,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 14,
    lineHeight: 56,
  } as TextStyle,
  brandSub: {
    fontSize: 13,
    letterSpacing: 3,
    marginTop: 6,
    opacity: 0.85,
  } as TextStyle,
  avatarHit: { marginTop: 10, borderRadius: 22 } as ViewStyle,
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,

  // 统计胶囊（home_tokens：statistics 圆角 32）
  statBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    borderRadius: 32,
    borderWidth: 1,
    paddingVertical: 10,
  } as ViewStyle,
  statDivider: { width: 1, height: 32, opacity: 0.6 } as ViewStyle,
  statCell: { flex: 1, alignItems: 'center' } as ViewStyle,
  statValue: {
    fontFamily: font.sans,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 1,
    lineHeight: 24,
    textAlign: 'center',
  } as TextStyle,
  statLabel: { fontSize: 13, letterSpacing: 1.5, marginTop: 3, textAlign: 'center' } as TextStyle,

  // 加载 / 空态
  loadingCard: {
    marginTop: spacing.xl,
    borderRadius: 54,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    borderWidth: 1,
  } as ViewStyle,
  loadingText: { fontSize: 13 } as TextStyle,
  empty: { marginTop: spacing.xxl } as ViewStyle,

  // 轮播：通栏无页面留白，两侧留白仅用于首末卡居中
  carousel: {
    gap: CARD_GAP,
    paddingHorizontal: SIDE_PADDING,
    marginTop: spacing.xl,
    marginBottom: SIDE_DROP,
    overflow: 'visible',
  } as ViewStyle,
  cardHit: { width: CARD_WIDTH } as ViewStyle,
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 54,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    // 透明底：图片直接叠在晨光环境上，背景可透出
    backgroundColor: 'transparent',
  } as ViewStyle,
  cardImage: {
    width: '100%',
    height: CARD_HEIGHT,
  } as ImageStyle,
  cardFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  cardFallbackText: {
    fontFamily: font.serif,
    fontSize: 22,
    color: palette.waterTeal,
    letterSpacing: 4,
  } as TextStyle,

  // 卡片遮罩 + 信息
  cardOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' } as ViewStyle,
  cardInfo: {
    alignItems: 'flex-start',
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 8,
  } as ViewStyle,
  cardKicker: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 4,
    color: '#F2EDE3',
    opacity: 0.92,
    textShadowColor: 'rgba(8,28,38,0.45)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  cardName: {
    fontFamily: font.sans,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8,28,38,0.5)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  } as ViewStyle,
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 } as ViewStyle,
  cardMetaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(8,28,38,0.4)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,

  // 相机按钮底座
  cameraDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  } as ViewStyle,
});
