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
import { StackNavigationProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { RemoteCatch } from '../types/models';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import {
  countDistinctDays,
  formatCaptureWhen,
  formatLength,
  formatWeight,
} from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { CaptureButton } from '../components/CaptureButton';
import { RemoteImage } from '../components/RemoteImage';
import { EmptyState } from '../components/ui/EmptyState';
import { PressableScale } from '../components/ui/PressableScale';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** 轮播卡宽：两侧留出邻卡「露出」的边（参考稿卡片两侧透出邻卡边缘） */
const CARD_WIDTH = SCREEN_WIDTH - spacing.page * 2 - 20;
const CARD_GAP = 12;
/**
 * 卡片高度自适应：在「顶部品牌 + 统计条 + 轮播点 + 底部相机区」之外的剩余空间内取值，
 * 保证任何屏幕尺寸下卡片底部都不会与相机按钮重叠（相机区约 182dp）。
 */
const CARD_HEIGHT = Math.max(
  300,
  Math.min(SCREEN_HEIGHT * 0.44, 384, SCREEN_HEIGHT - 480),
);

/**
 * P01 首页（设计文档 06 + 高保真参考稿）：
 * 衬线品牌字 / 单一胶囊统计条 / 全出血照片渔获卡轮播 / 底部金圈玻璃相机 / 右上角个人入口。
 */
export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches, statistics, loading, reload } = useCatchArchive();
  const { nickname: localNickname } = usePreferences();
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // 渔获卡补充信息（长度/重量/地点来自本地 Catch Memory；无数据则隐藏）
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
      if (mounted) {
        setMemories(Object.fromEntries(entries));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visibleCatches]);

  const speciesCount =
    statistics.speciesCount || new Set(catches.map((item) => item.speciesId).filter(Boolean)).size;
  const dayCount = countDistinctDays(catches);

  const stats = [
    { label: '鱼种', value: speciesCount, target: 'Guide' as const },
    { label: '渔获', value: catches.length, target: 'MyCatches' as const },
    { label: '天记录', value: dayCount, target: 'Calendar' as const },
  ];

  const displayName = localNickname || session?.nickname || session?.username || '钓友';
  const accessToken = session?.accessToken ?? null;
  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View style={styles.flex}>
      <WaterBackdrop />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: 216 + insets.bottom },
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
        {/* Brand + 右上角轻量个人入口 */}
        <View style={styles.brandRow}>
          <PressableScale onPress={() => navigation.navigate('Profile')} scaleTo={0.96}>
            <View>
              <Text style={[styles.brand, { color: textPrimary }]}>渔见</Text>
              <Text style={[styles.brandSub, { color: textSecondary }]}>
                拍 照 收 藏 每 次 渔 获
              </Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => navigation.navigate('Profile')}
            scaleTo={0.94}
            style={styles.avatarHit}
          >
            <View style={[styles.avatar, { backgroundColor: profile.surface.glassStrong }]}>
              <Icon name="person-outline" size={19} color={textPrimary} />
            </View>
          </PressableScale>
        </View>

        {/* 统计摘要：单一玻璃胶囊，三段式 + 分隔线（参考稿样式） */}
        <View
          style={[
            styles.statBar,
            { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
          ]}
        >
            {stats.map((stat, index) => (
              <React.Fragment key={stat.label}>
                {index > 0 ? (
                  <View style={[styles.statDivider, { backgroundColor: profile.surface.glassBorder }]} />
                ) : null}
                <PressableScale
                  onPress={() => navigation.navigate(stat.target)}
                  scaleTo={0.97}
                  style={styles.statCellHit}
                >
                  <View style={styles.statCell} pointerEvents="none">
                    <Text style={[styles.statValue, { color: textPrimary }]}>{stat.value}</Text>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: textSecondary }]}>{stat.label}</Text>
                      <Icon name="chevron-forward" size={12} color={textSecondary} />
                    </View>
                  </View>
                </PressableScale>
              </React.Fragment>
            ))}
        </View>

        {/* 渔获卡轮播：全出血真实照片 + 鱼名 + 时间/长/重 + 地点 */}
        {loading && catches.length === 0 ? (
          <View style={[styles.loadingCard, { backgroundColor: profile.surface.glass }]}>
            <Text style={[styles.loadingText, { color: textSecondary }]}>正在打开你的鱼获…</Text>
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
              onMomentumScrollEnd={(event) => {
                const next = Math.round(event.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
                if (next !== activeIndex) {
                  setActiveIndex(next);
                }
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
            {/* 轮播圆点 */}
            {visibleCatches.length > 1 ? (
              <View style={styles.dotsRow}>
                {visibleCatches.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.dot,
                      index === activeIndex && { backgroundColor: textPrimary, width: 14 },
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* 底部中央金圈玻璃相机按钮（Idle Breath） */}
      <View
        style={[styles.cameraDock, { bottom: insets.bottom + spacing.xl }]}
        pointerEvents="box-none"
      >
        <CaptureButton onPress={() => navigation.navigate('Identify')} size={104} />
      </View>
    </View>
  );
};

const CatchCard: React.FC<{
  item: RemoteCatch;
  memory?: CatchMemoryData;
  accessToken: string | null;
  isLatest: boolean;
  onPress: () => void;
}> = ({ item, memory, accessToken, isLatest, onPress }) => {
  const { profile } = useTheme();
  const lengthLabel = formatLength(memory?.lengthCm ?? null, 'cm');
  const weightLabel = formatWeight(memory?.weightKg ?? null, 'kg');
  const location = memory?.location?.trim();
  const gold = '#C9A96A';
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.cardHit}>
      <View style={[styles.card, { borderColor: profile.surface.glassBorder }]}>
        {item.imageUrl ? (
          <RemoteImage
            url={item.imageUrl}
            authToken={accessToken}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageFallbackText}>渔见</Text>
          </View>
        )}
        {/* 底部信息渐变遮罩 */}
        <View style={styles.cardOverlay}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="cardScrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#08202B" stopOpacity="0" />
                <Stop offset="0.55" stopColor="#08202B" stopOpacity="0.18" />
                <Stop offset="1" stopColor="#08202B" stopOpacity="0.66" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#cardScrim)" />
          </Svg>
          {isLatest ? (
            <View style={styles.latestBadge}>
              <Icon name="checkmark" size={13} color="#FFFFFF" />
            </View>
          ) : null}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.speciesName || '这条鱼还在确认中'}
            </Text>
            <View style={styles.cardMetaRow}>
              <View style={styles.cardMeta}>
                <Icon name="time-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.cardMetaText}>{formatCaptureWhen(item.capturedAt)}</Text>
              </View>
              {lengthLabel ? (
                <View style={styles.cardMeta}>
                  <Icon name="resize-outline" size={13} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.cardMetaText}>{lengthLabel}</Text>
                </View>
              ) : null}
              {weightLabel ? (
                <View style={styles.cardMeta}>
                  <Icon name="scale-outline" size={13} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.cardMetaText}>{weightLabel}</Text>
                </View>
              ) : null}
            </View>
            {location ? (
              <View style={styles.cardLocationRow}>
                <Icon name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.cardMetaText}>{location}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {/* 金色选中描边（最新卡片） */}
        {isLatest ? <View style={[styles.latestRing, { borderColor: gold }]} pointerEvents="none" /> : null}
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  } as ViewStyle,
  brand: {
    fontFamily: font.serif,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 16,
  } as TextStyle,
  brandSub: {
    fontSize: 14,
    letterSpacing: 4,
    marginTop: 10,
  } as TextStyle,
  avatarHit: {
    borderRadius: 22,
    marginTop: 6,
  } as ViewStyle,
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  statBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    borderRadius: radius.l,
    borderWidth: 1,
    paddingVertical: 14,
  } as ViewStyle,
  statDivider: {
    width: 1,
    height: 34,
    opacity: 0.7,
  } as ViewStyle,
  statCellHit: {
    flex: 1,
  } as ViewStyle,
  statCell: {
    alignItems: 'center',
  } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
  } as TextStyle,
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 3,
  } as ViewStyle,
  statLabel: {
    fontSize: 12,
  } as TextStyle,
  loadingCard: {
    marginTop: spacing.xl,
    borderRadius: radius.l,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  loadingText: {
    fontSize: 13,
  } as TextStyle,
  empty: {
    marginTop: spacing.xxl,
  } as ViewStyle,
  carousel: {
    gap: CARD_GAP,
    paddingHorizontal: spacing.page - 10,
    marginTop: spacing.xl + 6,
  } as ViewStyle,
  cardHit: {
    width: CARD_WIDTH,
  } as ViewStyle,
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: radius.l + 4,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  cardImage: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  cardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  cardImageFallbackText: {
    fontFamily: font.serif,
    fontSize: 22,
    color: palette.waterTeal,
    letterSpacing: 4,
  } as TextStyle,
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  } as ViewStyle,
  latestBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C9A96A',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  latestRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.l + 4,
    borderWidth: 1.5,
  } as ViewStyle,
  cardInfo: {
    alignItems: 'center',
    paddingBottom: 26,
    paddingHorizontal: 18,
    gap: 9,
  } as ViewStyle,
  cardName: {
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#FFFFFF',
    textShadowColor: 'rgba(10,30,40,0.45)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  } as ViewStyle,
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  cardMetaText: {
    fontSize: 13,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(10,30,40,0.45)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  } as ViewStyle,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(120,150,155,0.4)',
  } as ViewStyle,
  cameraDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  } as ViewStyle,
});
