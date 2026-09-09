import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StackNavigationProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { RemoteCatch } from '../types/models';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import { countDistinctDays, formatCaptureWhen, formatLength, formatWeight } from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { RemoteImage } from '../components/RemoteImage';
import { CaptureButton } from '../components/CaptureButton';
import { EmptyState } from '../components/ui/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** 与统计胶囊同宽，保证垂直方向边缘对齐 */
const CARD_WIDTH = SCREEN_WIDTH - spacing.page * 2;
const CARD_GAP = 12;
const CARD_HEIGHT = Math.max(320, Math.min(SCREEN_HEIGHT * 0.48, 480));

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches, statistics, loading, reload } = useCatchArchive();
  const { nickname: localNickname } = usePreferences();
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

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

  return (
    <View style={styles.root}>
      <WaterBackdrop />

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
        <View style={styles.brandRow}>
          <PressableScale onPress={() => navigation.navigate('Profile')} scaleTo={0.97}>
            <View>
              <Text style={[styles.brand, { color: tp }]}>渔见</Text>
              <Text style={[styles.brandSub, { color: ts }]}>拍照收藏每次渔获</Text>
            </View>
          </PressableScale>

          {/* 头像入口 */}
          <PressableScale
            onPress={() => navigation.navigate('Profile')}
            scaleTo={0.94}
            style={styles.avatarHit}
          >
            <View style={[styles.avatar, { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder }]}>
              <Icon name="person-outline" size={18} color={tp} />
            </View>
          </PressableScale>
        </View>

        {/* ── 统计胶囊 ────────────────────────────────────────── */}
        <View style={[styles.statBar, { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder }]}>
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && (
                <View style={[styles.statDivider, { backgroundColor: profile.surface.glassBorder }]} />
              )}
              <PressableScale
                onPress={() => navigation.navigate(stat.target)}
                scaleTo={0.97}
                style={styles.statCell}
              >
                <Text style={[styles.statValue, { color: tp }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: ts }]}>{stat.label}</Text>
              </PressableScale>
            </React.Fragment>
          ))}
        </View>

        {/* ── 渔获卡轮播 ──────────────────────────────────────── */}
        {loading && catches.length === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder }]}>
            <Text style={[styles.loadingText, { color: ts }]}>正在打开你的鱼获…</Text>
          </View>
        ) : visibleCatches.length === 0 ? (
          <EmptyState
            title="第一条鱼，会从这里开始"
            description="拍下你的渔获，渔见会安静地帮你认出它、收藏它"
            style={styles.empty}
          />
        ) : (
          <View>
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled={false}
              snapToInterval={CARD_WIDTH + CARD_GAP}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              onMomentumScrollEnd={(e) => {
                const next = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
                if (next !== activeIndex) setActiveIndex(next);
              }}
            >
              {visibleCatches.map((item, index) => (
                <CatchCard
                  key={item.id}
                  item={item}
                  memory={memories[item.id]}
                  accessToken={accessToken}
                  isLatest={index === 0}
                  onPress={() =>
                    navigation.navigate('CatchDetail', { catchId: item.id, initialCatch: item })
                  }
                />
              ))}
            </ScrollView>

            {visibleCatches.length > 1 && (
              <View style={styles.dotsRow}>
                {visibleCatches.map((item, i) => (
                  <View
                    key={item.id}
                    style={[
                      styles.dot,
                      { backgroundColor: i === activeIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.42)' },
                      i === activeIndex && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── 底部相机按钮 ─────────────────────────────────────── */}
      <View
        style={[styles.cameraDock, { bottom: insets.bottom + spacing.xl }]}
        pointerEvents="box-none"
      >
        <CaptureButton
          onPress={() => navigation.navigate('Identify')}
          size={84}
          breath
          accessibilityLabel="拍照识别"
        />
      </View>
    </View>
  );
};

/* ─── 渔获卡 ─────────────────────────────────────────────────────────────── */

const CatchCard: React.FC<{
  item: RemoteCatch;
  memory?: CatchMemoryData;
  accessToken: string | null;
  isLatest: boolean;
  onPress: () => void;
}> = ({ item, memory, accessToken, isLatest, onPress }) => {
  const lengthLabel = formatLength(memory?.lengthCm ?? null, 'cm');
  const weightLabel = formatWeight(memory?.weightKg ?? null, 'kg');
  const location = memory?.location?.trim();

  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.cardHit}>
      <View style={styles.card}>
        {item.imageUrl ? (
          <RemoteImage
            url={item.imageUrl}
            authToken={accessToken}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardFallback]}>
            <Text style={styles.cardFallbackText}>渔见</Text>
          </View>
        )}

        {/* 底部渐变遮罩 */}
        <View style={styles.cardOverlay}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#08252F" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#08252F" stopOpacity="0.1" />
                <Stop offset="1" stopColor="#08252F" stopOpacity="0.82" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
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
  );
};

/* ─── 样式 ───────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 } as ViewStyle,
  flex: { flex: 1 } as ViewStyle,
  content: { paddingHorizontal: spacing.page } as ViewStyle,

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

  // 统计胶囊
  statBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    borderRadius: radius.m,
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
    borderRadius: radius.l,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    borderWidth: 1,
  } as ViewStyle,
  loadingText: { fontSize: 13 } as TextStyle,
  empty: { marginTop: spacing.xxl } as ViewStyle,

  // 轮播
  carousel: {
    gap: CARD_GAP,
    paddingHorizontal: 0,
    marginTop: spacing.xl,
  } as ViewStyle,
  cardHit: { width: CARD_WIDTH } as ViewStyle,
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    // 透明底：图片以 0.75 不透明度直接叠在环境照片上，背景可透出
    backgroundColor: 'transparent',
  } as ViewStyle,
  cardImage: { width: '100%', height: '100%', opacity: 0.75 } as ViewStyle,
  cardFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softWater } as ViewStyle,
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

  // 轮播圆点
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  } as ViewStyle,
  dot: { width: 6, height: 6, borderRadius: 3 } as ViewStyle,
  dotActive: { width: 16, borderRadius: 3 } as ViewStyle,

  // 相机按钮底座
  cameraDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  } as ViewStyle,
});
