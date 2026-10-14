import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AppIcon, AppIconName } from '../../components/icons/AppIcon';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCatchArchive } from '../../contexts/CatchContext';
import { font, fs, spacing } from '../../constants/tokens';
import { palette } from '../../constants/colors';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import { ShareRangeKey, ShareTemplateId, ShareWork, shareWorkService } from '../../services/shareWorkService';
import {
  buildRange,
  buildShareSnapshot,
  CatchWithMemory,
  formatDot,
  weekRangeOf,
} from '../../utils/growthInsights';
import { RemoteImage } from '../../components/RemoteImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { EmptyState } from '../../components/ui/EmptyState';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { FishGlyph } from '../../components/ui/FishGlyph';

type ShareTabNavigationProp = StackNavigationProp;

const GOLD = '#D6A541';
const GOLD_LIGHT = '#E7D2A2';
const INK = '#0B2D4B';

/**
 * 鱼获分享 Tab（入口高保真稿）：
 * 生成入口卡（范围 chips + 金色 CTA）→ AI 推荐模板（由真实数据生成推荐卡）→ 我的作品。
 */
export const ShareHomeTab: React.FC = () => {
  const navigation = useNavigation<ShareTabNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const insets = useSafeAreaInsets();
  const accessToken = session?.accessToken ?? null;

  const [rangeKey, setRangeKey] = useState<ShareRangeKey>('week');
  const [works, setWorks] = useState<ShareWork[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [menuWork, setMenuWork] = useState<ShareWork | null>(null);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const reloadWorks = useCallback(() => {
    let mounted = true;
    shareWorkService.list().then((list) => {
      if (mounted) {
        setWorks(list);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(reloadWorks);

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

  // AI 推荐数据：本周 / 本月快照 + 最大鱼获事件
  const weekSnapshot = useMemo(() => {
    const range = buildRange('week');
    return { range, snapshot: buildShareSnapshot(items, range) };
  }, [items]);

  const monthSnapshot = useMemo(() => {
    const range = buildRange('month');
    return { range, snapshot: buildShareSnapshot(items, range) };
  }, [items]);

  const biggestEvent = useMemo(() => {
    let best: { item: CatchWithMemory; date: Date } | null = null;
    for (const item of items) {
      const weight = item.memory?.weightKg;
      const date = new Date(item.catch.capturedAt);
      if (typeof weight !== 'number' || weight <= 0 || Number.isNaN(date.getTime())) {
        continue;
      }
      if (!best || weight > (best.item.memory?.weightKg ?? 0)) {
        best = { item, date };
      }
    }
    return best;
  }, [items]);

  const weekPhotos = weekSnapshot.snapshot.photoUris.filter(Boolean) as string[];
  const hasAnyCatch = catches.length > 0;

  const startCreate = (preset: {
    presetRange?: ShareRangeKey;
    presetTemplate?: ShareTemplateId;
    presetCatchId?: string;
  }) => navigation.navigate('ShareCreate', preset);

  const openWork = (work: ShareWork) =>
    navigation.navigate('SharePreview', { work, mode: 'view' });

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const visibleWorks = expanded ? works : works.slice(0, 3);

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 60 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 生成入口卡 */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: profile.surface.glassStrong,
              borderColor: profile.surface.glassBorder,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroTextBlock}>
              <Text style={[styles.heroTitle, { color: textPrimary }]}>生成新的鱼获分享</Text>
              <Text style={[styles.heroSubtitle, { color: textSecondary }]}>
                把今天、本周或本月的鱼获整理成可分享的作品
              </Text>
            </View>
            <GoldPill label="开始生成" onPress={() => startCreate({ presetRange: rangeKey })} />
          </View>
          <View style={styles.heroChips}>
            {(['today', 'week', 'month', 'custom'] as ShareRangeKey[]).map((key) => {
              const active = rangeKey === key;
              return (
                <PressableScale key={key} onPress={() => setRangeKey(key)} scaleTo={0.95}>
                  <View
                    style={[
                      styles.rangeChip,
                      {
                        borderColor: active ? GOLD : 'rgba(23,59,75,0.18)',
                        backgroundColor: active ? 'rgba(201,162,94,0.16)' : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rangeChipText,
                        { color: active ? GOLD_DEEP_TEXT : textSecondary },
                      ]}
                    >
                      {RANGE_LABELS[key]}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
          <Text style={[styles.heroNote, { color: textSecondary }]}>
            每一次出发，都是与自然的相遇。
          </Text>
        </View>

        {/* AI 推荐模板 */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <AppIcon name="sparkles" size={17} color={GOLD} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>AI推荐模板</Text>
          </View>
          <PressableScale onPress={() => startCreate({})} scaleTo={0.96}>
            <View style={styles.sectionLink}>
              <Text style={[styles.sectionLinkText, { color: textSecondary }]}>查看全部</Text>
              <AppIcon name="chevron_right" size={14} color={textSecondary} />
            </View>
          </PressableScale>
        </View>
        <Text style={[styles.sectionDesc, { color: textSecondary }]}>
          为你推荐鱼获分享的精彩模板
        </Text>

        {!hasAnyCatch ? (
          <EmptyState
            variant="home"
            title="还没有可以分享的鱼获"
            description="拍下第一条鱼，AI 会把它整理成值得收藏的作品"
            actionLabel="拍照识鱼"
            onAction={() => navigation.navigate('Identify')}
            style={styles.featureEmpty}
          />
        ) : (
          <>
            {/* 本周鱼获收藏册 */}
            <FeatureCard
                  title="本周鱼获收藏册"
                  meta={`${weekSnapshot.snapshot.count} 条鱼获 · ${weekSnapshot.snapshot.speciesCount} 种鱼`}
                  rangeLabel={weekSnapshot.range.rangeLabel}
                  quote="这一周，湖水依旧温柔，收获了不少惊喜。"
                  photos={weekPhotos}
                  totalCount={weekSnapshot.snapshot.count}
                  authToken={accessToken}
                  badgeEvent="关键事件"
                  onPress={() => startCreate({ presetRange: 'week', presetTemplate: 'score' })}
                />
            <View style={styles.sideRow}>
              {/* 本月渔获回顾 */}
              <SideCard
                title={`${new Date().getMonth() + 1}月渔获回顾`}
                meta={`${monthSnapshot.snapshot.count} 条鱼获 · ${monthSnapshot.snapshot.speciesCount} 种鱼`}
                quote="这个月的湖面，藏着不少美好的相遇。"
                photos={monthSnapshot.snapshot.photoUris.filter(Boolean) as string[]}
                totalCount={monthSnapshot.snapshot.count}
                authToken={accessToken}
                onPress={() => startCreate({ presetRange: 'month', presetTemplate: 'score' })}
              />
              {/* 最大鱼获记录 */}
              <SideCard
                title={
                  biggestEvent
                    ? `最大${biggestEvent.item.catch.speciesName || '鱼获'}记录`
                    : '最大鱼获记录'
                }
                meta={
                  biggestEvent
                    ? `${formatDot(biggestEvent.date)} ｜ ${biggestEvent.item.catch.speciesName || '鱼获'}${
                        biggestEvent.item.memory?.weightKg
                          ? ` · ${biggestEvent.item.memory.weightKg}kg`
                          : ''
                      }`
                    : '等待第一条重量记录'
                }
                quote="一次耐心的等待，换来最棒的收获。"
                photos={biggestEvent?.item.catch.imageUrl ? [biggestEvent.item.catch.imageUrl] : []}
                totalCount={0}
                authToken={accessToken}
                badgeEvent="关键时刻"
                onPress={() =>
                  startCreate({
                    presetRange: 'month',
                    presetTemplate: 'score',
                    presetCatchId: biggestEvent?.item.catch.id,
                  })
                }
              />
            </View>
          </>
        )}

        {/* 我的作品 */}
        <View style={[styles.sectionHeader, styles.worksHeader]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>我的作品</Text>
          {works.length > 3 ? (
            <PressableScale onPress={() => setExpanded((value) => !value)} scaleTo={0.96}>
              <View style={styles.sectionLink}>
                <Text style={[styles.sectionLinkText, { color: textSecondary }]}>
                  {expanded ? '收起' : '查看全部'}
                </Text>
                <AppIcon name={expanded ? 'expand_less' : 'chevron_right'} size={14} color={textSecondary} />
              </View>
            </PressableScale>
          ) : null}
        </View>

        {works.length === 0 ? (
          <View
            style={[
              styles.worksEmpty,
              {
                backgroundColor: profile.surface.glass,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <View style={[styles.worksEmptyIcon, { backgroundColor: profile.surface.accentSoft }]}>
              <FishGlyph size={30} color={profile.surface.accent} opacity={0.9} />
            </View>
            <Text style={[styles.worksEmptyTitle, { color: textPrimary }]}>还没有分享记忆</Text>
            <Text style={[styles.worksEmptyDesc, { color: textSecondary }]}>
              将你的鱼获整理成精美作品，记录水边的美好时光
            </Text>
            <PressableScale onPress={() => startCreate({})} scaleTo={0.96} style={styles.worksEmptyHit}>
              <View style={[styles.worksEmptyButton, { backgroundColor: INK }]}>
                <Text style={styles.worksEmptyButtonText}>＋ 生成第一个记忆</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.worksList}>
            {visibleWorks.map((work) => (
              <WorkRow
                key={work.id}
                work={work}
                authToken={accessToken}
                onPress={() => openWork(work)}
                onMenu={() => setMenuWork(work)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* 作品操作菜单 */}
      <BottomSheet visible={menuWork != null} onClose={() => setMenuWork(null)} title="作品操作">
        {menuWork ? (
          <>
            <SheetAction
              icon="visibility"
              label="查看作品"
              onPress={() => {
                const work = menuWork;
                setMenuWork(null);
                openWork(work);
              }}
            />
            <SheetAction
              icon="share"
              label="系统分享"
              onPress={() => {
                const work = menuWork;
                setMenuWork(null);
                void shareWork(work.shareMessage);
              }}
            />
            <SheetAction
              icon="trash"
              label="删除作品"
              danger
              onPress={() => {
                const work = menuWork;
                setMenuWork(null);
                void shareWorkService.remove(work.id).then(() => reloadWorks());
              }}
            />
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
};

const GOLD_DEEP_TEXT = '#9A7B3F';
const RANGE_LABELS: Record<ShareRangeKey, string> = {
  today: '今天',
  week: '本周',
  month: '本月',
  custom: '自定义',
};

async function shareWork(message: string): Promise<void> {
  Share.share({ message }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// 小组件
// ---------------------------------------------------------------------------

/** 金色渐变胶囊按钮（入口卡 CTA）。 */
const GoldPill: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.95}>
    <View style={styles.goldPill}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="goldPillBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GOLD_LIGHT} />
            <Stop offset="1" stopColor={GOLD} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#goldPillBg)" rx="21" />
      </Svg>
      <View style={styles.goldPillRow} pointerEvents="none">
        <Text style={styles.goldPillText}>{label}</Text>
        <AppIcon name="chevron_right" size={14} color="#FFFFFF" />
      </View>
    </View>
  </PressableScale>
);

const FeatureCard: React.FC<{
  title: string;
  meta: string;
  rangeLabel: string;
  quote: string;
  photos: string[];
  totalCount: number;
  authToken: string | null;
  badgeEvent?: string;
  onPress: () => void;
}> = ({ title, meta, rangeLabel, quote, photos, totalCount, authToken, badgeEvent, onPress }) => {
  const { profile } = useTheme();
  const shown = photos.slice(0, 3);
  const rest = Math.max(0, totalCount - shown.length);
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} style={styles.featureHit}>
      <View style={[styles.featureCard, { borderColor: profile.surface.glassBorder }]}>
        {photos[0] ? (
          <RemoteImage
            url={photos[0]}
            authToken={authToken}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id="featureWaterBg" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#CFE4E2" />
                <Stop offset="1" stopColor="#8FB9B5" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#featureWaterBg)" />
          </Svg>
        )}
        {/* 白纱渐变，保证左侧文字可读 */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="featureScrim" x1="0" y1="0" x2="0.9" y2="1">
              <Stop offset="0" stopColor="#FDFEFF" stopOpacity="0.94" />
              <Stop offset="0.55" stopColor="#F4FAFB" stopOpacity="0.72" />
              <Stop offset="1" stopColor="#DCEBEC" stopOpacity="0.3" />
            </SvgGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#featureScrim)" />
        </Svg>

        <View style={styles.featureContent}>
          <View style={styles.badgeRow}>
            {badgeEvent ? (
              <View style={styles.badgeEvent}>
                <AppIcon name="sparkles" size={11} color={GOLD_DEEP_TEXT} />
                <Text style={styles.badgeEventText}>{badgeEvent}</Text>
              </View>
            ) : null}
            <View style={styles.badgeAI}>
              <AppIcon name="sparkles" size={11} color="#FFFFFF" />
              <Text style={styles.badgeAIText}>AI 推荐</Text>
            </View>
          </View>
          <Text style={[styles.featureTitle, { color: INK }]}>{title}</Text>
          <Text style={[styles.featureMeta, { color: 'rgba(23,59,75,0.66)' }]}>
            {rangeLabel} ｜ {meta}
          </Text>
          <Text style={[styles.featureQuote, { color: 'rgba(23,59,75,0.62)' }]}>{quote}</Text>
          <View style={styles.featureBottom}>
            <View style={styles.thumbRow}>
              {shown.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.thumb}>
                  <RemoteImage url={uri} authToken={authToken} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </View>
              ))}
              {rest > 0 ? (
                <View style={[styles.thumb, styles.thumbMore]}>
                  <Text style={styles.thumbMoreText}>+{rest}</Text>
                </View>
              ) : null}
              {shown.length === 0 ? (
                <View style={[styles.thumb, styles.thumbMore]}>
                  <FishGlyph size={18} color={GOLD_DEEP_TEXT} />
                </View>
              ) : null}
            </View>
            <View style={styles.featureCta}>
              <Text style={styles.featureCtaText}>查看回忆</Text>
              <AppIcon name="chevron_right" size={13} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
};

const SideCard: React.FC<{
  title: string;
  meta: string;
  quote: string;
  photos: string[];
  totalCount: number;
  authToken: string | null;
  badgeEvent?: string;
  onPress: () => void;
}> = ({ title, meta, quote, photos, totalCount, authToken, badgeEvent, onPress }) => {
  const { profile } = useTheme();
  const shown = photos.slice(0, 2);
  const rest = Math.max(0, totalCount - shown.length);
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.sideHit}>
      <View style={[styles.sideCard, { borderColor: profile.surface.glassBorder }]}>
        {photos[0] ? (
          <RemoteImage
            url={photos[0]}
            authToken={authToken}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="sideScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FDFEFF" stopOpacity="0.95" />
              <Stop offset="0.5" stopColor="#F6FBFB" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#DCEBEC" stopOpacity="0.42" />
            </SvgGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#sideScrim)" />
        </Svg>
        <View style={styles.sideContent}>
          <View style={styles.badgeRow}>
            <View style={styles.badgeAI}>
              <AppIcon name="sparkles" size={10} color="#FFFFFF" />
              <Text style={styles.badgeAIText}>AI 推荐</Text>
            </View>
            {badgeEvent ? (
              <View style={styles.badgeEvent}>
                <AppIcon name="sparkles" size={10} color={GOLD_DEEP_TEXT} />
                <Text style={styles.badgeEventText}>{badgeEvent}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.sideTitle, { color: INK }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sideMeta, { color: 'rgba(23,59,75,0.66)' }]} numberOfLines={2}>
            {meta}
          </Text>
          <Text style={[styles.sideQuote, { color: 'rgba(23,59,75,0.6)' }]} numberOfLines={2}>
            {quote}
          </Text>
          <View style={styles.thumbRow}>
            {shown.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.thumbSmall}>
                <RemoteImage url={uri} authToken={authToken} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </View>
            ))}
            {rest > 0 ? (
              <View style={[styles.thumbSmall, styles.thumbMore]}>
                <Text style={styles.thumbMoreText}>+{rest}</Text>
              </View>
            ) : null}
            {shown.length === 0 ? (
              <View style={[styles.thumbSmall, styles.thumbMore]}>
                <FishGlyph size={16} color={GOLD_DEEP_TEXT} />
              </View>
            ) : null}
          </View>
          <View style={[styles.featureCta, styles.sideCta]}>
            <Text style={styles.featureCtaText}>查看回忆</Text>
            <AppIcon name="chevron_right" size={12} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </PressableScale>
  );
};

const WorkRow: React.FC<{
  work: ShareWork;
  authToken: string | null;
  onPress: () => void;
  onMenu: () => void;
}> = ({ work, authToken, onPress, onMenu }) => {
  const { profile } = useTheme();
  const created = formatDot(new Date(work.createdAt));
  const coverUri = work.photoUris.find(Boolean) ?? null;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985}>
      <View
        style={[
          styles.workRow,
          {
            backgroundColor: profile.surface.glassStrong,
            borderColor: profile.surface.glassBorder,
          },
        ]}
      >
        <View style={styles.workThumb}>
          {coverUri ? (
            <RemoteImage url={coverUri} authToken={authToken} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.workThumbFallback]}>
              <FishGlyph size={22} color={GOLD_DEEP_TEXT} />
            </View>
          )}
        </View>
        <View style={styles.workInfo}>
          <Text style={[styles.workTitle, { color: profile.surface.textPrimary }]} numberOfLines={1}>
            {work.title}
          </Text>
          <Text style={[styles.workMeta, { color: profile.surface.textSecondary }]} numberOfLines={1}>
            {work.rangeLabel}
          </Text>
          <Text style={[styles.workMeta, { color: profile.surface.textSecondary }]}>
            {work.count} 条鱼获 · {work.speciesCount} 种鱼
          </Text>
        </View>
        <View style={styles.workRight}>
          <PressableScale onPress={onMenu} scaleTo={0.9} hitSlop={8}>
            <AppIcon name="more" size={18} color={profile.surface.textSecondary} />
          </PressableScale>
          <Text style={[styles.workDate, { color: profile.surface.textSecondary }]}>{created}</Text>
        </View>
      </View>
    </PressableScale>
  );
};

const SheetAction: React.FC<{
  icon: AppIconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}> = ({ icon, label, danger, onPress }) => {
  const { profile } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.98}>
      <View style={styles.sheetAction}>
        <AppIcon
          name={icon}
          size={19}
          color={danger ? palette.qualityInvalid : profile.surface.textPrimary}
        />
        <Text
          style={[
            styles.sheetActionText,
            { color: danger ? palette.qualityInvalid : profile.surface.textPrimary },
          ]}
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
};

// ---------------------------------------------------------------------------
// 样式
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xs,
  } as ViewStyle,
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  } as ViewStyle,
  heroTextBlock: {
    flex: 1,
  } as ViewStyle,
  heroTitle: {
    fontFamily: font.serif,
    fontSize: fs(21),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  heroSubtitle: {
    fontSize: fs(12.5),
    lineHeight: 19,
    marginTop: 6,
  } as TextStyle,
  heroChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  } as ViewStyle,
  rangeChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 13,
  } as ViewStyle,
  rangeChipText: {
    fontSize: fs(13),
    fontWeight: '600',
  } as TextStyle,
  heroNote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: fs(12),
    textAlign: 'right',
    marginTop: spacing.md,
    opacity: 0.8,
  } as TextStyle,
  goldPill: {
    width: 118,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    shadowColor: '#8A6A2F',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  } as ViewStyle,
  goldPillRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  } as ViewStyle,
  goldPillText: {
    color: '#FFFFFF',
    fontSize: fs(14),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  } as ViewStyle,
  worksHeader: {
    marginTop: spacing.xl + 6,
  } as ViewStyle,
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: font.serif,
    fontSize: fs(20),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  sectionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  } as ViewStyle,
  sectionLinkText: {
    fontSize: fs(13),
  } as TextStyle,
  sectionDesc: {
    fontSize: fs(12.5),
    marginTop: 4,
    marginBottom: spacing.md,
  } as TextStyle,
  featureEmpty: {
    marginTop: spacing.sm,
  } as ViewStyle,
  featureHit: {
    borderRadius: 20,
  } as ViewStyle,
  featureCard: {
    height: 216,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#DCEBEC',
  } as ViewStyle,
  featureContent: {
    flex: 1,
    padding: spacing.lg,
  } as ViewStyle,
  badgeRow: {
    flexDirection: 'row',
    gap: 7,
  } as ViewStyle,
  badgeEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(201,162,94,0.75)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingVertical: 3,
    paddingHorizontal: 9,
  } as ViewStyle,
  badgeEventText: {
    color: GOLD_DEEP_TEXT,
    fontSize: fs(11),
    fontWeight: '600',
  } as TextStyle,
  badgeAI: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 11,
    backgroundColor: 'rgba(201,162,94,0.92)',
    paddingVertical: 3,
    paddingHorizontal: 9,
  } as ViewStyle,
  badgeAIText: {
    color: '#FFFFFF',
    fontSize: fs(11),
    fontWeight: '600',
  } as TextStyle,
  featureTitle: {
    fontFamily: font.serif,
    fontSize: fs(23),
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: spacing.md,
  } as TextStyle,
  featureMeta: {
    fontSize: fs(13),
    marginTop: 6,
  } as TextStyle,
  featureQuote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: fs(13.5),
    lineHeight: 20,
    marginTop: 6,
    flex: 1,
  } as TextStyle,
  featureBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  } as ViewStyle,
  thumbRow: {
    flexDirection: 'row',
    gap: 7,
  } as ViewStyle,
  thumb: {
    width: 46,
    height: 34,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#D4E4E2',
  } as ViewStyle,
  thumbSmall: {
    width: 38,
    height: 30,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#D4E4E2',
  } as ViewStyle,
  thumbMore: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(120,144,148,0.85)',
  } as ViewStyle,
  thumbMoreText: {
    color: '#FFFFFF',
    fontSize: fs(12),
    fontWeight: '700',
  } as TextStyle,
  featureCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(201,162,94,0.95)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    shadowColor: '#8A6A2F',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  } as ViewStyle,
  sideCta: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
  } as ViewStyle,
  featureCtaText: {
    color: '#FFFFFF',
    fontSize: fs(12.5),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  sideRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  } as ViewStyle,
  sideHit: {
    flex: 1,
    borderRadius: 18,
  } as ViewStyle,
  sideCard: {
    height: 250,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#DCEBEC',
  } as ViewStyle,
  sideContent: {
    flex: 1,
    padding: spacing.md + 2,
  } as ViewStyle,
  sideTitle: {
    fontFamily: font.serif,
    fontSize: fs(18),
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: spacing.sm + 2,
  } as TextStyle,
  sideMeta: {
    fontSize: fs(12),
    lineHeight: 17,
    marginTop: 4,
  } as TextStyle,
  sideQuote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: fs(12),
    lineHeight: 17,
    marginTop: 4,
    marginBottom: spacing.sm,
    flex: 1,
  } as TextStyle,
  worksList: {
    gap: spacing.md,
    marginTop: spacing.md,
  } as ViewStyle,
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  } as ViewStyle,
  workThumb: {
    width: 62,
    height: 62,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#D4E4E2',
  } as ViewStyle,
  workThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3EDEA',
  } as ViewStyle,
  workInfo: {
    flex: 1,
    gap: 2,
  } as ViewStyle,
  workTitle: {
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  workMeta: {
    fontSize: fs(12),
  } as TextStyle,
  workRight: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: 2,
  } as ViewStyle,
  workDate: {
    fontSize: fs(11),
  } as TextStyle,
  worksEmpty: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  } as ViewStyle,
  worksEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  } as ViewStyle,
  worksEmptyTitle: {
    fontSize: fs(16),
    fontWeight: '700',
  } as TextStyle,
  worksEmptyDesc: {
    fontSize: fs(12.5),
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  } as TextStyle,
  worksEmptyHit: {
    marginTop: spacing.lg,
    borderRadius: 24,
  } as ViewStyle,
  worksEmptyButton: {
    borderRadius: 24,
    paddingVertical: 11,
    paddingHorizontal: 22,
  } as ViewStyle,
  worksEmptyButtonText: {
    color: '#FFFFFF',
    fontSize: fs(14),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xs,
  } as ViewStyle,
  sheetActionText: {
    fontSize: fs(15),
    fontWeight: '500',
  } as TextStyle,
});
