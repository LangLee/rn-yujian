import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useCatchArchive } from '../../contexts/CatchContext';
import { font, fs, spacing } from '../../constants/tokens';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import {
  buildGrowthSummary,
  CatchWithMemory,
  GrowthEvent,
  GrowthEventKind,
  latestYearWithCatches,
  formatDot,
} from '../../utils/growthInsights';
import { RemoteImage } from '../../components/RemoteImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { EmptyState } from '../../components/ui/EmptyState';
import { environmentBackgrounds } from '../../constants/environmentAssets';
import { useAuth } from '../../contexts/AuthContext';
import { Alert } from '../../utils/alert';

type GrowthTabNavigationProp = StackNavigationProp;

const GOLD = '#C9A25E';

const KIND_STYLE: Record<GrowthEventKind, { color: string; soft: string; badgeBg: string; badgeText: string }> = {
  record: { color: GOLD, soft: 'rgba(201,162,94,0.18)', badgeBg: 'rgba(201,162,94,0.16)', badgeText: '#9A7B3F' },
  species: { color: '#4D9EA1', soft: 'rgba(77,158,161,0.16)', badgeBg: 'rgba(77,158,161,0.14)', badgeText: '#3B7E81' },
  milestone: { color: '#3D6B8E', soft: 'rgba(61,107,142,0.14)', badgeBg: 'rgba(61,107,142,0.12)', badgeText: '#3D6B8E' },
  streak: { color: '#6C8FC7', soft: 'rgba(108,143,199,0.14)', badgeBg: 'rgba(108,143,199,0.12)', badgeText: '#5A7BB0' },
};

/**
 * 成长历程 Tab（历史分享高保真稿）：
 * 概览统计（总记录 / 鱼种 / 开始日期）→ 按月分组的时间线（新纪录 / 新鱼种 / 里程碑 / 连续记录）
 * → 年度成长回顾入口。
 */
export const GrowthTab: React.FC = () => {
  const navigation = useNavigation<GrowthTabNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const insets = useSafeAreaInsets();
  const accessToken = session?.accessToken ?? null;
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  useEffect(() => {
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
  }, [catches]);

  const items: CatchWithMemory[] = useMemo(
    () => catches.map((item) => ({ catch: item, memory: memories[item.id] ?? null })),
    [catches, memories],
  );

  const summary = useMemo(() => buildGrowthSummary(items), [items]);
  const reviewYear = useMemo(() => latestYearWithCatches(items), [items]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const isLastOverall = (groupIndex: number, eventIndex: number): boolean =>
    groupIndex === summary.groups.length - 1 &&
    eventIndex === summary.groups[groupIndex].events.length - 1;

  if (catches.length === 0) {
    return (
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <HeroHeader textPrimary={textPrimary} textSecondary={textSecondary} />
          <EmptyState
            variant="memory"
            title="你的成长历程会收藏在这里"
            description="从第一条记录开始，新鱼种、新纪录和坚持都会被记住"
            actionLabel="拍照识鱼"
            onAction={() => navigation.navigate('Identify')}
            style={styles.empty}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <HeroHeader textPrimary={textPrimary} textSecondary={textSecondary} />

        {/* 概览统计 */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: profile.surface.glassStrong,
              borderColor: profile.surface.glassBorder,
            },
          ]}
        >
          <View style={styles.statsRow}>
            <StatCell
              u={{ value: `${summary.total}`, label: '次鱼获记录', textPrimary, textSecondary }}
              onInfo={() =>
                showStatsInfo(
                  '鱼获记录次数',
                  '为你创建的记录总数，同一次出钓的多条记录会分别计数。',
                )
              }
            />
            <View style={styles.statsDivider} />
            <StatCell
              u={{ value: `${summary.speciesCount}`, label: '种鱼', textPrimary, textSecondary }}
              onInfo={() =>
                showStatsInfo('鱼种数', '已记录的不同鱼种数量，每记录一种新鱼都会点亮图鉴。')
              }
            />
            <View style={styles.statsDivider} />
            <View style={styles.startCell}>
              <Text style={[styles.startLabel, { color: textSecondary }]}>从</Text>
              <Text style={[styles.startValue, { color: textPrimary }]}>
                {summary.firstDate ? formatDot(summary.firstDate) : '—'}
              </Text>
              <Text style={[styles.startLabel, { color: textSecondary }]}>开始记录</Text>
            </View>
          </View>
          <Text style={[styles.statsNote, { color: textSecondary }]}>
            注：鱼获记录次数为你创建的记录总数，可能包含多条记录；鱼种数为已记录的不同鱼种数量。
          </Text>
        </View>

        {/* 时间线 */}
        {summary.groups.map((group, groupIndex) => (
          <View key={group.key} style={styles.monthGroup}>
            <Text style={[styles.monthLabel, { color: textPrimary }]}>{group.label}</Text>
            {group.events.map((event, eventIndex) => (
              <EventRow
                key={event.id}
                event={event}
                authToken={accessToken}
                drawLine={!isLastOverall(groupIndex, eventIndex)}
                glass={profile.surface.glassStrong}
                glassBorder={profile.surface.glassBorder}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
              />
            ))}
          </View>
        ))}

        {/* 年度成长回顾入口 */}
        <PressableScale
          onPress={() => navigation.navigate('AnnualReview', { year: reviewYear })}
          scaleTo={0.985}
        >
          <View
            style={[
              styles.reviewCard,
              {
                backgroundColor: profile.surface.glassStrong,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <View style={styles.reviewThumb}>
              <RemoteImageLocal />
            </View>
            <View style={styles.reviewInfo}>
              <Text style={[styles.reviewTitle, { color: textPrimary }]}>
                {reviewYear} 年成长回顾
              </Text>
              <Text style={[styles.reviewDesc, { color: textSecondary }]}>
                回顾这一年的收获与变化
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={textSecondary} />
          </View>
        </PressableScale>
      </ScrollView>
    </View>
  );
};

const HeroHeader: React.FC<{ textPrimary: string; textSecondary: string }> = ({
  textPrimary,
  textSecondary,
}) => (
  <View style={styles.hero}>
    <Text style={[styles.heroTitle, { color: textPrimary }]}>我的成长历程</Text>
    <Text style={[styles.heroSubtitle, { color: textSecondary }]}>
      从第一次记录，到每一次新的突破。
    </Text>
  </View>
);

const showStatsInfo = (title: string, message: string): void => {
  Alert.alert(title, message);
};

const StatCell: React.FC<{
  u: { value: string; label: string; textPrimary: string; textSecondary: string };
  onInfo?: () => void;
}> = ({ u, onInfo }) => (
  <View style={styles.statCell}>
    <View style={styles.statValueRow}>
      <Text style={[styles.statValue, { color: u.textPrimary }]}>{u.value}</Text>
      {onInfo ? (
        <PressableScale onPress={onInfo} scaleTo={0.9} hitSlop={6}>
          <Icon name="information-circle-outline" size={14} color={u.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
    <Text style={[styles.statLabel, { color: u.textSecondary }]}>{u.label}</Text>
  </View>
);

const EventRow: React.FC<{
  event: GrowthEvent;
  authToken: string | null;
  drawLine: boolean;
  glass: string;
  glassBorder: string;
  textPrimary: string;
  textSecondary: string;
}> = ({ event, authToken, drawLine, glass, glassBorder, textPrimary, textSecondary }) => {
  const kind = KIND_STYLE[event.kind];
  const hasImage = Boolean(event.imageUri);
  return (
    <View style={styles.eventRow}>
      {/* 日期 */}
      <Text style={[styles.eventDate, { color: textSecondary }]}>
        {formatDot(event.date).slice(5)}
      </Text>
      {/* 节点 + 连线 */}
      <View style={styles.markerColumn}>
        <View style={[styles.markerDot, { backgroundColor: kind.soft }]}>
          <Icon name={event.iconName} size={13} color={kind.color} />
        </View>
        {drawLine ? <View style={styles.markerLine} /> : null}
      </View>
      {/* 事件卡 */}
      <PressableScale scaleTo={0.99} style={styles.eventHit}>
        <View style={[styles.eventCard, { backgroundColor: glass, borderColor: glassBorder }]}>
          <View style={styles.eventBody}>
            <View style={[styles.eventBadge, { backgroundColor: kind.badgeBg }]}>
              <Text style={[styles.eventBadgeText, { color: kind.badgeText }]}>{event.badge}</Text>
            </View>
            <Text style={[styles.eventTitle, { color: textPrimary }]} numberOfLines={2}>
              {event.title}
            </Text>
            {event.details.map((detail, index) => (
              <Text key={index} style={[styles.eventDetail, { color: textSecondary }]} numberOfLines={2}>
                {detail}
              </Text>
            ))}
            {event.location ? (
              <View style={styles.eventLocationRow}>
                <Icon name="location-outline" size={12} color={textSecondary} />
                <Text style={[styles.eventLocation, { color: textSecondary }]} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            ) : null}
          </View>
          {hasImage ? (
            <View style={styles.eventThumb}>
              <RemoteImage
                url={event.imageUri}
                authToken={authToken}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={[styles.eventThumb, styles.eventThumbGlyph, { backgroundColor: kind.soft }]}>
              <Icon name={event.iconName} size={22} color={kind.color} />
            </View>
          )}
        </View>
      </PressableScale>
    </View>
  );
};

/** 年度回顾入口缩略图（环境照片资产，随包内置无失败路径）。 */
const RemoteImageLocal: React.FC = () => (
  <Image
    source={environmentBackgrounds.sunset}
    style={StyleSheet.absoluteFill}
    resizeMode="cover"
  />
);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xs,
  } as ViewStyle,
  empty: {
    marginTop: spacing.xxl,
  } as ViewStyle,
  hero: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  } as ViewStyle,
  heroTitle: {
    fontFamily: font.serif,
    fontSize: fs(26),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  heroSubtitle: {
    fontSize: fs(13.5),
    marginTop: 6,
  } as TextStyle,
  statsCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  } as ViewStyle,
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  statCell: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: fs(26),
    fontWeight: '700',
  } as TextStyle,
  statLabel: {
    fontSize: fs(12),
    marginTop: 3,
  } as TextStyle,
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    backgroundColor: 'rgba(23,59,75,0.16)',
  } as ViewStyle,
  startCell: {
    flex: 1.2,
    alignItems: 'center',
  } as ViewStyle,
  startValue: {
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '700',
    marginTop: 2,
  } as TextStyle,
  startLabel: {
    fontSize: fs(11.5),
  } as TextStyle,
  statsNote: {
    fontSize: fs(10.5),
    lineHeight: 16,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(23,59,75,0.1)',
  } as TextStyle,
  monthGroup: {
    marginTop: spacing.xl,
  } as ViewStyle,
  monthLabel: {
    fontFamily: font.serif,
    fontSize: fs(18),
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.md,
  } as TextStyle,
  eventRow: {
    flexDirection: 'row',
    gap: 8,
  } as ViewStyle,
  eventDate: {
    width: 40,
    fontSize: fs(12.5),
    fontWeight: '600',
    marginTop: 12,
  } as TextStyle,
  markerColumn: {
    width: 26,
    alignItems: 'center',
  } as ViewStyle,
  markerDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  } as ViewStyle,
  markerLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(23,59,75,0.12)',
    marginVertical: 2,
  } as ViewStyle,
  eventHit: {
    flex: 1,
    marginBottom: spacing.md,
    borderRadius: 16,
  } as ViewStyle,
  eventCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  } as ViewStyle,
  eventBody: {
    flex: 1,
    padding: spacing.md,
    gap: 3,
  } as ViewStyle,
  eventBadge: {
    alignSelf: 'flex-start',
    borderRadius: 9,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginBottom: 2,
  } as ViewStyle,
  eventBadgeText: {
    fontSize: fs(11),
    fontWeight: '700',
  } as TextStyle,
  eventTitle: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  eventDetail: {
    fontSize: fs(12.5),
    lineHeight: 18,
  } as TextStyle,
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  } as ViewStyle,
  eventLocation: {
    fontSize: fs(12),
    flexShrink: 1,
  } as TextStyle,
  eventThumb: {
    width: 104,
    margin: 8,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#D4E4E2',
  } as ViewStyle,
  eventThumbGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.xl,
  } as ViewStyle,
  reviewThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
  } as ViewStyle,
  reviewInfo: {
    flex: 1,
    gap: 3,
  } as ViewStyle,
  reviewTitle: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  reviewDesc: {
    fontSize: fs(12.5),
  } as TextStyle,
});
