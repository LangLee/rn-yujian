import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ImageStyle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AppIcon } from '../components/icons/AppIcon';
import {
  fishKnowledgeService,
  localGuideItems,
  toFallbackDetail,
} from '../services/fishKnowledgeService';
import { RemoteImage, prefetchRemoteImages } from '../components/RemoteImage';
import { MorningLakeScene } from '../components/coreui';
import { brandColors, font, fs, spacing } from '../constants/tokens';
import { coreColors, coreGlass, coreRadius } from '../constants/coreUi';
import { CardCarousel, CardCarouselHandle } from '../components/ui/CardCarousel';
import { PressableScale } from '../components/ui/PressableScale';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import {
  FishGuideItem,
  FishKnowledgeCard,
  FishKnowledgeDetail,
  FishKnowledgeSimilar,
  RemoteCatch,
} from '../types/models';
import {
  RootStackParamList,
  StackNavigationProp,
} from '../navigation/types';

type FishSpeciesDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Species'>;
type SpeciesRouteProp = RouteProp<RootStackParamList, 'Species'>;

/* ── 知识卡视觉 Token（深湖蓝 → 湖蓝渐变底 + 金色点缀；不使用黑色底） ── */
const INK_TOP = '#0B2D4B';
const INK_BOTTOM = '#165271';
const CARD_GOLD = '#D6B56D';
const CARD_GOLD_DIM = 'rgba(214,181,109,0.45)';
const INK_VALUE = 'rgba(255,255,255,0.85)';
const INK_VALUE_SOFT = 'rgba(255,255,255,0.60)';

const { width: SCREEN_W } = Dimensions.get('window');
/** 页面合同 §5.2：主卡 ~82–86% 屏宽，邻卡每侧可见 ~5–8% */
const CARD_WIDTH = Math.round(SCREEN_W * 0.84);
/** 无图时的文字卡回退比例（w:h，原冻结稿竖版卡高） */
const FALLBACK_CARD_ASPECT = 0.86;
/** 卡片比例钳制：插画比例再极端也不让卡片过扁或过长，保证轮播与文字卡可用 */
const CARD_ASPECT_MIN = 0.72;
const CARD_ASPECT_MAX = 1.6;
const CARD_GAP = 10;
/** 动效合同 §4.2：知识卡无需缩放动画，层次由居中 + 露边承担，仅降透明度 */
const SIDE_OPACITY = 0.5;

/** 内容契约 §1：五个固定知识位（顺序冻结，运行时不得重排） */
const KNOWLEDGE_SLOTS: { type: string; role: string }[] = [
  { type: 'HERO', role: '鱼种名片' },
  { type: 'IDENTIFICATION', role: '辨识特征' },
  { type: 'ECO', role: '生态习性' },
  { type: 'GEAR', role: '装备建议' },
  { type: 'SKILL', role: '作钓要点' },
];

interface KnowledgeRow {
  label: string;
  value: string;
}

interface KnowledgeSlotData {
  type: string;
  role: string;
  /** 该位是否有足够真实内容（无则渲染官方「内容暂不可用」占位，位次不变） */
  available: boolean;
  rows: KnowledgeRow[];
  similar: FishKnowledgeSimilar[];
  heroSummary: string;
  artworkUrl: string | null;
}

const activeCardByType = (detail: FishKnowledgeDetail): Record<string, FishKnowledgeCard> => {
  const map: Record<string, FishKnowledgeCard> = {};
  for (const card of detail.cards) {
    const type = card.cardType.trim().toUpperCase();
    if (card.status.trim().toUpperCase() !== 'ACTIVE' || map[type]) continue;
    map[type] = card;
  }
  return map;
};

/** 标签-值对 → 知识行（空值行直接省略，不编造不移位） */
const rowsFromPairs = (pairs: [string, string][]): KnowledgeRow[] =>
  pairs
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => ({ label, value }));

const compact = (parts: (string | null | undefined)[]): string[] =>
  parts.map((part) => (part ?? '').trim()).filter((part) => part.length > 0);

/**
 * 内容契约（04）数据映射：结构化知识是事实来源；
 * 缺失行直接省略，不得编造、不得移位补位。
 */
function buildKnowledgeSlots(detail: FishKnowledgeDetail): KnowledgeSlotData[] {
  const cards = activeCardByType(detail);
  const { knowledge, profile, fishing, species } = detail;

  return KNOWLEDGE_SLOTS.map(({ type, role }) => {
    const card = cards[type];
    const content = card?.content;
    const artworkUrl = fishKnowledgeService.resolveAssetUrl(card?.imageUrl ?? '');

    if (type === 'HERO') {
      const heroSummary =
        compact([content?.description, card?.description, species.summary])[0] ?? '';
      return {
        type,
        role,
        available: species.nameCn.length > 0 && (heroSummary.length > 0 || Boolean(artworkUrl)),
        rows: [],
        similar: [],
        heroSummary,
        artworkUrl,
      };
    }

    let rows: KnowledgeRow[] = [];
    let similar: FishKnowledgeSimilar[] = [];

    if (type === 'IDENTIFICATION') {
      rows = (content?.features ?? [])
        .filter((feature) => feature.title || feature.text)
        .slice(0, 5)
        .map((feature) => ({
          label: feature.title,
          value: feature.text,
        }));
      if (rows.length === 0 && profile.features.length > 0) {
        rows = profile.features.slice(0, 5).map((feature) => ({ label: '特征', value: feature }));
      }
      similar = content?.similar ?? [];
    } else if (type === 'ECO') {
      const eco = knowledge.ecology;
      rows = rowsFromPairs([
        ['栖息', compact([eco.habitat.join(' · '), content?.habitat.join(' · '), profile.habitat.join(' · ')])[0] ?? ''],
        ['水层', compact([eco.waterLayer, content?.waterLayer, fishing.waterLayer])[0] ?? ''],
        ['季节', compact([eco.season, content?.season, profile.season.join(' · ')])[0] ?? ''],
        ['习性', compact([eco.behavior, content?.behavior])[0] ?? ''],
        ['食性', compact([eco.diet, content?.diet, profile.food])[0] ?? ''],
      ]);
    } else if (type === 'GEAR') {
      const gear = knowledge.gear;
      rows = rowsFromPairs([
        ['钓法', compact([gear.method, content?.method, fishing.method.join(' · ')])[0] ?? ''],
        ['竿', compact([gear.rod, content?.rod])[0] ?? ''],
        ['线', compact([gear.line, content?.line])[0] ?? ''],
        ['钩', compact([gear.hook, content?.hook])[0] ?? ''],
        ['饵', compact([gear.bait.join('、'), content?.bait.join('、'), fishing.bait.join('、')])[0] ?? ''],
      ]);
    } else if (type === 'SKILL') {
      const skill = knowledge.skill;
      rows = rowsFromPairs([
        ['找鱼', compact([skill.find, content?.find])[0] ?? ''],
        ['诱钓', compact([skill.attract, content?.attract])[0] ?? ''],
        ['操作', compact([skill.action, content?.action])[0] ?? ''],
        ['提示', compact([skill.tip, content?.tip, fishing.summary])[0] ?? ''],
      ]);
    }

    return {
      type,
      role,
      available: rows.length > 0 || similar.length > 0,
      rows,
      similar,
      heroSummary: '',
      artworkUrl,
    };
  });
}

/** 记录时间：捕捞时间优先，缺失回退创建时间（降序） */
const recordTime = (item: RemoteCatch): number => {
  const captured = Date.parse(item.capturedAt);
  return Number.isFinite(captured) && captured > 0
    ? captured
    : Number.isFinite(Date.parse(item.createdAt))
      ? Date.parse(item.createdAt)
      : 0;
};

/**
 * 鱼种详情（Fish Guide V2 · 02 鱼种详情 FROZEN）：
 * Back + 鱼种头（名称 + 轻量描述行 + 金色点缀）→ 固定五张知识卡轮播
 * （有图时图片满卡即内容；无图回退结构化文字，深湖蓝底非黑）→
 * `NN / 05` 唯一页指示器 → `我的{鱼种}`（真实 FishRecord 链接）。
 * 无 Search / Share / 排行 / 「最新」/ 次级 Tab / 页面级 CTA（V1 明确排除）。
 */
export const FishSpeciesDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<FishSpeciesDetailScreenNavigationProp>();
  const route = useRoute<SpeciesRouteProp>();
  const key = route.params?.key ?? 'grass_carp';
  const carouselRef = useRef<CardCarouselHandle>(null);

  const [detail, setDetail] = useState<FishKnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlinePreview, setOfflinePreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  /** 冷进入固定 01/05；返回由栈内常驻状态自然恢复 */
  const [cardIndex, setCardIndex] = useState(0);

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
  /* memo 化：回退分支的 toFallbackDetail 每次渲染都新建对象，
     不稳定会让下游 slots/预取 effect 跟着每帧重算 */
  const content = useMemo(
    () => detail ?? (fallback ? toFallbackDetail(fallback) : null),
    [detail, fallback],
  );

  const slots = useMemo(
    () => (content ? buildKnowledgeSlots(content) : []),
    [content],
  );
  const firstArtwork = useMemo(
    () => slots.find((slot) => slot.artworkUrl)?.artworkUrl ?? null,
    [slots],
  );

  /* 卡片高度跟随插画比例：卡与图同比例，contain 下图片满卡无留白。
     当前内容管线插画统一 1:1，测量返回前先按 1 渲染避免比例跳变；
     整组无图（文字回退卡）时不测量，沿用 0.86 竖版卡高。 */
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  useEffect(() => {
    setMeasuredAspect(null);
    if (!firstArtwork) return;
    let mounted = true;
    Image.getSize(
      firstArtwork,
      (width, height) => {
        if (mounted && width > 0 && height > 0) setMeasuredAspect(width / height);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [firstArtwork]);
  const cardAspect = firstArtwork ? (measuredAspect ?? 1) : FALLBACK_CARD_ASPECT;
  const cardHeight = Math.round(
    CARD_WIDTH / Math.min(Math.max(cardAspect, CARD_ASPECT_MIN), CARD_ASPECT_MAX),
  );

  /* 卡片插画预取：单张 2MB+ 弱网加载可达数秒，进入详情即并行
     拉全部五张入磁盘缓存，翻卡时即时命中（仅绝对 http 地址生效） */
  useEffect(() => {
    prefetchRemoteImages(slots.map((slot) => slot.artworkUrl));
  }, [slots]);

  /* 我的{鱼种}：已保存 FishRecord 计数与最近真实预览（02 §7） */
  const { session, catches } = useAuthAndArchive();
  const speciesCatches = useMemo(() => {
    if (!content) return [];
    return catches
      .filter((item) => item.speciesId === content.species.id)
      .sort((a, b) => recordTime(b) - recordTime(a));
  }, [catches, content]);
  const savedCount = speciesCatches.length;
  const previews = speciesCatches.slice(0, 2);

  if (!content) {
    return (
      <View style={styles.screen}>
        <MorningLakeScene level="data" />
        <View style={[styles.unresolved, { paddingTop: insets.top }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backHit}
            accessibilityRole="button"
            accessibilityLabel="返回"
          >
            <AppIcon name="back" size={22} color={coreColors.deepLakeBlue} />
          </Pressable>
          <View style={styles.unresolvedBody}>
            <Text style={styles.unresolvedTitle}>
              {loading ? '' : '该鱼种资料暂不可用'}
            </Text>
            {!loading ? (
              <PressableScale onPress={() => setRetryToken((value) => value + 1)} scaleTo={0.96}>
                <Text style={styles.unresolvedAction}>重试</Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const species = content.species;

  /* 鱼种头描述行：单行轻量（displayTag · 水层 → 分类兜底） */
  const waterLayer = compact([
    content.knowledge.ecology.waterLayer,
    content.fishing.waterLayer,
  ])[0];
  const displayTag = content.knowledge.displayTag ?? '';
  const descriptor =
    compact([displayTag, waterLayer]).join(' · ') || species.category.trim() || species.summary;

  const openMyCatches = () => {
    navigation.navigate('MyCatches', { speciesQuery: species.nameCn });
  };

  return (
    <View style={styles.screen}>
      <MorningLakeScene level="data" />
      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back + 鱼种头（冻结层级：深蓝衬线鱼名最强 + 湖蓝描述行 + 居中金色点缀） ── */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backHit}
            accessibilityRole="button"
            accessibilityLabel="返回"
          >
            <AppIcon name="back" size={22} color={coreColors.deepLakeBlue} />
          </Pressable>
          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={styles.speciesName}>{species.nameCn}</Text>
            {descriptor.length > 0 ? (
              <Text style={styles.speciesDescriptor} numberOfLines={1}>
                {descriptor}
              </Text>
            ) : null}
            <View style={styles.goldRule} />
          </View>
          <View style={styles.backHit} pointerEvents="none" />
        </View>

        {/* ── 知识区域级错误（最小隔离 + 区域内重试；不影响页面身份） ── */}
        {error !== null || offlinePreview ? (
          <View style={styles.errorChipRow}>
            <Text style={styles.errorChipText} numberOfLines={1}>
              {offlinePreview ? '离线内容 · 展示本地预览' : '暂时无法加载'}
            </Text>
            <PressableScale
              onPress={() => setRetryToken((value) => value + 1)}
              scaleTo={0.94}
            >
              <Text style={styles.errorChipRetry}>重试</Text>
            </PressableScale>
          </View>
        ) : null}

        {/* ── 固定五张知识卡轮播（有图满卡展示；无自动播放 / 无循环 / 无缩放动画） ── */}
        <View
          style={styles.carouselWrap}
          accessibilityLabel={`第 ${cardIndex + 1} 张，共 5 张`}
        >
          <CardCarousel
            ref={carouselRef}
            count={KNOWLEDGE_SLOTS.length}
            cardWidth={CARD_WIDTH}
            cardHeight={cardHeight}
            gap={CARD_GAP}
            sideScale={1}
            sideDrop={0}
            sideOpacity={SIDE_OPACITY}
            sidePush={0}
            onChange={setCardIndex}
            renderItem={({ index, isActive, scrollX, step }) => (
              <KnowledgeCard
                slot={slots[index]}
                position={index + 1}
                isActive={isActive}
                onCenterOnly={() => carouselRef.current?.scrollToIndex(index)}
                speciesName={species.nameCn}
                scientificName={species.scientificName ?? ''}
                tags={compact([species.category, species.family, species.genus])}
                scrollX={scrollX}
                step={step}
                index={index}
              />
            )}
          />
        </View>

        {/* ── 页指示器 `NN / 05`（唯一指示器，settled 后更新） ── */}
        <View style={styles.indicator}>
          <Text style={styles.indicatorCurrent}>
            {String(cardIndex + 1).padStart(2, '0')}
          </Text>
          <Text style={styles.indicatorTotal}> / 05</Text>
        </View>

        {/* ── 我的{鱼种}（Mist Glass 容器；0 记录走冻结零记录子状态） ── */}
        <View style={styles.mySpecies}>
          {savedCount >= 1 ? (
            <PressableScale onPress={openMyCatches} scaleTo={0.99} style={styles.mySpeciesHit}>
              <View style={styles.mySpeciesHeader}>
                <Text style={styles.mySpeciesTitle}>我的{species.nameCn}</Text>
                <View style={styles.mySpeciesCountRow}>
                  <Text style={styles.mySpeciesCount}>{savedCount}次记录</Text>
                  <AppIcon name="chevron_right" size={15} color={coreColors.deepLakeBlue} />
                </View>
              </View>
            </PressableScale>
          ) : (
            <View style={styles.mySpeciesHeader}>
              <Text style={styles.mySpeciesTitle}>我的{species.nameCn}</Text>
              <Text style={styles.mySpeciesCount}>0次记录</Text>
            </View>
          )}

          {savedCount >= 1 ? (
            <View style={styles.previewRow}>
              {previews.map((item) => (
                <PressableScale
                  key={item.id}
                  onPress={() =>
                    navigation.navigate('CatchDetail', { catchId: item.id, initialCatch: item })
                  }
                  scaleTo={0.985}
                  style={styles.previewTileHit}
                  accessibilityRole="button"
                  accessibilityLabel={`查看鱼获 ${item.speciesName || species.nameCn}`}
                >
                  <View style={styles.previewTile}>
                    <RemoteImage
                      url={item.imageUrl}
                      authToken={session?.accessToken ?? null}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  </View>
                </PressableScale>
              ))}
              {/* 仅 1 条真实记录：不伪造第二张，用占位保持两列几何 */}
              {previews.length === 1 ? <View style={styles.previewTileHit} /> : null}
            </View>
          ) : (
            <View style={styles.zeroBody}>
              <Text style={styles.zeroCopy}>还没有记录</Text>
              <PressableScale
                onPress={() => navigation.navigate('Identify')}
                scaleTo={0.96}
                style={styles.zeroActionHit}
                accessibilityRole="button"
                accessibilityLabel="去记录鱼获"
              >
                {/* PressableScale 的 style 只作用于外层，children 内需自包行容器才能横排 */}
                <View style={styles.zeroActionRow}>
                  <Text style={styles.zeroAction}>去记录鱼获</Text>
                  <AppIcon
                    name="chevron_right"
                    size={14}
                    color={brandColors.primaryTeal}
                  />
                </View>
              </PressableScale>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

/* 组合小 Hook：会话 + 鱼获档案（详情页两处依赖） */
function useAuthAndArchive(): { session: ReturnType<typeof useAuth>['session']; catches: RemoteCatch[] } {
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  return { session, catches };
}

/* ─── 知识卡（图片即内容；无图回退深湖蓝金文字卡） ────────────────────────── */

const KnowledgeCard: React.FC<{
  slot: KnowledgeSlotData;
  position: number;
  isActive: boolean;
  onCenterOnly: () => void;
  speciesName: string;
  scientificName: string;
  tags: string[];
  scrollX: Animated.Value;
  step: number;
  index: number;
}> = ({ slot, position, isActive, onCenterOnly, speciesName, scientificName, tags, scrollX, step, index }) => {
  /* 动效合同 §4.2：不缩放，仅按距中心距离连续降透明度 */
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step];
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [SIDE_OPACITY, 1, SIDE_OPACITY],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.inkWrap, { opacity }]}>
      {/* 邻卡点击仅居中（§4.3）；居中卡为只读知识面，无隐藏动作 */}
      <Pressable
        onPress={isActive ? undefined : onCenterOnly}
        disabled={isActive}
        style={({ pressed }) => [styles.inkCardPress, pressed && { opacity: 0.92 }]}
      >
      <View style={styles.inkCard}>
        {/* 深湖蓝 → 湖蓝渐变底：无图回退卡的卡底；有图卡作 contain 上下留白的衬底 */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id={`ink-${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={INK_TOP} />
              <Stop offset="1" stopColor={INK_BOTTOM} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#ink-${index})`} />
        </Svg>

        {slot.artworkUrl ? (
          /* 图片即内容：卡高已按插画实测比例设定，contain 满卡无留白；
             不用 cover——插画标注贴边，任何裁切都会丢内容 */
          <RemoteImage
            url={slot.artworkUrl}
            style={styles.artImage}
            resizeMode="contain"
          />
        ) : (
          <>
            {/* 卡头：金色衬线序号 + 金边角色胶囊 */}
            <View style={styles.inkHeader}>
              <Text style={styles.inkNumber}>{String(position).padStart(2, '0')}</Text>
              <View style={styles.inkRolePill}>
                <Text style={styles.inkRoleText}>{slot.role}</Text>
              </View>
            </View>

            {!slot.available ? (
              /* 官方「内容暂不可用」占位（位次与 NN/05 保持不变） */
              <View style={styles.unavailableBody}>
                <Text style={styles.unavailableTitle}>内容暂不可用</Text>
                <Text style={styles.unavailableSub}>该卡片资料正在完善</Text>
              </View>
            ) : slot.type === 'HERO' ? (
              <View style={styles.heroBody}>
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroName}>{speciesName}</Text>
                  {scientificName.length > 0 ? (
                    <Text style={styles.heroScientific} numberOfLines={1}>
                      {scientificName}
                    </Text>
                  ) : null}
                  {slot.heroSummary.length > 0 ? (
                    <Text style={styles.heroSummary} numberOfLines={4}>
                      {slot.heroSummary}
                    </Text>
                  ) : null}
                  {tags.length > 0 ? (
                    <View style={styles.heroTags}>
                      {tags.map((tag) => (
                        <View key={tag} style={styles.heroTag}>
                          <Text style={styles.heroTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.rowsBody}>
                {slot.rows.map((row) => (
                  <View key={`${row.label}-${row.value}`} style={styles.inkRow}>
                    <Text style={styles.inkRowLabel}>{row.label}</Text>
                    <Text style={styles.inkRowValue} numberOfLines={2}>
                      {row.value}
                    </Text>
                  </View>
                ))}
                {slot.similar.length > 0 ? (
                  <View style={styles.inkRow}>
                    <Text style={styles.inkRowLabel}>易混淆</Text>
                    {slot.similar.slice(0, 3).map((item) => (
                      <Text
                        key={item.name}
                        style={styles.inkSimilarText}
                        numberOfLines={2}
                      >
                        <Text style={styles.inkSimilarName}>{item.name}</Text>
                        {item.difference ? `：${item.difference}` : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}
      </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 } as ViewStyle,
  scrollBody: { flex: 1 } as ViewStyle,
  content: {} as ViewStyle,

  /* 鱼种头 */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginBottom: 6,
  } as ViewStyle,
  backHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  speciesName: {
    fontFamily: font.serif,
    fontSize: fs(30),
    lineHeight: fs(38),
    fontWeight: '600',
    letterSpacing: 3,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  speciesDescriptor: {
    fontSize: fs(12),
    lineHeight: fs(17),
    letterSpacing: 2,
    color: coreColors.lakeBlue,
    maxWidth: '86%',
  } as TextStyle,
  goldRule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: coreColors.morningGold,
    marginTop: 5,
  } as ViewStyle,

  /* 区域级错误胶囊 */
  errorChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: coreGlass.B.border,
    backgroundColor: coreGlass.B.bg,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
  } as ViewStyle,
  errorChipText: {
    fontSize: fs(11),
    color: coreColors.lakeBlue,
  } as TextStyle,
  errorChipRetry: {
    fontSize: fs(12),
    fontWeight: '600',
    color: brandColors.primaryTeal,
  } as TextStyle,

  /* 轮播与指示器 */
  carouselWrap: {} as ViewStyle,
  indicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 2,
  } as ViewStyle,
  indicatorCurrent: {
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '600',
    letterSpacing: 1,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  indicatorTotal: {
    fontSize: fs(11),
    lineHeight: fs(16),
    letterSpacing: 1,
    color: coreColors.lakeBlue,
  } as TextStyle,

  /* 我的{鱼种}（Mist Glass A 容器） */
  mySpecies: {
    marginTop: 16,
    marginHorizontal: spacing.page,
    borderRadius: coreRadius.lg,
    borderWidth: 1,
    backgroundColor: coreGlass.A.bg,
    borderColor: coreGlass.A.border,
    shadowColor: coreGlass.A.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  } as ViewStyle,
  mySpeciesHit: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    marginVertical: -spacing.md,
    paddingVertical: spacing.md,
  } as ViewStyle,
  mySpeciesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  } as ViewStyle,
  mySpeciesTitle: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '600',
    letterSpacing: 1,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  mySpeciesCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  mySpeciesCount: {
    fontSize: fs(13),
    letterSpacing: 0.5,
    color: coreColors.lakeBlue,
  } as TextStyle,
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  } as ViewStyle,
  previewTileHit: {
    flex: 1,
  } as ViewStyle,
  previewTile: {
    height: 96,
    borderRadius: coreRadius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.45)',
  } as ViewStyle,
  previewImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,

  /* 零记录子状态（02A FROZEN：无箭头不可点 + 一行文案 + 文字动作） */
  zeroBody: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  } as ViewStyle,
  zeroCopy: {
    fontSize: fs(13),
    letterSpacing: 1,
    color: coreColors.mistBlueGray,
  } as TextStyle,
  zeroActionHit: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  } as ViewStyle,
  zeroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  } as ViewStyle,
  zeroAction: {
    fontSize: fs(14),
    /* 显式行高：CJK 字形光学中心落在行框中心，与 14dp 箭头由 alignItems 居中对齐 */
    lineHeight: fs(16),
    fontWeight: '600',
    letterSpacing: 1,
    color: brandColors.primaryTeal,
  } as TextStyle,

  /* 未解析 / 加载兜底（保持页面身份 + Back 可用） */
  unresolved: {
    flex: 1,
  } as ViewStyle,
  unresolvedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  } as ViewStyle,
  unresolvedTitle: {
    fontSize: fs(14),
    letterSpacing: 1,
    color: coreColors.lakeBlue,
  } as TextStyle,
  unresolvedAction: {
    fontSize: fs(14),
    fontWeight: '600',
    color: brandColors.primaryTeal,
  } as TextStyle,

  /* ── 知识卡 ── */
  inkWrap: { flex: 1 } as ViewStyle,
  inkCardPress: {
    flex: 1,
  } as ViewStyle,
  inkCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_GOLD_DIM,
    overflow: 'hidden',
    shadowColor: '#0B2A30',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    backgroundColor: INK_TOP,
  } as ViewStyle,
  inkHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
  } as ViewStyle,
  inkNumber: {
    fontFamily: font.serif,
    fontSize: fs(26),
    fontWeight: '700',
    lineHeight: fs(30),
    color: CARD_GOLD,
    letterSpacing: 1,
  } as TextStyle,
  inkRolePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CARD_GOLD_DIM,
    backgroundColor: 'rgba(214,181,109,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 3,
  } as ViewStyle,
  inkRoleText: {
    fontSize: fs(10),
    letterSpacing: 2,
    color: CARD_GOLD,
  } as TextStyle,

  unavailableBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  } as ViewStyle,
  unavailableTitle: {
    fontSize: fs(14),
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.72)',
  } as TextStyle,
  unavailableSub: {
    fontSize: fs(11),
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.42)',
  } as TextStyle,

  /* 图片即内容：插画按宽度完整放入（contain，横向不裁切） */
  artImage: {
    flex: 1,
  } as ImageStyle,

  /* HERO 回退卡身（无图时纯名片文字） */
  heroBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 18,
  } as ViewStyle,
  heroTextBlock: {
    gap: 5,
  } as ViewStyle,
  heroName: {
    fontFamily: font.serif,
    fontSize: fs(26),
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
  } as TextStyle,
  heroScientific: {
    fontSize: fs(11),
    fontStyle: 'italic',
    letterSpacing: 0.5,
    color: INK_VALUE_SOFT,
  } as TextStyle,
  heroSummary: {
    fontSize: fs(12),
    lineHeight: fs(18),
    color: INK_VALUE,
  } as TextStyle,
  heroTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  } as ViewStyle,
  heroTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CARD_GOLD_DIM,
    paddingHorizontal: 8,
    paddingVertical: 2,
  } as ViewStyle,
  heroTagText: {
    fontSize: fs(10),
    letterSpacing: 1,
    color: CARD_GOLD,
  } as TextStyle,

  /* 结构化回退卡身：金边信息行 */
  rowsBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  } as ViewStyle,
  inkRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(214,181,109,0.32)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
  } as ViewStyle,
  inkRowLabel: {
    fontSize: fs(10),
    letterSpacing: 2,
    color: CARD_GOLD,
  } as TextStyle,
  inkRowValue: {
    fontSize: fs(12.5),
    lineHeight: fs(18),
    color: INK_VALUE,
  } as TextStyle,
  inkSimilarText: {
    fontSize: fs(12),
    lineHeight: fs(18),
    color: INK_VALUE_SOFT,
  } as TextStyle,
  inkSimilarName: {
    color: INK_VALUE,
    fontWeight: '600',
  } as TextStyle,
});
