import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  fishKnowledgeService,
  localGuideItems,
  toFallbackDetail,
} from '../services/fishKnowledgeService';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { RemoteImage } from '../components/RemoteImage';
import { TagChip } from '../components/Common';
import { ScreenHeader } from '../components';
import { CardCarousel, EmptyState, useCarouselCardTransform } from '../components/ui';
import { palette } from '../constants/colors';
import { font } from '../constants/tokens';
import { formatCaptureWhen, formatLength, formatWeight } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import {
  FishGuideItem,
  FishKnowledgeCard,
  FishKnowledgeDetail,
} from '../types/models';
import { RootStackParamList } from '../navigation/types';

type FishSpeciesDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Species'>;
type SpeciesRouteProp = RouteProp<RootStackParamList, 'Species'>;

const cardOrder = ['HERO', 'IDENTIFICATION', 'ECO', 'GEAR', 'SKILL'];
/** 卡片胶囊短标签（设计稿中主卡鱼名旁的金边小胶囊） */
const cardBadges: Record<string, string> = {
  HERO: '英雄',
  IDENTIFICATION: '识别',
  ECO: '生态',
  GEAR: '装备',
  SKILL: '技术',
};

const cardGold = '#D6B56D';
const cardInkTop = '#171717';
const cardInkBottom = '#302718';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** 左右邻卡只露 14dp（10–16dp 区间中值），避免多卡抢主视觉 */
const SIDE_PEEK = 14;
const CARD_GAP = 14;
/** 主卡 1:1，宽度由露边推算：屏宽 - 2*(露边 + 间距) */
const CARD_WIDTH = SCREEN_WIDTH - 2 * (SIDE_PEEK + CARD_GAP);
const SIDE_SCALE = 0.88;
const SIDE_DROP = 18;
const SIDE_OPACITY = 0.55;
/** 补偿侧卡缩放留出的空隙：把侧卡向外推，保证邻卡仍露出 10–16dp */
const SIDE_PUSH = Math.round((CARD_WIDTH * (1 - SIDE_SCALE)) / 2);

type DetailTabKey = 'CATCH' | 'RANKING' | 'LATEST';
const detailTabs: { key: DetailTabKey; label: string }[] = [
  { key: 'CATCH', label: '鱼获' },
  { key: 'RANKING', label: '排行' },
  { key: 'LATEST', label: '最新' },
];

const orderedActiveCards = (detail: FishKnowledgeDetail): FishKnowledgeCard[] =>
  detail.cards
    .map((card) => {
      const order = cardOrder.indexOf(card.cardType.trim().toUpperCase());
      if (order < 0 || card.status.toUpperCase() !== 'ACTIVE') return null;
      return { order, card };
    })
    .filter((entry): entry is { order: number; card: FishKnowledgeCard } => entry !== null)
    .sort(
      (a, b) =>
        a.order - b.order || a.card.sortOrder - b.card.sortOrder || a.card.id - b.card.id,
    )
    .filter((entry, index, all) => all.findIndex((e) => e.order === entry.order) === index)
    .map((entry) => entry.card);

const cardSupportText = (card: FishKnowledgeCard): string => {
  const c = card.content;
  switch (card.cardType.trim().toUpperCase()) {
    case 'IDENTIFICATION':
      return c.features
        .slice(0, 2)
        .map((f) => `${f.title}：${f.text}`)
        .join(' · ');
    case 'ECO':
      return [c.waterLayer, c.behavior].filter((v) => v.trim().length > 0).join(' · ');
    case 'GEAR':
      return [c.rod, c.hook].filter((v) => v.trim().length > 0).join(' · ');
    case 'SKILL':
      return c.tip;
    default:
      return c.description.trim().length > 0 ? c.description : card.description;
  }
};

/**
 * 鱼种详情页：顶部 5 张 Fish Knowledge 卡 + 1 张视频卡的 1:1 轮播
 * （与首页共用全局轮播方案），下方 鱼获 / 排行 / 最新 三个 Tab。
 * Fish Knowledge 内容全部来自后台 CMS（fishKnowledgeService），App 内不硬编码。
 */
export const FishSpeciesDetailScreen: React.FC = () => {
  const navigation = useNavigation<FishSpeciesDetailScreenNavigationProp>();
  const route = useRoute<SpeciesRouteProp>();
  const key = route.params?.key ?? 'grass_carp';

  const [detail, setDetail] = useState<FishKnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlinePreview, setOfflinePreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedTab, setSelectedTab] = useState<DetailTabKey>('CATCH');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const remote = await fishKnowledgeService.getDetail(key);
        if (mounted) {
          setDetail(remote);
          setOfflinePreview(false);
        }
      } catch (e) {
        if (mounted) {
          setOfflinePreview(true);
          setError(e instanceof Error ? e.message : '鱼种详情暂不可用');
        }
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [key, retryToken]);

  const fallback: FishGuideItem | null = useMemo(
    () => localGuideItems().find((item) => item.id === key) ?? null,
    [key],
  );
  const content = detail ?? (fallback ? toFallbackDetail(fallback) : null);

  if (!content) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerText}>
          {loading ? '正在加载鱼种详情…' : '暂时无法读取鱼种详情'}
        </Text>
        {!loading ? (
          <Pressable
            onPress={() => setRetryToken((value) => value + 1)}
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="重试"
          >
            <Icon name="refresh" size={17} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>重试</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const species = content.species;
  const knowledgeCards = orderedActiveCards(content);
  // Hero 是 5 卡之一，不另加；视频卡固定补在末位
  const video = content.videos[0] ?? null;
  const carouselCount = knowledgeCards.length + (video ? 1 : 0);
  const retry = () => setRetryToken((value) => value + 1);

  return (
    <View style={styles.screen}>
      {/* 顶部栏固定，不随内容滚动，高度与边距与其他页面一致 */}
      <ScreenHeader
        title={species.nameCn}
        subtitle={
          species.aliases.join('、').length > 0 ? species.aliases.join('、') : species.id
        }
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {error !== null || offlinePreview ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {offlinePreview
              ? `离线预览：${error ?? '当前内容来自本地预览'}`
              : error ?? '内容暂不可用'}
          </Text>
          <Pressable
            onPress={retry}
            style={({ pressed }) => [styles.retryChip, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="重试"
          >
            <Text style={styles.retryChipText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── 顶部轮播：Fish Knowledge 卡 ×5 + 视频卡 ×1 ── */}
      {carouselCount > 0 ? (
        <CardCarousel
          count={carouselCount}
          cardWidth={CARD_WIDTH}
          cardHeight={CARD_WIDTH}
          gap={CARD_GAP}
          sideScale={SIDE_SCALE}
          sideDrop={SIDE_DROP}
          sideOpacity={SIDE_OPACITY}
          renderItem={({ index, scrollX, step }) => {
            const isVideo = index >= knowledgeCards.length;
            const knowledgeCard = isVideo ? null : knowledgeCards[index];
            const coverUrl = knowledgeCard
              ? knowledgeCard.imageUrl.trim().length > 0
                ? fishKnowledgeService.resolveAssetUrl(knowledgeCard.imageUrl)
                : null
              : video && video.coverUrl
                ? fishKnowledgeService.resolveAssetUrl(video.coverUrl)
                : null;
            return (
              <KnowledgeCarouselCard
                index={index}
                total={carouselCount}
                scrollX={scrollX}
                step={step}
                coverUrl={coverUrl}
                title={knowledgeCard ? species.nameCn : (video?.title ?? '视频')}
                badge={knowledgeCard ? (cardBadges[knowledgeCard.cardType.trim().toUpperCase()] ?? '鱼鉴') : '视频'}
                support={
                  knowledgeCard
                    ? cardSupportText(knowledgeCard)
                    : video
                      ? `${video.type} · ${video.duration}s`
                      : ''
                }
                isVideo={isVideo}
                onOpenVideo={
                  isVideo && video
                    ? () => Linking.openURL(video.videoUrl).catch(() => undefined)
                    : undefined
                }
              />
            );
          }}
        />
      ) : null}

      {/* ── 鱼名 + 标签 ── */}
      <View style={styles.speciesHeader}>
        <View style={styles.speciesHeaderRow}>
          <View style={styles.speciesHeaderText}>
            <Text style={styles.speciesTitle}>{species.nameCn}</Text>
            {species.scientificName && species.scientificName.trim().length > 0 ? (
              <Text style={styles.speciesScientific}>{species.scientificName}</Text>
            ) : null}
          </View>
          <Pressable style={styles.bookmarkButton} accessibilityRole="button" accessibilityLabel="收藏">
            <Icon name="bookmark-outline" size={22} color={palette.waterTeal} />
          </Pressable>
        </View>
        <View style={styles.speciesTags}>
          {species.category.trim().length > 0 ? (
            <TagChip text={species.category} emphasized />
          ) : null}
          {species.family && species.family.trim().length > 0 ? (
            <TagChip text={species.family} />
          ) : null}
          {species.genus && species.genus.trim().length > 0 ? <TagChip text={species.genus} /> : null}
        </View>
      </View>

      {/* ── Tabs：鱼获 / 排行 / 最新 ── */}
      <View style={styles.tabBar}>
        {detailTabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setSelectedTab(tab.key)}
            style={[styles.tabItem, selectedTab === tab.key && styles.tabItemSelected]}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
          >
            <Text
              style={[
                styles.tabItemText,
                selectedTab === tab.key && styles.tabItemTextSelected,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {selectedTab === 'CATCH' ? (
        <SpeciesCatchList speciesId={species.id} speciesName={species.nameCn} />
      ) : selectedTab === 'RANKING' ? (
        <View style={styles.placeholderCard}>
          <EmptyState
            title="排行榜筹备中"
            description="按鱼种的最大重量与长度排行，即将开放"
            style={styles.placeholderInner}
          />
        </View>
      ) : (
        <View style={styles.placeholderCard}>
          <EmptyState
            title="最新动态筹备中"
            description="钓友们的最新鱼获与发现，即将开放"
            style={styles.placeholderInner}
          />
        </View>
      )}
      </ScrollView>
    </View>
  );
};

/* ─── 轮播卡片：1:1，编号 01/06 + 鱼名 + 胶囊 + 一句说明 ─────────────────── */

const KnowledgeCarouselCard: React.FC<{
  index: number;
  total: number;
  scrollX: Animated.Value;
  step: number;
  coverUrl: string | null;
  title: string;
  badge: string;
  support: string;
  isVideo: boolean;
  onOpenVideo?: () => void;
}> = ({ index, total, scrollX, step, coverUrl, title, badge, support, isVideo, onOpenVideo }) => {
  const { scale, opacity, translateY, translateX } = useCarouselCardTransform(
    index,
    scrollX,
    step,
    SIDE_SCALE,
    SIDE_DROP,
    SIDE_OPACITY,
    SIDE_PUSH,
  );
  const pageCountText = String(total).padStart(2, '0');

  return (
    <Animated.View
      style={[
        styles.carouselCardWrap,
        { opacity, transform: [{ translateX }, { scale }, { translateY }] },
      ]}
    >
      <Pressable
        onPress={onOpenVideo}
        disabled={!isVideo || !onOpenVideo}
        style={({ pressed }) => [styles.carouselCard, pressed && { opacity: 0.92 }]}
        accessibilityRole={isVideo ? 'button' : undefined}
        accessibilityLabel={isVideo ? `打开视频 ${title}` : undefined}
      >
        {coverUrl ? (
          <RemoteImage url={coverUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: cardInkTop }]} />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: cardInkBottom, opacity: 0.9, height: '50%', top: '50%' },
              ]}
            />
          </View>
        )}

        {isVideo ? (
          <View style={styles.videoBadgeWrap}>
            <View style={styles.videoPlayBadge}>
              <Icon name="play" size={26} color="#FFFFFF" />
            </View>
          </View>
        ) : null}

        {/* 左上角编号 */}
        <View style={styles.cardIndexRow}>
          <Text style={styles.cardIndexCurrent}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.cardIndexTotal}>{` / ${pageCountText}`}</Text>
        </View>

        {/* 底部：鱼名 + 胶囊 + 说明 */}
        <View style={styles.cardFooter}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>{badge}</Text>
            </View>
          </View>
          {support.trim().length > 0 ? (
            <Text style={styles.cardSupport} numberOfLines={2}>
              {support}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
};

/* ─── 鱼获 Tab：该鱼种的真实鱼获记录 ──────────────────────────────────────── */

const SpeciesCatchList: React.FC<{ speciesId: string; speciesName: string }> = ({
  speciesId,
  speciesName,
}) => {
  const navigation = useNavigation<FishSpeciesDetailScreenNavigationProp>();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const speciesCatches = useMemo(
    () => catches.filter((item) => item.speciesId === speciesId),
    [catches, speciesId],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        speciesCatches.map(
          async (item) => [item.id, await catchMemoryService.load(item.id)] as const,
        ),
      );
      if (mounted) setMemories(Object.fromEntries(entries));
    })();
    return () => {
      mounted = false;
    };
  }, [speciesCatches]);

  if (speciesCatches.length === 0) {
    return (
      <View style={styles.placeholderCard}>
        <EmptyState
          title={`还没有${speciesName}的鱼获`}
          description="拍下你的渔获，渔见会安静地帮你认出它、收藏它"
          style={styles.placeholderInner}
        />
      </View>
    );
  }

  return (
    <View style={styles.catchList}>
      {speciesCatches.map((item) => {
        const memory = memories[item.id];
        const weightLabel = formatWeight(memory?.weightKg ?? null, 'kg');
        const lengthLabel = formatLength(memory?.lengthCm ?? null, 'cm');
        const location = memory?.location?.trim();
        const meta = [weightLabel, lengthLabel, location].filter((v) => !!v && v.length > 0);
        return (
          <Pressable
            key={item.id}
            onPress={() =>
              navigation.navigate('CatchDetail', { catchId: item.id, initialCatch: item })
            }
            style={({ pressed }) => [styles.catchRow, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`查看鱼获 ${item.speciesName}`}
          >
            <View style={styles.catchThumb}>
              <RemoteImage
                url={item.imageUrl}
                authToken={session?.accessToken ?? null}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            </View>
            <View style={styles.catchBody}>
              <Text style={styles.catchName}>{item.speciesName || speciesName}</Text>
              <Text style={styles.catchDate}>{formatCaptureWhen(item.capturedAt)}</Text>
              {meta.length > 0 ? (
                <View style={styles.catchMetaRow}>
                  {meta.map((value) => (
                    <View key={value} style={styles.catchMetaChip}>
                      <Text style={styles.catchMetaText}>{value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={18} color={palette.mutedInk} />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.warmBackground },
  scrollBody: { flex: 1 },
  content: { paddingTop: 14, paddingBottom: 40 },
  centerScreen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: { color: palette.mutedInk, fontSize: 14 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: palette.waterTeal,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: { color: '#FFFFFF' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#FFF3E8',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  errorBannerText: { flex: 1, color: '#9A5B16', fontSize: 11 },
  retryChip: {
    backgroundColor: palette.waterTeal,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryChipText: { color: '#FFFFFF', fontSize: 12 },

  /* 轮播卡片 */
  carouselCardWrap: { flex: 1 },
  carouselCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: cardInkTop,
    overflow: 'hidden',
    shadowColor: '#0B2A30',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cardIndexRow: {
    position: 'absolute',
    top: 18,
    left: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cardIndexCurrent: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textShadowColor: 'rgba(8,28,38,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  cardIndexTotal: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginBottom: 3,
    textShadowColor: 'rgba(8,28,38,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  cardFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 22,
    paddingTop: 46,
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: font.serif,
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 2,
    textShadowColor: 'rgba(8,28,38,0.55)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
  cardBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cardGold,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(8,28,38,0.25)',
  },
  cardBadgeText: { color: cardGold, fontSize: 11, letterSpacing: 2 },
  cardSupport: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 18,
    textShadowColor: 'rgba(8,28,38,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  videoBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(8,28,38,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* 鱼名 + 标签 */
  speciesHeader: { marginTop: 14, marginHorizontal: 20 },
  speciesHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  speciesHeaderText: { flex: 1 },
  speciesTitle: { color: palette.deepInk, fontSize: 32, fontWeight: '700' },
  speciesScientific: { color: palette.mutedInk, fontSize: 13, marginTop: 3 },
  bookmarkButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: palette.cardWhite,
    borderRadius: 18,
    padding: 5,
    gap: 4,
  },
  tabItem: { flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  tabItemSelected: { backgroundColor: palette.deepInk },
  tabItemText: { color: palette.mutedInk, fontSize: 12, fontWeight: '500' },
  tabItemTextSelected: { color: '#FFFFFF', fontWeight: '700' },

  /* 占位 / 鱼获列表 */
  placeholderCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 18,
  },
  placeholderInner: { backgroundColor: 'transparent' },
  catchList: { marginHorizontal: 20, marginTop: 14, gap: 10 },
  catchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cardWhite,
    borderRadius: 20,
    padding: 12,
    gap: 12,
  },
  catchThumb: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
  },
  catchBody: { flex: 1 },
  catchName: { color: palette.deepInk, fontSize: 15, fontWeight: '600' },
  catchDate: { color: palette.mutedInk, fontSize: 11, marginTop: 4 },
  catchMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  catchMetaChip: {
    backgroundColor: palette.warmBackground,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catchMetaText: { color: palette.mutedInk, fontSize: 10 },
});
