import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppIcon } from '../components/icons/AppIcon';
import {
  fishKnowledgeService,
  localGuideItems,
  mergeGuideItems,
} from '../services/fishKnowledgeService';
import { RemoteImage, prefetchRemoteImages } from '../components/RemoteImage';
import { font, fs, spacing } from '../constants/tokens';
import { coreColors, coreGlass, coreRadius } from '../constants/coreUi';
import { FishGuideItem } from '../types/models';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { MorningLakeScene } from '../components/coreui';
import { PressableScale } from '../components/ui/PressableScale';
import { CardCarousel, CardCarouselHandle } from '../components/ui/CardCarousel';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';

type FishGuideHomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Guide'>;

/** Gold 规则：点亮进度属于 Meaningful Record，允许金色（Fish Guide Home §10） */
const GOLD = coreColors.morningGold;

/** Carousel Discover Hint 本地一次性标记（动效合同 3.3） */
const HINT_SEEN_KEY = 'yujian.fishGuide.carouselHintSeen';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
/** V2 冻结稿主卡 ~72% 屏宽，邻卡每侧露出边缘 */
const CARD_WIDTH = Math.round(SCREEN_W * 0.72);
/** V2 卡片竖版比例 ≈ 0.70（w:h，与封面素材 1168×1600 ≈ 0.73 匹配）；小屏限高防溢出 */
const CARD_HEIGHT = Math.min(
  Math.round(CARD_WIDTH / 0.7),
  Math.round(SCREEN_H * 0.52),
);
const CARD_GAP = 14;
/** 动效合同 2.2：邻卡 scale 0.94；V2 雾面白更亮，透明度 0.58 → 0.72 */
const SIDE_SCALE = 0.94;
const SIDE_OPACITY = 0.72;

/**
 * 鱼鉴首页（Fish Guide V2 · 01 鱼鉴首页）：
 * 个人自然收藏浏览器 —— ‹ 返回 + 居中「鱼鉴」深蓝衬线标题 + 右侧搜索入口 →
 * 右对齐「已点亮 N / T 种」金色衬线大数字进度 → 竖版收藏卡轮播
 * （满卡封面 + 左上鱼名金线版式 + 底部白字状态行直接叠图）→ 页码紧跟卡下居中。
 * LIT / UNLIT 同亮度可浏览、可点击进入详情；点亮状态由卡底状态行表达。
 * 背景：同一清晨湖畔世界 BG_DATA（卡片保持主视觉）。
 */
export const FishGuideHomeScreen: React.FC = () => {
  const navigation = useNavigation<FishGuideHomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useTheme();
  const { session } = useAuth();
  const { catches, loading: archiveLoading } = useCatchArchive();

  const [species, setSpecies] = useState<FishGuideItem[]>(localGuideItems());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const carouselRef = useRef<CardCarouselHandle>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      setError(null);
      try {
        const remote = await fishKnowledgeService.listSpecies();
        if (mounted) {
          setSpecies(mergeGuideItems(remote));
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : '鱼鉴数据暂时没有加载出来');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [retryToken]);

  /**
   * 点亮状态推导（Fish Species States §2.3）：
   * 已保存 FishRecord（最终鱼种映射到目录鱼种）数量是唯一事实来源；
   * 识别尝试 / 未保存结果 / 照片不计入。未登录 / 档案未就绪时沿用本地
   * 演示标记（§6.1：savedCount 未知前不在 LIT / UNLIT 之间闪烁）。
   */
  const items = useMemo(() => {
    if (!session || archiveLoading) {
      return species;
    }
    const counts = new Map<string, number>();
    for (const item of catches) {
      if (!item.speciesId) continue;
      counts.set(item.speciesId, (counts.get(item.speciesId) ?? 0) + 1);
    }
    return species.map((fish) => {
      const real = counts.get(fish.id) ?? 0;
      return { ...fish, discovered: real > 0, catches: real };
    });
  }, [species, catches, session, archiveLoading]);

  const litCount = useMemo(() => items.filter((fish) => fish.discovered).length, [items]);
  const totalCount = items.length;
  const progress = totalCount === 0 ? 0 : Math.min(1, litCount / totalCount);

  /* 封面预取：插画单张 2MB+，提前拉当前 ±1 张入缓存，滑动轮播即时可见 */
  useEffect(() => {
    const around = [activeIndex - 1, activeIndex, activeIndex + 1];
    prefetchRemoteImages(
      around
        .filter((index) => index >= 0 && index < items.length)
        .map((index) => fishKnowledgeService.resolveAssetUrl(items[index].coverImage)),
    );
  }, [activeIndex, items]);

  /* ── 首次进入 Carousel Discover Hint（动效合同 §3）──────────────────
     600ms 延迟后向逻辑下一侧轻推 14dp（180ms 出 / 260ms 回），
     不改变选中鱼种；本地一次性；Reduce Motion / 已遇见 / 用户先触摸则取消。 */
  const hintX = useRef(new Animated.Value(0)).current;
  const hintDoneRef = useRef(false);
  const finishHint = () => {
    if (hintDoneRef.current) return;
    hintDoneRef.current = true;
    hintX.stopAnimation();
    hintX.setValue(0);
    AsyncStorage.setItem(HINT_SEEN_KEY, '1').catch(() => undefined);
  };

  useEffect(() => {
    if (loading || totalCount < 2 || hintDoneRef.current) return;
    if (reduceMotion) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(HINT_SEEN_KEY);
        if (seen !== null || cancelled) return;
      } catch {
        return;
      }
      timer = setTimeout(() => {
        if (cancelled || hintDoneRef.current) return;
        Animated.sequence([
          Animated.timing(hintX, {
            toValue: -14,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(hintX, {
            toValue: 0,
            duration: 260,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) finishHint();
        });
      }, 600);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      hintX.stopAnimation();
      hintX.setValue(0);
    };
  }, [loading, totalCount, reduceMotion, hintX]);

  const openSpecies = (key: string) => {
    finishHint();
    navigation.navigate('Species', { key });
  };

  const metaTextPrimary = coreColors.deepLakeBlue;
  const metaTextSecondary = coreColors.lakeBlue;

  return (
    <View style={styles.screen}>
      {/* BG_DATA 冻结档：同一清晨湖畔母版，存在感 48%（mist 0.30 + 降饱和/对比），卡片保持主视觉 */}
      <MorningLakeScene level="data" />
      {/* 头部（V2 冻结稿）：‹ 返回 + 居中「鱼鉴」深蓝衬线大标题 + 右侧搜索图标 */}
      <View style={[styles.titleBlock, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="返回"
        >
          <AppIcon name="back" size={22} color={coreColors.deepLakeBlue} />
        </Pressable>
        {/* 居中标题（绝对定位到整行中心，不受两侧按钮影响） */}
        <View style={styles.titleCenter} pointerEvents="none">
          <Text style={styles.pageTitle}>鱼鉴</Text>
        </View>
        {/* V2 搜索入口：视觉占位（搜索页未上线前不提供可点击语义） */}
        <View style={styles.backHit} pointerEvents="none">
          <AppIcon name="search" size={22} color={coreColors.deepLakeBlue} />
        </View>
      </View>
      <View style={styles.progressCluster}>
        <Text style={styles.progressText}>
          已点亮 <Text style={styles.progressNumbers}>{litCount}</Text>
          <Text style={styles.progressSlash}> / {totalCount}</Text> 种
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
          />
        </View>
      </View>

      {error !== null ? (
        <View style={styles.errorRow}>
          <PressableScale onPress={() => setRetryToken((value) => value + 1)} scaleTo={0.98}>
            <View style={styles.errorBanner}>
              <Text style={styles.errorText} numberOfLines={2}>
                鱼鉴暂时没有加载出来，你的记录没有受影响
              </Text>
              <Text style={styles.retryText}>重试</Text>
            </View>
          </PressableScale>
        </View>
      ) : null}

      {/* 居中 FishGuideCard 轮播：邻卡可浏览；任何触摸立即结束 Discover Hint */}
      <Animated.View
        style={[styles.carouselWrap, { transform: [{ translateX: hintX }] }]}
        onTouchStart={finishHint}
      >
        {totalCount > 0 ? (
          <CardCarousel
            ref={carouselRef}
            count={totalCount}
            cardWidth={CARD_WIDTH}
            cardHeight={CARD_HEIGHT}
            gap={CARD_GAP}
            sideScale={SIDE_SCALE}
            sideDrop={0}
            sideOpacity={SIDE_OPACITY}
            sidePush={0}
            onChange={setActiveIndex}
            renderItem={({ index }) => (
              <SpeciesCarouselCard
                fish={items[index]}
                isActive={index === activeIndex}
                onOpen={() => openSpecies(items[index].id)}
                onCenterOnly={() => carouselRef.current?.scrollToIndex(index)}
              />
            )}
          />
        ) : (
          <View style={styles.skeletonCard} />
        )}
      </Animated.View>

      {/* V2 卡下页码：紧跟居中卡片下方（衬线「当前第几种 / 总数」） */}
      <View style={styles.metaBlock} accessibilityLiveRegion="polite">
        {totalCount > 0 ? (
          <Text style={styles.indicatorBase}>
            <Text style={[styles.indicatorCurrent, { color: metaTextPrimary }]}>
              {Math.min(activeIndex + 1, totalCount)}
            </Text>
            <Text style={[styles.indicatorTotal, { color: metaTextSecondary }]}>
              {' / '}
              {totalCount}
            </Text>
          </Text>
        ) : (
          <Text style={[styles.metaCount, { color: metaTextSecondary }]}>
            {loading ? '正在打开鱼鉴…' : ''}
          </Text>
        )}
      </View>
    </View>
  );
};

/* ─── FishGuideCard（V2 收藏卡）：满卡封面 + 卡上版式 ──────────────────────
   顶部：超大衬线鱼名 + 金色短线 + 分类副标题（深蓝字 + 柔白光晕）；
   中部：封面留白展示；底部：深色渐变遮罩 + 左对齐白字点亮状态。
   LIT / UNLIT 同一亮度的浏览卡面，点亮状态由卡底状态行表达（V2 稿）。 */

const SpeciesCarouselCard: React.FC<{
  fish: FishGuideItem;
  isActive: boolean;
  onOpen: () => void;
  onCenterOnly: () => void;
}> = ({ fish, isActive, onOpen, onCenterOnly }) => {
  const lit = Boolean(fish.discovered);
  const imageUrl = fishKnowledgeService.resolveAssetUrl(fish.coverImage);
  const category = fish.category.trim();

  return (
    <PressableScale
      onPress={isActive ? onOpen : onCenterOnly}
      scaleTo={0.985}
      style={styles.cardHit}
      accessibilityRole="button"
      accessibilityLabel={`${fish.nameCn}，${lit ? `已点亮，${fish.catches ?? 0} 次记录` : '未点亮，还没有我的记录'}`}
    >
      <View style={styles.card}>
        {/* 满卡封面背景（V2：图即卡底；无封面用湖雾渐变+水墨鱼满卡默认面） */}
        <View style={styles.imageWrap}>
          {imageUrl ? (
            <RemoteImage url={imageUrl} style={styles.image} resizeMode="cover" />
          ) : (
            <DefaultCoverArt />
          )}
        </View>

        {/* 顶部版式：鱼名 + 金线 + 分类（叠图、不拦截触摸） */}
        <View style={styles.cardHead} pointerEvents="none">
          <Text style={styles.cardName}>{fish.nameCn}</Text>
          <View style={styles.nameRule} />
          {category.length > 0 ? (
            <Text style={styles.cardCategory} numberOfLines={1}>
              {category}
            </Text>
          ) : null}
        </View>

        {/* 底部状态：白字直接叠在封面图上（深色文字阴影护读，不加底衬） */}
        <View style={styles.cardBottom} pointerEvents="none">
          <Text style={styles.statusTitle}>{lit ? '已点亮' : '尚未点亮'}</Text>
          <Text style={styles.statusSub}>
            {lit ? `${fish.catches ?? 0} 次记录` : '还没有我的记录'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
};

/** 无封面默认卡面：湖雾渐变满卡打底 + 水墨鱼插画主视觉，
    与照片卡同为「图片即背景」的满版卡（插画透明底，不可 cover 裁切） */
const DefaultCoverArt: React.FC = () => (
  <View style={styles.defaultCover}>
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="fg-default-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="rgba(247,250,251,0.96)" />
          <Stop offset="1" stopColor="rgba(234,243,241,0.96)" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#fg-default-bg)" />
    </Svg>
    <Image source={DEFAULT_FISH_COVER} style={styles.defaultCoverFish} resizeMode="contain" />
  </View>
);

/** 无封面鱼种的默认主视觉：鱼鉴水墨鱼插画（1670×942 透明底） */
const DEFAULT_FISH_COVER = require('../assets/fish.png');

/** 默认插画展示尺寸：卡宽 64% 按 1670×942 原比例换算成显式 dp——
    百分比宽 + aspectRatio 在部分 Android 布局下解析失败会回退原始像素尺寸（巨大且被裁切） */
const DEFAULT_FISH_W = Math.round(CARD_WIDTH * 0.64);
const DEFAULT_FISH_H = Math.round((DEFAULT_FISH_W * 942) / 1670);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  /* 头部（冻结稿像素实测：‹ 返回 + 「鱼鉴」深蓝衬线 28sp 精确居中） */
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
  } as ViewStyle,
  backHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  titleCenter: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  pageTitle: {
    fontFamily: font.serif,
    fontSize: fs(28),
    lineHeight: fs(36),
    fontWeight: '600',
    letterSpacing: 3,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  /* 进度（V2：右对齐 + 大号金色衬线数字 + 加宽胶囊条） */
  progressCluster: {
    alignItems: 'flex-end',
    marginTop: 10,
    marginHorizontal: spacing.page,
  } as ViewStyle,
  progressText: {
    fontSize: fs(14),
    letterSpacing: 1,
    color: coreColors.deepLakeBlue,
    textAlign: 'right',
  } as TextStyle,
  progressNumbers: {
    fontFamily: font.serif,
    fontSize: fs(32),
    fontWeight: '700',
    color: GOLD,
  } as TextStyle,
  progressSlash: {
    color: coreColors.lakeBlue,
  } as TextStyle,
  progressTrack: {
    width: '42%',
    minWidth: 148,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(11,45,75,0.14)',
    marginTop: 6,
    overflow: 'hidden',
  } as ViewStyle,
  progressFill: {
    height: '100%',
    borderRadius: 3.5,
    backgroundColor: GOLD,
  } as ViewStyle,

  /* 轮播（高度随卡片自适应，页码紧跟卡下） */
  carouselWrap: {
    marginTop: 22,
  } as ViewStyle,
  skeletonCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
    borderRadius: coreRadius.xl,
    backgroundColor: coreGlass.B.bg,
    borderWidth: 1,
    borderColor: coreGlass.B.border,
  } as ViewStyle,
  cardHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: coreRadius.xl,
    borderWidth: 1,
    borderColor: coreGlass.A.border,
    backgroundColor: coreGlass.A.bg,
    shadowColor: coreGlass.A.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: 'hidden',
  } as ViewStyle,
  imageWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.32)',
  } as ViewStyle,
  image: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  /* 无封面默认卡面：满卡湖雾渐变 + 居中水墨鱼（显式 dp 尺寸，原比例完整展示） */
  defaultCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  } as ViewStyle,
  defaultCoverFish: {
    width: DEFAULT_FISH_W,
    height: DEFAULT_FISH_H,
  } as ImageStyle,
  /* 顶部版式（V2：左上超大衬线鱼名 + 金色短线 + 分类副标题） */
  cardHead: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 20,
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  } as ViewStyle,
  cardName: {
    fontFamily: font.serif,
    fontSize: fs(44),
    fontWeight: '700',
    letterSpacing: 4,
    color: coreColors.deepLakeBlue,
    textShadowColor: 'rgba(255,255,255,0.55)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  nameRule: {
    width: 44,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: GOLD,
    marginTop: 4,
  } as ViewStyle,
  cardCategory: {
    fontSize: fs(14),
    letterSpacing: 3,
    color: coreColors.lakeBlue,
    marginTop: 7,
    textShadowColor: 'rgba(255,255,255,0.5)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  /* 底部状态（白字直接叠图，深色文字阴影护读） */
  cardBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'flex-start',
    gap: 2,
  } as ViewStyle,
  statusTitle: {
    fontSize: fs(16),
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8,25,38,0.6)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  statusSub: {
    fontSize: fs(12),
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(8,25,38,0.6)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,

  /* V2 卡下页码：居中衬线「当前第几种 / 总数」 */
  metaBlock: {
    alignItems: 'center',
    marginTop: 14,
  } as ViewStyle,
  indicatorBase: {
    textAlign: 'center',
  } as TextStyle,
  indicatorCurrent: {
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '600',
    letterSpacing: 1,
  } as TextStyle,
  indicatorTotal: {
    fontSize: fs(12),
    lineHeight: fs(20),
    letterSpacing: 1,
  } as TextStyle,
  metaCount: {
    fontSize: fs(13),
    letterSpacing: 1,
  } as TextStyle,

  /* 区域级错误（最小化隔离，不建页面级 CTA；置于知识区域上方） */
  errorRow: {
    marginTop: 12,
    marginHorizontal: spacing.page,
  } as ViewStyle,
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: coreRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: coreGlass.A.bg,
    borderColor: coreGlass.A.border,
    borderWidth: 1,
  } as ViewStyle,
  errorText: {
    flex: 1,
    fontSize: fs(12),
    lineHeight: 17,
    color: coreColors.lakeBlue,
  } as TextStyle,
  retryText: {
    fontSize: fs(13),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
});
