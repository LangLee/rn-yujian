import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList, SpeciesPickerRouteProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { FishGuideItem } from '../types/models';
import { fishKnowledgeService, localGuideItems, mergeGuideItems } from '../services/fishKnowledgeService';
import { catchMemoryService } from '../services/catchMemoryService';
import { palette } from '../constants/colors';
import { fs, radius, spacing, typeScale } from '../constants/tokens';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { RemoteImage } from '../components/RemoteImage';
import { GlassCard } from '../components/ui/GlassCard';
import { PressableScale } from '../components/ui/PressableScale';
import { FishGlyph } from '../components/ui/FishGlyph';
import { ScreenHeader, HeaderIconButton } from '../components';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type SpeciesPickerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SpeciesPicker'>;

/**
 * 鱼种搜索 / 选择器（设计文档 11）：
 * 纠错场景追求快速选中 —— 结果行只保留 鱼图 + 中文鱼名 + 必要别名 + Chevron；
 * 拉丁学名、生态标签等知识信息不进入纠错选择器。
 * 最近选择 + 常见鱼种帮助快速回填。
 */
export const SpeciesPickerScreen: React.FC = () => {
  const navigation = useNavigation<SpeciesPickerScreenNavigationProp>();
  const route = useRoute<SpeciesPickerRouteProp>();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [waterFilter, setWaterFilter] = useState('全部');
  const [remote, setRemote] = useState<FishGuideItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<{ key: string; name: string }[]>([]);

  // 页面卸载时收口未完成的选择请求（如 Android 返回键直接退出）
  useEffect(
    () => () => {
      speciesPickerHub.complete(null);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setRecent(await catchMemoryService.loadRecentSpecies());
      try {
        const items = await fishKnowledgeService.listSpecies();
        if (mounted) {
          setRemote(items);
        }
      } catch {
        // 离线时使用本地鱼种
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const all: FishGuideItem[] = useMemo(
    () => (remote ? mergeGuideItems(remote) : localGuideItems()),
    [remote],
  );

  // 最近选择只有 key/name，封面从鱼鉴列表里补齐
  const coverByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of all) {
      const url = fishKnowledgeService.resolveAssetUrl(item.coverImage);
      if (url) {
        map.set(item.id, url);
      }
    }
    return map;
  }, [all]);

  const results = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }
    return all.filter(
      (item) =>
        item.nameCn.includes(keyword) ||
        (item.aliases ?? []).some((alias) => alias.includes(keyword)) ||
        item.id.includes(keyword.toLowerCase()),
    );
  }, [all, query]);

  const commonSpecies = useMemo(
    () => all.filter((item) => item.discovered).slice(0, 6),
    [all],
  );

  // 水域快捷过滤：取 category 首段（如「淡水鱼 · 鲤科」→「淡水鱼」），
  // 已知水域随数据生成，末尾固定补「其他」收纳未分类鱼种
  const waterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of all) {
      const water = item.category.split('·')[0].trim();
      if (water) {
        set.add(water);
      }
    }
    return ['全部', ...Array.from(set), '其他'];
  }, [all]);

  const filteredAll = useMemo(() => {
    if (waterFilter === '全部') {
      return all;
    }
    if (waterFilter === '其他') {
      return all.filter((item) => !item.category.split('·')[0].trim());
    }
    return all.filter((item) => item.category.split('·')[0].trim() === waterFilter);
  }, [all, waterFilter]);

  const complete = (key: string, name: string) => {
    haptics.selection();
    void catchMemoryService.rememberSpecies(key, name);
    speciesPickerHub.complete({ key, name });
    navigation.goBack();
  };

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const title = route.params?.title ?? '选择鱼种';
  const searching = query.trim().length > 0;
  const showingAll = browseAll && !searching;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  /** 顶栏返回 / Android 返回键共用的逐级返回：先收搜索，再退回选择首页，最后退出选择器 */
  const handleBack = useCallback(() => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    if (browseAll) {
      setBrowseAll(false);
      return;
    }
    speciesPickerHub.complete(null);
    navigation.goBack();
  }, [searchOpen, browseAll, navigation]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (searchOpen || browseAll) {
        handleBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [searchOpen, browseAll, handleBack]);

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader
        title={browseAll ? '全部鱼种' : title}
        onBack={handleBack}
        right={
          <HeaderIconButton
            name={searchOpen ? 'close' : 'search-outline'}
            color={textPrimary}
            onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          />
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 搜索栏平时收起，点右上角图标后在标题栏下方展开 */}
        {searchOpen ? (
          <View style={[styles.searchWrap, { backgroundColor: profile.surface.glassStrong }]}>
            <Icon name="search-outline" size={17} color={textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索鱼种名称或别名"
              placeholderTextColor={textSecondary}
              autoFocus
              returnKeyType="search"
            />
            {searching ? (
              <PressableScale onPress={() => setQuery('')} scaleTo={0.9}>
                <Icon name="close-circle" size={17} color={textSecondary} />
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        {/* 浏览全部时的水域快捷过滤胶囊 */}
        {showingAll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
            contentContainerStyle={styles.filterBarContent}
          >
            {waterOptions.map((option) => {
              const active = waterFilter === option;
              return (
                <PressableScale
                  key={option}
                  onPress={() => setWaterFilter(option)}
                  scaleTo={0.94}
                >
                  <View
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? '#0B2D4B' : profile.surface.glassStrong,
                        borderColor: active ? '#0B2D4B' : 'rgba(255,255,255,0.5)',
                      },
                    ]}
                  >
                    <Text style={[styles.filterPillText, { color: active ? '#FFFFFF' : textSecondary }]}>
                      {option}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        ) : null}

        {loading && all.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={profile.surface.accent} />
          </View>
        ) : searching ? (
          results.length > 0 ? (
            <View style={styles.listGap}>
              {results.map((item) => (
                <SpeciesRow
                  key={item.id}
                  item={item}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  onPress={() => complete(item.id, item.nameCn)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noResult}>
              <Text style={[styles.noResultTitle, { color: textPrimary }]}>没有找到这个鱼种</Text>
              <Text style={[styles.noResultText, { color: textSecondary }]}>
                可以试试其他名称，或清空搜索浏览全部鱼种。
              </Text>
              <PressableScale
                onPress={() => {
                  setQuery('');
                  setBrowseAll(true);
                }}
                scaleTo={0.97}
                style={styles.browseHit}
              >
                <Text style={[styles.browseText, { color: profile.surface.accent }]}>
                  浏览全部鱼种
                </Text>
              </PressableScale>
            </View>
          )
        ) : showingAll ? (
          <View style={styles.listGap}>
            {filteredAll.map((item) => (
              <SpeciesRow
                key={item.id}
                item={item}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                onPress={() => complete(item.id, item.nameCn)}
              />
            ))}
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <>
                <SectionLabel text="最近选择" color={textSecondary} />
                <View style={styles.recentRow}>
                  {recent.slice(0, 4).map((item) => (
                    <PressableScale
                      key={item.key}
                      onPress={() => complete(item.key, item.name)}
                      scaleTo={0.94}
                      style={styles.recentCardHit}
                    >
                      <GlassCard noPadding style={styles.recentCard}>
                        <SpeciesThumb url={coverByKey.get(item.key)} size={46} />
                        <Text style={[styles.recentName, { color: textPrimary }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </GlassCard>
                    </PressableScale>
                  ))}
                  {/* 不足 4 张时用空位补齐，卡片固定 1/4 宽不拉伸 */}
                  {Array.from({ length: Math.max(0, 4 - Math.min(recent.length, 4)) }).map(
                    (_, index) => (
                      <View key={`recent-filler-${index}`} style={styles.recentFiller} />
                    ),
                  )}
                </View>
              </>
            ) : null}
            <SectionLabel text="常见鱼种" color={textSecondary} />
            <View style={styles.listGap}>
              {commonSpecies.map((item) => (
                <SpeciesRow
                  key={item.id}
                  item={item}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  onPress={() => complete(item.id, item.nameCn)}
                />
              ))}
            </View>
            <PressableScale
              onPress={() => setBrowseAll(true)}
              scaleTo={0.97}
              style={styles.browseHit}
            >
              <Text style={[styles.browseText, { color: profile.surface.accent }]}>
                查看全部 {all.length} 种鱼
              </Text>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const SectionLabel: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <Text style={[styles.sectionLabel, { color }]}>{text}</Text>
);

/** 鱼种缩略图：鱼鉴封面透明展示（无底色盒子），没有封面时退回鱼形图标 */
const SpeciesThumb: React.FC<{ url?: string; size: number }> = ({ url, size }) => {
  const thumbStyle = { width: size, height: Math.round(size * 0.75) };
  if (url) {
    return <RemoteImage url={url} style={thumbStyle} resizeMode="contain" />;
  }
  return (
    <View style={[thumbStyle, styles.speciesImageFallback]}>
      <FishGlyph size={Math.round(size * 0.42)} color={palette.waterTeal} />
    </View>
  );
};

const SpeciesRow: React.FC<{
  item: FishGuideItem;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}> = ({ item, textPrimary, textSecondary, onPress }) => {
  const imageUrl = fishKnowledgeService.resolveAssetUrl(item.coverImage);
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={styles.rowHit}>
      <GlassCard style={styles.speciesRow}>
        {imageUrl ? (
          <RemoteImage url={imageUrl} style={styles.speciesImage} resizeMode="contain" />
        ) : (
          <View style={[styles.speciesImage, styles.speciesImageFallback]}>
            <FishGlyph size={20} color={palette.waterTeal} />
          </View>
        )}
        <View style={styles.speciesBody}>
          <Text style={[styles.speciesName, { color: textPrimary }]}>{item.nameCn}</Text>
          {(item.aliases ?? []).length > 0 ? (
            <Text style={[styles.speciesAliases, { color: textSecondary }]} numberOfLines={1}>
              {(item.aliases ?? []).slice(0, 2).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={16} color={textSecondary} />
      </GlassCard>
    </PressableScale>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: fs(typeScale.body),
    paddingVertical: 0,
  } as TextStyle,
  filterBar: {
    flexGrow: 0,
    marginVertical: spacing.md,
  } as ViewStyle,
  filterBarContent: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  } as ViewStyle,
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  } as ViewStyle,
  filterPillText: {
    fontSize: fs(typeScale.meta),
    fontWeight: '600',
    letterSpacing: 1,
  } as TextStyle,
  loadingWrap: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  } as ViewStyle,
  listGap: {
    gap: spacing.md,
  } as ViewStyle,
  sectionLabel: {
    fontSize: fs(typeScale.meta),
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  } as TextStyle,
  rowHit: {
    borderRadius: radius.m,
  } as ViewStyle,
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  } as ViewStyle,
  speciesImage: {
    width: 56,
    height: 40,
  } as ViewStyle,
  speciesImageFallback: {
    borderRadius: radius.s,
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  speciesBody: {
    flex: 1,
  } as ViewStyle,
  speciesName: {
    fontSize: fs(typeScale.body),
    fontWeight: '600',
  } as TextStyle,
  speciesAliases: {
    fontSize: fs(typeScale.caption),
    marginTop: 2,
  } as TextStyle,
  recentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  } as ViewStyle,
  recentCardHit: {
    flex: 1,
  } as ViewStyle,
  recentFiller: {
    flex: 1,
  } as ViewStyle,
  recentCard: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xs,
  } as ViewStyle,
  recentName: {
    fontSize: fs(typeScale.caption),
    fontWeight: '600',
    alignSelf: 'stretch',
    textAlign: 'center',
  } as TextStyle,
  noResult: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  } as ViewStyle,
  noResultTitle: {
    fontSize: fs(typeScale.body),
    fontWeight: '600',
  } as TextStyle,
  noResultText: {
    fontSize: fs(typeScale.meta),
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  } as TextStyle,
  browseHit: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  } as ViewStyle,
  browseText: {
    fontSize: fs(typeScale.meta),
    fontWeight: '600',
  } as TextStyle,
});
