import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  fishKnowledgeService,
  localGuideItems,
  toFallbackDetail,
} from '../services/fishKnowledgeService';
import { FishIllustration } from '../components/FishIllustration';
import { RemoteImage } from '../components/RemoteImage';
import { TagChip, YujianTopBar } from '../components/Common';
import { palette } from '../constants/colors';
import {
  FishGuideItem,
  FishKnowledgeCard,
  FishKnowledgeCardContent,
  FishKnowledgeDetail,
} from '../types/models';
import { RootStackParamList } from '../navigation/types';

type FishSpeciesDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Species'>;
type SpeciesRouteProp = RouteProp<RootStackParamList, 'Species'>;

const cardOrder = ['HERO', 'IDENTIFICATION', 'ECO', 'GEAR', 'SKILL'];
const cardLabels: Record<string, string> = {
  HERO: '英雄卡',
  IDENTIFICATION: '识别卡',
  ECO: '生态卡',
  GEAR: '装备卡',
  SKILL: '作钓技术卡',
};
const cardGold = '#D6B56D';
const cardInk = '#171717';
const cardInkDeep = '#302718';
/** 鱼鉴卡渐变近似色（上段）。 */
const cardGradientTop = '#171717';
/** 鱼鉴卡渐变近似色（下段）。 */
const cardGradientBottom = '#302718';

type DetailTabKey = 'INTRO' | 'CATCH' | 'RANKING';
const detailTabs: { key: DetailTabKey; label: string }[] = [
  { key: 'INTRO', label: '鱼种介绍' },
  { key: 'CATCH', label: '我的鱼获' },
  { key: 'RANKING', label: '排行榜' },
];

const emptyCardContent = (type: string): FishKnowledgeCardContent => ({
  type,
  tag: '',
  rarity: 0,
  power: 0,
  challenge: 0,
  description: '',
  features: [],
  similar: [],
  habitat: [],
  waterLayer: '',
  season: '',
  behavior: '',
  diet: '',
  method: '',
  rod: '',
  line: '',
  hook: '',
  bait: [],
  find: '',
  attract: '',
  action: '',
  tip: '',
});

const cardSlots = (detail: FishKnowledgeDetail): FishKnowledgeCard[] => {
  const existing = new Map(
    detail.cards.map((card) => [card.cardType.trim().toUpperCase(), card]),
  );
  return cardOrder.map((type, index) => {
    const card = existing.get(type);
    if (card) {
      return card;
    }
    return {
      id: -(index + 1),
      speciesId: detail.species.id,
      cardType: type,
      title: `${detail.species.nameCn}${cardLabels[type] ?? '鱼鉴卡'}`,
      imageUrl: '',
      description: '',
      content: emptyCardContent(type),
      sortOrder: index,
      status: 'DRAFT',
    };
  });
};

const orderedHeroCards = (detail: FishKnowledgeDetail): FishKnowledgeCard[] => {
  const entries = detail.cards
    .map((card) => {
      const normalizedType = card.cardType.trim().toUpperCase();
      const order = cardOrder.indexOf(normalizedType);
      if (order < 0 || card.status.toUpperCase() !== 'ACTIVE') {
        return null;
      }
      return { order, card };
    })
    .filter((entry): entry is { order: number; card: FishKnowledgeCard } => entry !== null)
    .sort(
      (a, b) =>
        a.order - b.order || a.card.sortOrder - b.card.sortOrder || a.card.id - b.card.id,
    );
  const seen = new Set<number>();
  return entries
    .filter((entry) => {
      if (seen.has(entry.order)) {
        return false;
      }
      seen.add(entry.order);
      return true;
    })
    .map((entry) => entry.card);
};

/**
 * 鱼种详情页（对应原 FishSpeciesDetailScreen.kt，554 行）：
 * 封面轮播、五张鱼鉴卡、结构化知识、钓法、Gallery、视频。
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
  const [selectedTab, setSelectedTab] = useState<DetailTabKey>('INTRO');
  const [heroPage, setHeroPage] = useState(0);
  const [heroWidth, setHeroWidth] = useState(0);

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
      if (mounted) {
        setLoading(false);
      }
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
  const aliases = species.aliases.join('、');
  const catchCount = fallback?.catches ?? 0;
  const cards = cardSlots(content);
  const heroCards = orderedHeroCards(content);
  const retry = () => setRetryToken((value) => value + 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <YujianTopBar
        title={species.nameCn}
        subtitle={aliases.length > 0 ? aliases : species.id}
        onBack={() => navigation.goBack()}
      />

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

      {/* Hero 轮播 */}
      <View
        style={styles.heroWrap}
        onLayout={(event) => setHeroWidth(event.nativeEvent.layout.width)}
      >
        {heroCards.length === 0 ? (
          <View style={[styles.heroCard, styles.heroEmpty]}>
            <Text style={styles.heroEmptyText}>暂无鱼鉴卡</Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.heroCard}
              onMomentumScrollEnd={(event) => {
                const page = Math.round(
                  event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width,
                );
                setHeroPage(page);
              }}
            >
              {heroCards.map((card) => {
                const imageUrl =
                  card.imageUrl.trim().length > 0
                    ? fishKnowledgeService.resolveAssetUrl(card.imageUrl)
                    : null;
                return (
                  <View key={card.id} style={[styles.heroPage, { width: heroWidth }]}>
                    {imageUrl ? (
                      <RemoteImage
                        url={imageUrl}
                        style={StyleSheet.absoluteFill}
                        resizeMode="contain"
                      />
                    ) : (
                      <HeroCardPlaceholder card={card} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.heroDots}>
              {heroCards.map((card, index) => (
                <View
                  key={card.id}
                  style={[
                    styles.heroDot,
                    index === heroPage ? styles.heroDotActive : null,
                  ]}
                />
              ))}
            </View>
          </>
        )}
      </View>

      {/* 鱼种头部 */}
      <View style={styles.speciesHeader}>
        <View style={styles.speciesHeaderRow}>
          <View style={styles.speciesHeaderText}>
            <Text style={styles.speciesTitle}>{species.nameCn}</Text>
            {species.scientificName && species.scientificName.trim().length > 0 ? (
              <Text style={styles.speciesScientific}>{species.scientificName}</Text>
            ) : null}
          </View>
          <View style={styles.bookmarkButton}>
            <Icon name="bookmark" size={22} color={palette.waterTeal} />
          </View>
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
        {species.summary.trim().length > 0 ? (
          <Text style={styles.speciesSummary}>{species.summary}</Text>
        ) : null}
      </View>

      {/* 五张鱼鉴卡 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>五张鱼鉴卡 · 左右滑动</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
        >
          {cards.map((card) => {
            const imageUrl =
              card.imageUrl.trim().length > 0
                ? fishKnowledgeService.resolveAssetUrl(card.imageUrl)
                : null;
            return <FishCardView key={card.id} card={card} imageUrl={imageUrl} />;
          })}
        </ScrollView>
      </View>

      {/* 详情 Tabs */}
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

      {selectedTab === 'INTRO' ? (
        <>
          <KnowledgeSection detail={content} />
          {content.gallery.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>真实照片</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.cardScroll}
                contentContainerStyle={styles.cardScrollContent}
              >
                {content.gallery.map((image) => (
                  <GalleryView
                    key={image.id}
                    title={image.title ?? image.type}
                    imageUrl={fishKnowledgeService.resolveAssetUrl(image.url)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <FishingSection detail={content} />
          {content.similarity.length > 0 ? <SimilaritySection detail={content} /> : null}
        </>
      ) : selectedTab === 'CATCH' ? (
        <CatchSection
          catchCount={catchCount}
          onOpenCatch={() => navigation.navigate('MyCatches')}
        />
      ) : (
        <RankingSection />
      )}
    </ScrollView>
  );
};

const HeroCardPlaceholder: React.FC<{ card: FishKnowledgeCard }> = ({ card }) => (
  <View style={StyleSheet.absoluteFill}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: cardGradientTop }]} />
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: cardGradientBottom, opacity: 0.9, height: '50%', top: '50%' },
      ]}
    />
    <View style={styles.heroPlaceholderBody}>
      <View>
        <Text style={styles.heroPlaceholderType}>{card.cardType}</Text>
        <Text style={styles.heroPlaceholderLabel}>
          {cardLabels[card.cardType] ?? '鱼鉴卡'}
        </Text>
      </View>
      <View>
        <Text style={styles.heroPlaceholderTitle}>
          {card.title.trim().length > 0 ? card.title : '内容待补充'}
        </Text>
        <Text style={styles.heroPlaceholderHint}>暂无真实图片</Text>
      </View>
    </View>
  </View>
);

const FishCardView: React.FC<{ card: FishKnowledgeCard; imageUrl: string | null }> = ({
  card,
  imageUrl,
}) => {
  const structured = card.content;
  let supportingText = '';
  if (card.cardType === 'IDENTIFICATION') {
    supportingText = structured.features
      .slice(0, 2)
      .map((feature) => `${feature.title}：${feature.text}`)
      .join(' · ');
  } else if (card.cardType === 'ECO') {
    supportingText = [structured.waterLayer, structured.behavior]
      .filter((value) => value.trim().length > 0)
      .join(' · ');
  } else if (card.cardType === 'GEAR') {
    supportingText = [structured.rod, structured.hook]
      .filter((value) => value.trim().length > 0)
      .join(' · ');
  } else if (card.cardType === 'SKILL') {
    supportingText = structured.tip;
  } else {
    supportingText =
      structured.description.trim().length > 0 ? structured.description : card.description;
  }

  return (
    <View style={[styles.fishCard, { backgroundColor: cardInk }]}>
      {imageUrl ? (
        <RemoteImage url={imageUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <View style={styles.fishCardBody}>
        <View>
          <Text style={styles.fishCardType}>{card.cardType}</Text>
          <Text style={styles.fishCardLabel}>{cardLabels[card.cardType] ?? '鱼鉴卡'}</Text>
          {structured.tag.trim().length > 0 ? (
            <Text style={styles.fishCardTag}>{structured.tag}</Text>
          ) : null}
          {structured.rarity > 0 || structured.power > 0 || structured.challenge > 0 ? (
            <Text style={styles.fishCardStats}>
              {`稀有 ${structured.rarity}  ·  力量 ${structured.power}  ·  挑战 ${structured.challenge}`}
            </Text>
          ) : null}
        </View>
        <View>
          <Text style={styles.fishCardTitle}>
            {card.title.trim().length > 0 ? card.title : '内容待补充'}
          </Text>
          {supportingText.trim().length > 0 ? (
            <Text style={styles.fishCardSupport} numberOfLines={3}>
              {supportingText}
            </Text>
          ) : null}
          {!imageUrl ? (
            <Text style={styles.fishCardHint}>
              {`暂无真实图片 · ${card.status === 'ACTIVE' ? '可展示' : '待发布'}`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const KnowledgeSection: React.FC<{ detail: FishKnowledgeDetail }> = ({ detail }) => {
  const profile = detail.profile;
  const facts: { label: string; value: string }[] = [];
  if (profile.bodyShape && profile.bodyShape.trim().length > 0) {
    facts.push({ label: '体型', value: profile.bodyShape });
  }
  if (profile.food && profile.food.trim().length > 0) {
    facts.push({ label: '食性', value: profile.food });
  }
  if (profile.season.length > 0) {
    facts.push({ label: '活跃季节', value: profile.season.join('、') });
  }
  if (profile.habitat.length > 0) {
    facts.push({ label: '常见水域', value: profile.habitat.join('、') });
  }
  if (detail.knowledge.ecology.waterLayer.trim().length > 0) {
    facts.push({ label: '活动水层', value: detail.knowledge.ecology.waterLayer });
  }
  const behavior = detail.knowledge.ecology.behavior;
  const factRows: { label: string; value: string }[][] = [];
  for (let i = 0; i < facts.length; i += 2) {
    factRows.push(facts.slice(i, i + 2));
  }

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>结构化知识</Text>
      <View style={styles.sectionBody}>
        {factRows.map((row, index) => (
          <View key={`${row[0].label}-${index}`} style={styles.factRow}>
            {row.map((fact) => (
              <InfoItem key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </View>
        ))}
        {profile.features.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>视觉特征</Text>
            <View style={styles.bulletList}>
              {profile.features.map((feature) => (
                <Text key={feature} style={styles.bulletText}>
                  {`• ${feature}`}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        {behavior.trim().length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>习性</Text>
            <Text style={styles.bodyText}>{behavior}</Text>
          </View>
        ) : null}
        {facts.length === 0 && profile.features.length === 0 && behavior.trim().length === 0 ? (
          <EmptyAsset text="结构化知识待补充" />
        ) : null}
      </View>
    </View>
  );
};

const FishingSection: React.FC<{ detail: FishKnowledgeDetail }> = ({ detail }) => {
  const fishing = detail.fishing;
  const gear = detail.knowledge.gear;
  const skill = detail.knowledge.skill;
  const waterLayer = fishing.waterLayer;
  const bait = gear.bait.length > 0 ? gear.bait : fishing.bait;
  const methods = fishing.method;
  const equipment = [gear.rod, gear.line, gear.hook].filter(
    (value) => value.trim().length > 0,
  );
  const empty =
    (waterLayer === null || waterLayer === undefined) &&
    bait.length === 0 &&
    methods.length === 0 &&
    fishing.summary.trim().length === 0 &&
    equipment.length === 0 &&
    skill.tip.trim().length === 0;

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>怎么钓这条鱼</Text>
      <View style={styles.sectionBody}>
        {waterLayer ? <InfoItem label="水层" value={waterLayer} full /> : null}
        {bait.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>饵料</Text>
            <View style={styles.tagRow}>
              {bait.map((item) => (
                <TagChip key={item} text={item} emphasized />
              ))}
            </View>
          </View>
        ) : null}
        {methods.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>钓法</Text>
            <View style={styles.tagRow}>
              {methods.map((item) => (
                <TagChip key={item} text={item} />
              ))}
            </View>
          </View>
        ) : null}
        {equipment.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>装备建议</Text>
            <View style={styles.bulletListTight}>
              {equipment.map((item) => (
                <Text key={item} style={styles.bulletTextSmall}>
                  {`• ${item}`}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        {fishing.summary.trim().length > 0 ? (
          <Text style={styles.bodyText}>{fishing.summary}</Text>
        ) : null}
        {skill.tip.trim().length > 0 ? (
          <Text style={styles.tipText}>{`提醒：${skill.tip}`}</Text>
        ) : null}
        {empty ? <EmptyAsset text="钓鱼知识待补充" /> : null}
        {detail.videos.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>相关视频</Text>
            <View style={styles.videoList}>
              {detail.videos.map((video) => (
                <VideoRow
                  key={video.id}
                  title={video.title}
                  type={video.type}
                  duration={video.duration}
                  tags={video.tags}
                  coverUrl={fishKnowledgeService.resolveAssetUrl(video.coverUrl)}
                  videoUrl={video.videoUrl}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const SimilaritySection: React.FC<{ detail: FishKnowledgeDetail }> = ({ detail }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>相似鱼辨识</Text>
    <View style={[styles.sectionBody, styles.similarityList]}>
      {detail.similarity.map((similar) => (
        <View key={similar.similarSpeciesId} style={styles.similarityItem}>
          <Text style={styles.similarityName}>{similar.similarSpeciesNameCn}</Text>
          <Text style={styles.similarityDiff}>{similar.difference}</Text>
        </View>
      ))}
    </View>
  </View>
);

const CatchSection: React.FC<{ catchCount: number; onOpenCatch: () => void }> = ({
  catchCount,
  onOpenCatch,
}) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>我的鱼获</Text>
    <View style={styles.sectionBody}>
      {catchCount === 0 ? (
        <EmptyAsset text="还没有鱼获记录" />
      ) : (
        <View style={styles.catchPreviewRow}>
          <View style={styles.catchPreviewIcon}>
            <FishIllustration size={48} bodyColor="rgba(46,139,131,0.6)" />
          </View>
          <View style={styles.catchPreviewBody}>
            <Text style={styles.catchPreviewTitle}>最近鱼获</Text>
            <Text style={styles.catchPreviewMeta}>{`共 ${catchCount} 条 · 照片待查看`}</Text>
            <Text style={styles.catchPreviewMetaSmall}>时间 / 重量 / 长度 / 地点</Text>
          </View>
        </View>
      )}
      <Pressable
        onPress={onOpenCatch}
        style={({ pressed }) => [styles.sectionButton, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="查看我的鱼获"
      >
        <Text style={styles.sectionButtonText}>
          {catchCount > 0 ? `查看我的鱼获 · ${catchCount}` : '记录我的鱼获'}
        </Text>
      </Pressable>
      <Text style={styles.sectionFootnote}>鱼获详情会保留照片、时间、重量、长度和地点。</Text>
    </View>
  </View>
);

const RankingSection: React.FC = () => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>排行榜</Text>
    <View style={styles.sectionBody}>
      <EmptyAsset text="暂无排行榜" />
      <Text style={styles.rankingComing}>敬请期待</Text>
      <View style={styles.rankingButtonDisabled}>
        <Text style={styles.rankingButtonText}>排行榜即将开放</Text>
      </View>
    </View>
  </View>
);

const VideoRow: React.FC<{
  title: string;
  type: string;
  duration: number;
  tags: string[];
  coverUrl: string | null;
  videoUrl: string;
}> = ({ title, type, duration, tags, coverUrl, videoUrl }) => (
  <Pressable
    onPress={() => {
      Linking.openURL(videoUrl).catch(() => undefined);
    }}
    style={({ pressed }) => [styles.videoRow, pressed && { opacity: 0.8 }]}
    accessibilityRole="button"
    accessibilityLabel={`打开视频 ${title}`}
  >
    <View style={styles.videoCover}>
      {coverUrl ? (
        <RemoteImage url={coverUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <Icon name="play" size={22} color={palette.waterTeal} />
    </View>
    <View style={styles.videoBody}>
      <Text style={styles.videoTitle}>{title}</Text>
      <Text style={styles.videoMeta}>
        {`${type} · ${duration}s${tags.length === 0 ? '' : ` · ${tags.join('、')}`}`}
      </Text>
    </View>
    <Text style={styles.videoOpen}>打开</Text>
  </Pressable>
);

const GalleryView: React.FC<{ title: string; imageUrl: string | null }> = ({
  title,
  imageUrl,
}) => (
  <View style={styles.galleryItem}>
    <View style={styles.galleryImageWrap}>
      {imageUrl ? (
        <RemoteImage url={imageUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={styles.galleryEmpty}>暂无图片</Text>
      )}
    </View>
    <Text style={styles.galleryTitle} numberOfLines={1}>
      {title}
    </Text>
  </View>
);

const InfoItem: React.FC<{ label: string; value: string; full?: boolean }> = ({
  label,
  value,
  full = false,
}) => (
  <View style={full ? styles.infoItemFull : styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const EmptyAsset: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.emptyAsset}>
    <Text style={styles.emptyAssetText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  content: {
    paddingBottom: 40,
    gap: 14,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    color: palette.mutedInk,
    fontSize: 14,
  },
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
  retryButtonText: {
    color: '#FFFFFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: '#FFF3E8',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#9A5B16',
    fontSize: 11,
  },
  retryChip: {
    backgroundColor: palette.waterTeal,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryChipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  heroWrap: {
    marginHorizontal: 20,
  },
  heroCard: {
    aspectRatio: 1,
    borderRadius: 28,
    backgroundColor: cardGradientTop,
    overflow: 'hidden',
    shadowColor: palette.waterTeal,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  heroPage: {
    flex: 1,
  },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmptyText: {
    color: cardGold,
    fontSize: 16,
    fontWeight: '600',
  },
  heroDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(138,151,155,0.35)',
  },
  heroDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.waterTeal,
  },
  heroPlaceholderBody: {
    ...StyleSheet.absoluteFillObject,
    padding: 28,
    justifyContent: 'space-between',
  },
  heroPlaceholderType: {
    color: cardGold,
    fontSize: 13,
    fontWeight: '700',
  },
  heroPlaceholderLabel: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '700',
    marginTop: 8,
  },
  heroPlaceholderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  heroPlaceholderHint: {
    color: 'rgba(214,181,109,0.82)',
    fontSize: 13,
    marginTop: 8,
  },
  speciesHeader: {
    marginHorizontal: 20,
    marginVertical: 8,
  },
  speciesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  speciesHeaderText: {
    flex: 1,
  },
  speciesTitle: {
    color: palette.deepInk,
    fontSize: 32,
    fontWeight: '700',
  },
  speciesScientific: {
    color: palette.mutedInk,
    fontSize: 13,
    marginTop: 3,
  },
  bookmarkButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  speciesSummary: {
    color: palette.deepInk,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 18,
  },
  sectionCard: {
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 24,
    padding: 18,
  },
  sectionTitle: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionBody: {
    marginTop: 13,
    gap: 12,
  },
  cardScroll: {
    marginTop: 13,
  },
  cardScrollContent: {
    gap: 10,
    paddingRight: 2,
  },
  fishCard: {
    width: 190,
    height: 238,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fishCardBody: {
    ...StyleSheet.absoluteFillObject,
    padding: 14,
    justifyContent: 'space-between',
  },
  fishCardType: {
    color: cardGold,
    fontSize: 11,
    fontWeight: '700',
  },
  fishCardLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 5,
  },
  fishCardTag: {
    color: cardGold,
    fontSize: 10,
    marginTop: 6,
  },
  fishCardStats: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    marginTop: 5,
  },
  fishCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  fishCardSupport: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  fishCardHint: {
    color: 'rgba(214,181,109,0.82)',
    fontSize: 10,
    marginTop: 8,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: palette.cardWhite,
    borderRadius: 18,
    padding: 5,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tabItemSelected: {
    backgroundColor: palette.deepInk,
  },
  tabItemText: {
    color: palette.mutedInk,
    fontSize: 12,
    fontWeight: '500',
  },
  tabItemTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  factRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoItem: {
    flex: 1,
  },
  infoItemFull: {
    alignSelf: 'stretch',
  },
  infoLabel: {
    color: palette.mutedInk,
    fontSize: 11,
  },
  infoValue: {
    color: palette.deepInk,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  block: {
    // 结构化知识分组容器
  },
  blockLabel: {
    color: palette.mutedInk,
    fontSize: 11,
  },
  bulletList: {
    marginTop: 7,
    gap: 5,
  },
  bulletListTight: {
    marginTop: 7,
    gap: 4,
  },
  bulletText: {
    color: palette.deepInk,
    fontSize: 13,
    lineHeight: 19,
  },
  bulletTextSmall: {
    color: palette.deepInk,
    fontSize: 12,
  },
  bodyText: {
    color: palette.deepInk,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  tipText: {
    color: palette.waterTeal,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 7,
  },
  emptyAsset: {
    backgroundColor: palette.warmBackground,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  emptyAssetText: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  videoList: {
    gap: 8,
  },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.warmBackground,
    borderRadius: 12,
    padding: 8,
  },
  videoCover: {
    width: 58,
    height: 58,
    borderRadius: 9,
    backgroundColor: '#E2E8E6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBody: {
    flex: 1,
    marginLeft: 10,
  },
  videoTitle: {
    color: palette.deepInk,
    fontSize: 13,
    fontWeight: '600',
  },
  videoMeta: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 4,
  },
  videoOpen: {
    color: palette.waterTeal,
    fontSize: 11,
  },
  similarityList: {
    gap: 10,
  },
  similarityItem: {
    backgroundColor: palette.warmBackground,
    borderRadius: 12,
    padding: 12,
  },
  similarityName: {
    color: palette.deepInk,
    fontSize: 14,
    fontWeight: '700',
  },
  similarityDiff: {
    color: palette.mutedInk,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  catchPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.warmBackground,
    borderRadius: 14,
    padding: 10,
  },
  catchPreviewIcon: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catchPreviewBody: {
    marginLeft: 10,
  },
  catchPreviewTitle: {
    color: palette.deepInk,
    fontSize: 13,
    fontWeight: '600',
  },
  catchPreviewMeta: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 4,
  },
  catchPreviewMetaSmall: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 4,
  },
  sectionButton: {
    alignSelf: 'stretch',
    backgroundColor: palette.waterTeal,
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  sectionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionFootnote: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 10,
  },
  rankingComing: {
    color: palette.mutedInk,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  rankingButtonDisabled: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
    opacity: 0.6,
  },
  rankingButtonText: {
    color: palette.mutedInk,
  },
  galleryItem: {
    width: 170,
  },
  galleryImageWrap: {
    height: 130,
    borderRadius: 14,
    backgroundColor: palette.softWater,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryEmpty: {
    color: palette.mutedInk,
    fontSize: 11,
  },
  galleryTitle: {
    color: palette.deepInk,
    fontSize: 12,
    marginTop: 6,
  },
});
