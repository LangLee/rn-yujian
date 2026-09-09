import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  fishKnowledgeService,
  localGuideItems,
  mergeGuideItems,
} from '../services/fishKnowledgeService';
import { RemoteImage } from '../components/RemoteImage';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import { FishGuideItem } from '../types/models';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/ui/EmptyState';
import { ScreenHeader, HeaderIconButton } from '../components';

type FishGuideHomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Guide'>;

const GOLD = '#C9A96A';

/**
 * 鱼鉴首页（设计文档 9.2 + 高保真参考稿）：
 * 顶栏（返回 / 渔见 / 搜索）→ hero（鱼鉴 + 认识你遇见的每一种鱼 + N 种鱼已点亮金进度）→
 * 已点亮 / 未点亮 分组两列卡片。未点亮灰度显示但知识始终可点击，不做「锁住知识」。
 */
export const FishGuideHomeScreen: React.FC = () => {
  const navigation = useNavigation<FishGuideHomeScreenNavigationProp>();
  const { profile } = useThemeSafe();
  const insets = useSafeAreaInsets();

  const [species, setSpecies] = useState<FishGuideItem[]>(localGuideItems());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

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

  const lit = useMemo(() => species.filter((fish) => fish.discovered), [species]);
  const unlit = useMemo(() => species.filter((fish) => !fish.discovered), [species]);

  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return species.filter(
      (fish) =>
        fish.nameCn.toLowerCase().includes(keyword) ||
        (fish.aliases ?? []).some((alias) => alias.toLowerCase().includes(keyword)),
    );
  }, [species, query]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const progress = species.length === 0 ? 0 : Math.min(1, lit.length / species.length);

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      {/* 顶栏：返回 / 渔见 / 搜索 */}
      <ScreenHeader
        title="渔见"
        onBack={() => navigation.goBack()}
        right={
          <HeaderIconButton
            name={searchOpen ? 'close' : 'search-outline'}
            color={textPrimary}
            onPress={() => {
              setSearchOpen((value) => !value);
              if (searchOpen) {
                setQuery('');
              }
            }}
          />
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero：鱼鉴 + 点亮进度 */}
        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroTitle, { color: textPrimary }]}>鱼鉴</Text>
            <Text style={[styles.heroSub, { color: textSecondary }]}>认识你遇见的每一种鱼</Text>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.litRow}>
              <Text style={[styles.litCount, { color: GOLD }]}>{lit.length}</Text>
              <Text style={[styles.litSuffix, { color: textSecondary }]}>种鱼已点亮</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.5)' }]}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: GOLD }]} />
            </View>
          </View>
        </View>

        {error !== null ? (
          <PressableScale onPress={() => setRetryToken((value) => value + 1)} scaleTo={0.98}>
            <View style={[styles.errorBanner, { backgroundColor: profile.surface.glassStrong }]}>
              <Text style={[styles.errorText, { color: textSecondary }]} numberOfLines={2}>
                鱼鉴暂时没有加载出来，你的记录没有受影响
              </Text>
              <Text style={[styles.retryText, { color: profile.surface.accent }]}>重新尝试</Text>
            </View>
          </PressableScale>
        ) : null}

        {searchOpen ? (
          <View style={[styles.searchWrap, { backgroundColor: profile.surface.glassStrong }]}>
            <Icon name="search-outline" size={17} color={textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索鱼名或别名"
              placeholderTextColor={textSecondary}
              autoFocus
            />
          </View>
        ) : null}

        {loading && species.length === 0 ? (
          <Text style={[styles.stateText, { color: textSecondary }]}>正在打开鱼鉴…</Text>
        ) : searching ? (
          searchResults.length === 0 ? (
            <EmptyState
              title="没有找到这个鱼种"
              description="可以试试其他名称，或清空搜索浏览全部鱼种。"
              actionLabel="清空搜索"
              onAction={() => setQuery('')}
            />
          ) : (
            <SpeciesSection title="搜索结果" items={searchResults} textPrimary={textPrimary} textSecondary={textSecondary} onOpen={(key) => navigation.navigate('Species', { key })} />
          )
        ) : (
          <>
            <SpeciesSection title="已点亮" items={lit} textPrimary={textPrimary} textSecondary={textSecondary} onOpen={(key) => navigation.navigate('Species', { key })} />
            <SpeciesSection title="未点亮" items={unlit} textPrimary={textPrimary} textSecondary={textSecondary} onOpen={(key) => navigation.navigate('Species', { key })} />
          </>
        )}
      </ScrollView>
    </View>
  );
};

import { useTheme } from '../contexts/ThemeContext';
const useThemeSafe = useTheme;

const SpeciesSection: React.FC<{
  title: string;
  items: FishGuideItem[];
  textPrimary: string;
  textSecondary: string;
  onOpen: (key: string) => void;
}> = ({ title, items, textPrimary, textSecondary, onOpen }) => {
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: textPrimary }]}>{title}</Text>
      <View style={styles.grid}>
        {chunk(items, 2).map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((fish) => (
              <SpeciesCard
                key={fish.id}
                fish={fish}
                textSecondary={textSecondary}
                onOpen={() => onOpen(fish.id)}
              />
            ))}
            {row.length < 2 ? <View style={styles.gridFiller} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
};

const SpeciesCard: React.FC<{
  fish: FishGuideItem;
  textSecondary: string;
  onOpen: () => void;
}> = ({ fish, textSecondary, onOpen }) => {
  const imageUrl = fishKnowledgeService.resolveAssetUrl(fish.coverImage);
  return (
    <PressableScale onPress={onOpen} scaleTo={0.98} style={styles.cardHit}>
      <View style={[styles.card, { borderColor: 'rgba(255,255,255,0.55)' }]}>
        <View style={[styles.imageWrap, !fish.discovered && styles.imageDim]}>
          {imageUrl ? (
            <RemoteImage url={imageUrl} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Text style={styles.fallbackText}>{fish.nameCn.slice(0, 1)}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {fish.nameCn}
          </Text>
          <Text style={[styles.cardMeta, { color: textSecondary }]} numberOfLines={1}>
            {fish.discovered ? `${fish.catches ?? 0} 次记录` : '还没有我的记录'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  } as ViewStyle,
  heroLeft: {
    flexShrink: 1,
  } as ViewStyle,
  heroTitle: {
    fontFamily: font.serif,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 10,
  } as TextStyle,
  heroSub: {
    fontSize: 14,
    marginTop: 10,
  } as TextStyle,
  heroRight: {
    width: 150,
    alignItems: 'flex-end',
  } as ViewStyle,
  litRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  } as ViewStyle,
  litCount: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  } as TextStyle,
  litSuffix: {
    fontSize: 12,
    lineHeight: 20,
  } as TextStyle,
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  } as ViewStyle,
  progressFill: {
    height: '100%',
    borderRadius: 2,
  } as ViewStyle,
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    marginTop: spacing.lg,
  } as ViewStyle,
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  } as TextStyle,
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  } as TextStyle,
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    height: 42,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  } as TextStyle,
  stateText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  } as TextStyle,
  section: {
    marginTop: spacing.xl,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: font.serif,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  } as TextStyle,
  grid: {
    gap: spacing.md,
  } as ViewStyle,
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  } as ViewStyle,
  gridFiller: {
    flex: 1,
  } as ViewStyle,
  cardHit: {
    flex: 1,
  } as ViewStyle,
  card: {
    borderRadius: radius.m + 2,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.38)',
  } as ViewStyle,
  imageWrap: {
    width: '100%',
    height: 86,
    backgroundColor: 'rgba(220,238,235,0.4)',
  } as ViewStyle,
  imageDim: {
    opacity: 0.55,
  } as ViewStyle,
  image: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  fallbackText: {
    fontFamily: font.serif,
    fontSize: 26,
    color: palette.waterTeal,
  } as TextStyle,
  cardBody: {
    padding: spacing.md,
    gap: 3,
  } as ViewStyle,
  cardName: {
    fontFamily: font.serif,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#1F4A56',
  } as TextStyle,
  cardMeta: {
    fontSize: 11,
    letterSpacing: 0.5,
  } as TextStyle,
});
