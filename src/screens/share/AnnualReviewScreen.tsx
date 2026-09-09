import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCatchArchive } from '../../contexts/CatchContext';
import { font, spacing } from '../../constants/tokens';
import { palette } from '../../constants/colors';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import { ShareWork } from '../../services/shareWorkService';
import {
  AnnualFirstCard,
  AnnualMemoryCard,
  buildAnnualReview,
  buildCustomRange,
  buildShareSnapshot,
  CatchWithMemory,
  latestYearWithCatches,
} from '../../utils/growthInsights';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { RemoteImage } from '../../components/RemoteImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { EmptyState } from '../../components/ui/EmptyState';
import { FishGlyph } from '../../components/ui/FishGlyph';
import { ScreenHeader, HeaderIconButton } from '../../components';
import { Alert } from '../../utils/alert';

type ReviewNavigationProp = StackNavigationProp;
type ReviewRoute = RouteProp<{ AnnualReview: { year?: number } | undefined }, 'AnnualReview'>;

const INK = '#173B4B';
const BLUE = '#3D6B8E';
const BLUE_SOFT = '#DCE9F5';
const GOLD = '#C9A25E';
const SCREEN_W = Dimensions.get('window').width;

/**
 * 年度成长回顾（年度报告高保真稿）：
 * 总览统计 → 今年的第一次 → 这一年的突破 → 每月收获柱状图 → 值得留下的记忆 → 生成年度分享。
 * 全部数据由当年真实鱼获记录推导。
 */
export const AnnualReviewScreen: React.FC = () => {
  const navigation = useNavigation<ReviewNavigationProp>();
  const route = useRoute<ReviewRoute>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const insets = useSafeAreaInsets();
  const accessToken = session?.accessToken ?? null;
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const year = route.params?.year ?? new Date().getFullYear();

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        const entries = await Promise.all(
          catches.map(async (item) => [item.id, await catchMemoryService.load(item.id)] as const),
        );
        if (mounted) {
          setMemories(Object.fromEntries(entries));
        }
      })();
      return () => {
        mounted = false;
      };
    }, [catches]),
  );

  const items: CatchWithMemory[] = useMemo(
    () => catches.map((item) => ({ catch: item, memory: memories[item.id] ?? null })),
    [catches, memories],
  );

  const fallbackYear = useMemo(() => latestYearWithCatches(items), [items]);
  const activeYear = route.params?.year ?? fallbackYear;
  const review = useMemo(() => buildAnnualReview(items, activeYear), [items, activeYear]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  const yearSnapshot = useMemo(
    () => buildShareSnapshot(items, buildCustomRange('year', new Date(activeYear, 0, 1))),
    [items, activeYear],
  );

  const annualShareMessage =
    `${activeYear} 年渔获回顾：${review.total} 条鱼获 / ${review.speciesCount} 种鱼` +
    (review.days ? `，记录了 ${review.days} 天` : '') +
    '\n\n渔见 · 遇见更大的水域';

  const annualWork = useMemo<ShareWork>(
    () => ({
      id: `annual_${activeYear}`,
      createdAt: new Date().toISOString(),
      templateId: 'score',
      layoutIndex: 0,
      rangeKey: 'custom',
      rangeLabel: `${activeYear}年`,
      title: `${activeYear} 年度战绩`,
      location: yearSnapshot.location,
      count: yearSnapshot.count,
      speciesCount: yearSnapshot.speciesCount,
      top: yearSnapshot.top,
      others: yearSnapshot.others,
      biggest: yearSnapshot.biggest,
      story: yearSnapshot.story,
      photoUris: yearSnapshot.photoUris,
      visibility: 'private',
      shareMessage: annualShareMessage,
    }),
    [activeYear, yearSnapshot, annualShareMessage],
  );

  const shareAnnual = () => {
    Share.share({ message: annualShareMessage }).catch(() => undefined);
  };

  if (review.total === 0 && review.speciesCount === 0) {
    return (
      <View style={styles.screen}>
        <WaterBackdrop />
        <ScreenHeader title="年度回顾" onBack={() => navigation.goBack()} />
        <EmptyState
          title={`${activeYear} 年还没有鱼获记录`}
          description="新的记录会让这一年的回顾慢慢丰满起来"
          style={styles.empty}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader
        onBack={() => navigation.goBack()}
        right={
          <HeaderIconButton name="share-social-outline" color={textPrimary} onPress={shareAnnual} />
        }
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 头部 */}
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, { color: textPrimary }]}>
              {activeYear} 年成长回顾
            </Text>
            <Text style={[styles.heroSubtitle, { color: textSecondary }]}>
              回看这一年的鱼获、突破与水边记忆。
            </Text>
          </View>
          <Text style={[styles.handNote, { color: textSecondary }]}>
            山水之间，{'\n'}总有新的相遇。
          </Text>
        </View>

        {/* 总览统计 */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: profile.surface.glassStrong,
              borderColor: profile.surface.glassBorder,
            },
          ]}
        >
          <OverviewCell
            icon="calendar-outline"
            value={`${review.total}`}
            label="次鱼获记录"
            sub={null}
            ink={textPrimary}
            muted={textSecondary}
            onInfo={() =>
              Alert.alert('鱼获记录次数', `${activeYear} 年创建的鱼获记录总数。`)
            }
          />
          <CellDivider />
          <OverviewCell
            icon="fish-outline"
            value={`${review.speciesCount}`}
            label="种鱼"
            sub={review.newSpeciesThisYear > 0 ? `今年新增 ${review.newSpeciesThisYear} 种` : null}
            ink={textPrimary}
            muted={textSecondary}
            onInfo={() => Alert.alert('鱼种数', `记录以来遇见的不同鱼种总数。`)}
          />
          <CellDivider />
          <OverviewCell
            icon="stats-chart-outline"
            value={`${review.avgPerDay > 0 ? review.avgPerDay : 0}`}
            label="平均每天(尾)"
            sub={`共记录 ${review.total} 条鱼`}
            ink={textPrimary}
            muted={textSecondary}
            decimal
            onInfo={() =>
              Alert.alert('平均渔获', '每个有记录的日子的平均渔获条数。')
            }
          />
          <CellDivider />
          <OverviewCell
            icon="today-outline"
            value={`${review.days}`}
            label="今年记录天数"
            sub={review.startDateLabel ? `从 ${review.startDateLabel} 开始` : null}
            ink={textPrimary}
            muted={textSecondary}
            onInfo={() => Alert.alert('记录天数', `${activeYear} 年有鱼获记录的独立天数。`)}
          />
        </View>

        {/* 今年的第一次 */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>
            今年的第一次
          </Text>
          {review.firsts.length > 2 ? (
            <Text style={[styles.sectionHint, { color: textSecondary }]}>最近的 3 个第一次</Text>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScroll}
        >
          {review.firsts.map((first) => (
            <FirstCard key={first.id} card={first} authToken={accessToken} />
          ))}
        </ScrollView>

        {/* 这一年的突破 */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>这一年的突破</Text>
        </View>
        <View style={styles.breakthroughRow}>
          <View
            style={[
              styles.breakCard,
              {
                backgroundColor: profile.surface.glassStrong,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <View style={styles.breakTitleRow}>
              <View style={[styles.breakIcon, { backgroundColor: 'rgba(61,107,142,0.12)' }]}>
                <Icon name="trending-up" size={16} color={BLUE} />
              </View>
              <View style={styles.breakTitleText}>
                <Text style={[styles.breakTitle, { color: textPrimary }]}>最大鱼获记录</Text>
                <Text style={[styles.breakSub, { color: textSecondary }]}>
                  {review.recordRefreshCount > 0
                    ? `今年刷新了 ${review.recordRefreshCount} 次`
                    : '等待下一次刷新'}
                </Text>
              </View>
            </View>
            {review.recordProgression.length ? (
              <View style={styles.progressionRow}>
                {review.recordProgression.slice(-3).map((point, index, arr) => (
                  <React.Fragment key={point.dateLabel}>
                    <View style={styles.progressionItem}>
                      {point.imageUri ? (
                        <View style={styles.progressionThumb}>
                          <RemoteImage
                            url={point.imageUri}
                            authToken={accessToken}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                          />
                        </View>
                      ) : (
                        <View style={[styles.progressionThumb, styles.progressionThumbGlyph]}>
                          <FishGlyph size={22} color={BLUE} opacity={0.8} />
                        </View>
                      )}
                      <Text style={[styles.progressionWeight, { color: textPrimary }]}>
                        {point.weightKg}kg
                      </Text>
                      <Text style={[styles.progressionDate, { color: textSecondary }]}>
                        {point.dateLabel.slice(5)}
                      </Text>
                    </View>
                    {index < arr.length - 1 ? (
                      <Icon name="chevron-forward" size={13} color={textSecondary} />
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <Text style={[styles.breakEmpty, { color: textSecondary }]}>
                在鱼获记录里补上重量，这里会画出你的突破线。
              </Text>
            )}
          </View>

          <View
            style={[
              styles.breakCard,
              {
                backgroundColor: profile.surface.glassStrong,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <View style={styles.breakTitleRow}>
              <View style={[styles.breakIcon, { backgroundColor: 'rgba(77,158,161,0.14)' }]}>
                <Icon name="fish" size={16} color={palette.waterTeal} />
              </View>
              <View style={styles.breakTitleText}>
                <Text style={[styles.breakTitle, { color: textPrimary }]}>鱼种数量</Text>
                <Text style={[styles.breakSub, { color: textSecondary }]}>
                  {review.newSpeciesThisYear > 0
                    ? `今年新增记录 ${review.newSpeciesThisYear} 种鱼`
                    : '记录以来遇见的鱼种'}
                </Text>
              </View>
            </View>
            <View style={styles.speciesRow}>
              <View style={styles.speciesCell}>
                <Text style={[styles.speciesValue, { color: textPrimary }]}>
                  {review.speciesBefore} 种
                </Text>
                <Text style={[styles.speciesDate, { color: textSecondary }]}>
                  {activeYear} 年前
                </Text>
              </View>
              <Icon name="arrow-forward" size={15} color={GOLD} />
              <View style={styles.speciesCell}>
                <Text style={[styles.speciesValue, { color: textPrimary }]}>
                  {review.speciesCount} 种
                </Text>
                <Text style={[styles.speciesDate, { color: textSecondary }]}>现在</Text>
              </View>
            </View>
            <Text style={[styles.speciesNote, { color: textSecondary }]}>
              遇见了更多不同的鱼，也看到了更大的水域。
            </Text>
          </View>
        </View>

        {/* 这一年的收获（每月柱状图） */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>这一年的收获</Text>
          <Text style={[styles.sectionHint, { color: textSecondary }]}>每月鱼获数量（尾）</Text>
        </View>
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: profile.surface.glassStrong,
              borderColor: profile.surface.glassBorder,
            },
          ]}
        >
          <MonthlyBars monthly={review.monthly} />
        </View>

        {/* 值得留下的记忆 */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>
            这一年值得留下的记忆
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScroll}
        >
          {review.memories.map((memory) => (
            <MemoryCard key={memory.id} card={memory} authToken={accessToken} />
          ))}
          {review.memories.length === 0 ? (
            <Text style={[styles.memoryEmpty, { color: textSecondary }]}>
              继续记录，这一年的记忆会慢慢多起来。
            </Text>
          ) : null}
        </ScrollView>

        {/* 底部操作 */}
        <View style={styles.bottomRow}>
          <PressableScale
            onPress={() => navigation.goBack()}
            scaleTo={0.96}
            style={styles.backHit}
          >
            <View
              style={[
                styles.backButton,
                {
                  backgroundColor: profile.isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(255,255,255,0.8)',
                  borderColor: profile.surface.glassBorder,
                },
              ]}
            >
              <Text style={[styles.backText, { color: textSecondary }]}>返回成长历程</Text>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() =>
              navigation.navigate('SharePreview', { work: annualWork, mode: 'create', from: 'annual' })
            }
            scaleTo={0.96}
            style={styles.annualHit}
          >
            <View style={styles.annualButton}>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgGradient id="annualCtaBg" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#2E5A7C" />
                    <Stop offset="1" stopColor={INK} />
                  </SvgGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#annualCtaBg)" rx="22" />
              </Svg>
              <View style={styles.annualContent} pointerEvents="none">
                <View style={styles.annualTitleRow}>
                  <Icon name="ribbon" size={15} color={GOLD} />
                  <Text style={styles.annualTitle}>生成年度分享</Text>
                </View>
                <Text style={styles.annualSub}>把这一年的回顾，变成一份分享作品</Text>
              </View>
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
};

const CellDivider: React.FC = () => (
  <View style={styles.cellDivider} />
);

const OverviewCell: React.FC<{
  icon: string;
  value: string;
  label: string;
  sub: string | null;
  ink: string;
  muted: string;
  decimal?: boolean;
  onInfo?: () => void;
}> = ({ icon, value, label, sub, ink, muted, decimal, onInfo }) => (
  <View style={styles.overviewCell}>
    <Icon name={icon} size={17} color={BLUE} />
    <View style={styles.overviewValueRow}>
      <Text style={[styles.overviewValue, { color: ink }]}>{value}</Text>
      {onInfo ? (
        <PressableScale onPress={onInfo} scaleTo={0.9} hitSlop={6}>
          <Icon name="information-circle-outline" size={12} color={muted} />
        </PressableScale>
      ) : null}
    </View>
    <Text style={[styles.overviewLabel, { color: muted }]} numberOfLines={1}>
      {label}
    </Text>
    {sub ? (
      <Text style={[styles.overviewSub, { color: muted }]} numberOfLines={1}>
        {sub}
      </Text>
    ) : (
      <Text style={[styles.overviewSub, { color: 'transparent' }]}>—</Text>
    )}
  </View>
);

const FirstCard: React.FC<{ card: AnnualFirstCard; authToken: string | null }> = ({
  card,
  authToken,
}) => (
  <View style={styles.firstCard}>
    <Text style={[styles.firstDate, { color: BLUE }]}>{card.dateLabel}</Text>
    <Text style={[styles.firstTitle, { color: INK }]} numberOfLines={1}>
      {card.title}
    </Text>
    <View style={styles.firstThumb}>
      {card.imageUri ? (
        <RemoteImage
          url={card.imageUri}
          authToken={authToken}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.firstThumbFallback]}>
          <FishGlyph size={26} color={GOLD} opacity={0.85} />
        </View>
      )}
    </View>
    <Text style={[styles.firstSize, { color: 'rgba(23,59,75,0.66)' }]}>
      {card.size ?? '第一次遇见'}
    </Text>
    {card.location ? (
      <View style={styles.locationRow}>
        <Icon name="location" size={11} color={GOLD} />
        <Text style={[styles.locationText, { color: 'rgba(23,59,75,0.6)' }]} numberOfLines={1}>
          {card.location}
        </Text>
      </View>
    ) : null}
  </View>
);

const MemoryCard: React.FC<{ card: AnnualMemoryCard; authToken: string | null }> = ({
  card,
  authToken,
}) => (
  <View style={styles.memoryCard}>
    <View style={styles.memoryThumb}>
      {card.imageUri ? (
        <RemoteImage
          url={card.imageUri}
          authToken={authToken}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.firstThumbFallback]}>
          <FishGlyph size={30} color={GOLD} opacity={0.85} />
        </View>
      )}
    </View>
    <Text style={[styles.memoryTitle, { color: INK }]} numberOfLines={1}>
      {card.title}
    </Text>
    <Text style={[styles.memoryDesc, { color: 'rgba(23,59,75,0.66)' }]} numberOfLines={2}>
      {card.description}
    </Text>
    {card.location ? (
      <View style={styles.locationRow}>
        <Icon name="location" size={11} color={GOLD} />
        <Text style={[styles.locationText, { color: 'rgba(23,59,75,0.6)' }]} numberOfLines={1}>
          {card.location}
        </Text>
      </View>
    ) : null}
  </View>
);

/** 每月柱状图（纯视图实现，无需图表库）。 */
const MonthlyBars: React.FC<{ monthly: number[] }> = ({ monthly }) => {
  const max = Math.max(...monthly, 1);
  const lastActiveIndex = monthly.reduce((last, value, index) => (value > 0 ? index : last), -1);
  const CHART_H = 96;
  return (
    <View>
      <View style={styles.barsRow}>
        {monthly.map((value, index) => {
          const isActive = value > 0;
          const isPeak = isActive && value === Math.max(...monthly);
          const height = isActive ? Math.max(14, (value / max) * CHART_H) : 3;
          return (
            <View key={index} style={styles.barColumn}>
              <Text style={[styles.barValue, !isActive && styles.barValueIdle]}>
                {isActive ? value : '—'}
              </Text>
              <View
                style={[
                  styles.bar,
                  index === lastActiveIndex || isPeak ? styles.barStrong : null,
                  { height },
                ]}
              />
              <Text style={[styles.barLabel, !isActive && styles.barValueIdle]}>
                {index + 1}月
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  empty: {
    marginTop: spacing.xxl,
  } as ViewStyle,
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  } as ViewStyle,
  heroText: {
    flex: 1,
  } as ViewStyle,
  heroTitle: {
    fontFamily: font.serif,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  heroSubtitle: {
    fontSize: 13,
    marginTop: 6,
  } as TextStyle,
  handNote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: 'right',
    marginTop: 6,
    opacity: 0.85,
    transform: [{ rotate: '-2deg' }],
  } as TextStyle,
  statsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.lg,
  } as ViewStyle,
  overviewCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  overviewValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  overviewValue: {
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '700',
  } as TextStyle,
  overviewLabel: {
    fontSize: 10.5,
  } as TextStyle,
  overviewSub: {
    fontSize: 9.5,
    opacity: 0.85,
  } as TextStyle,
  cellDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(23,59,75,0.14)',
    marginVertical: 2,
  } as ViewStyle,
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  sectionHint: {
    fontSize: 12,
  } as TextStyle,
  hScroll: {
    gap: spacing.md,
    paddingRight: spacing.page,
  } as ViewStyle,
  firstCard: {
    width: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: spacing.md,
    gap: 4,
  } as ViewStyle,
  firstDate: {
    fontSize: 11.5,
    fontWeight: '700',
  } as TextStyle,
  firstTitle: {
    fontFamily: font.serif,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  firstThumb: {
    height: 86,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#D8E8E5',
    marginTop: 3,
  } as ViewStyle,
  firstThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D8E8E5',
  } as ViewStyle,
  firstSize: {
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  locationText: {
    fontSize: 11,
    flexShrink: 1,
  } as TextStyle,
  breakthroughRow: {
    flexDirection: 'row',
    gap: spacing.md,
  } as ViewStyle,
  breakCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  } as ViewStyle,
  breakTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  } as ViewStyle,
  breakIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  breakTitleText: {
    flex: 1,
  } as ViewStyle,
  breakTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  } as TextStyle,
  breakSub: {
    fontSize: 10.5,
    marginTop: 1,
  } as TextStyle,
  progressionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  progressionItem: {
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  progressionThumb: {
    width: 44,
    height: 30,
    borderRadius: 7,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#D8E8E5',
  } as ViewStyle,
  progressionThumbGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  progressionWeight: {
    fontFamily: font.serif,
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
  progressionDate: {
    fontSize: 9.5,
  } as TextStyle,
  breakEmpty: {
    fontSize: 11.5,
    lineHeight: 17,
  } as TextStyle,
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  } as ViewStyle,
  speciesCell: {
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  speciesValue: {
    fontFamily: font.serif,
    fontSize: 21,
    fontWeight: '700',
  } as TextStyle,
  speciesDate: {
    fontSize: 10,
  } as TextStyle,
  speciesNote: {
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: spacing.sm,
  } as TextStyle,
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  } as ViewStyle,
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  } as ViewStyle,
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  barValue: {
    fontSize: 10,
    fontWeight: '700',
    color: BLUE,
  } as TextStyle,
  barValueIdle: {
    color: 'rgba(23,59,75,0.3)',
    fontWeight: '500',
  } as TextStyle,
  bar: {
    width: 12,
    borderRadius: 6,
    backgroundColor: BLUE_SOFT,
  } as ViewStyle,
  barStrong: {
    backgroundColor: BLUE,
  } as ViewStyle,
  barLabel: {
    fontSize: 9.5,
    color: 'rgba(23,59,75,0.6)',
  } as TextStyle,
  memoryCard: {
    width: 168,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: spacing.md,
    gap: 4,
  } as ViewStyle,
  memoryThumb: {
    height: 96,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#D8E8E5',
    marginBottom: 3,
  } as ViewStyle,
  memoryTitle: {
    fontFamily: font.serif,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  memoryDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  } as TextStyle,
  memoryEmpty: {
    fontSize: 12.5,
    paddingVertical: spacing.xl,
  } as TextStyle,
  bottomRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl + spacing.md,
  } as ViewStyle,
  backHit: {
    width: SCREEN_W * 0.3,
    borderRadius: 22,
  } as ViewStyle,
  backButton: {
    height: 64,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  backText: {
    fontSize: 13.5,
    fontWeight: '600',
  } as TextStyle,
  annualHit: {
    flex: 1,
    borderRadius: 22,
  } as ViewStyle,
  annualButton: {
    height: 64,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#12324A',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  } as ViewStyle,
  annualContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  } as ViewStyle,
  annualTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  } as ViewStyle,
  annualTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  annualSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10.5,
  } as TextStyle,
});
