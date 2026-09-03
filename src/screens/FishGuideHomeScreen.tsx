import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  fishKnowledgeService,
  localGuideItems,
  mergeGuideItems,
} from '../services/fishKnowledgeService';
import { FishIllustration } from '../components/FishIllustration';
import { RemoteImage } from '../components/RemoteImage';
import { TagChip } from '../components/Common';
import { palette } from '../constants/colors';
import { FishGuideItem } from '../types/models';
import { MainTabParamList, RootStackParamList } from '../navigation/types';

type FishGuideHomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Guide'>,
  StackNavigationProp<RootStackParamList>
>;

type GuideFilterKey = 'ALL' | 'DISCOVERED' | 'UNDISCOVERED';

const guideFilters: { key: GuideFilterKey; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'DISCOVERED', label: '已发现' },
  { key: 'UNDISCOVERED', label: '未发现' },
];

/** 鱼类图鉴首页（对应原 FishGuideHomeScreen.kt：远程列表 + 离线预览 fallback）。 */
export const FishGuideHomeScreen: React.FC = () => {
  const navigation = useNavigation<FishGuideHomeScreenNavigationProp>();
  const [species, setSpecies] = useState<FishGuideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlinePreview, setOfflinePreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuideFilterKey>('ALL');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const remote = await fishKnowledgeService.listSpecies();
        if (!mounted) {
          return;
        }
        setSpecies(mergeGuideItems(remote));
        setOfflinePreview(false);
      } catch (e) {
        if (!mounted) {
          return;
        }
        setSpecies(localGuideItems());
        setOfflinePreview(true);
        setError(e instanceof Error ? e.message : 'Fish Knowledge API 暂不可用');
      }
      if (mounted) {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [retryToken]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return species.filter((fish) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        fish.nameCn.toLowerCase().includes(normalizedQuery) ||
        (fish.aliases ?? []).some((alias) => alias.toLowerCase().includes(normalizedQuery));
      const matchesFilter =
        filter === 'ALL' ? true : filter === 'DISCOVERED' ? !!fish.discovered : !fish.discovered;
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, species]);

  if (loading && species.length === 0) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerText}>正在加载鱼鉴…</Text>
      </View>
    );
  }

  const discovered = species.filter((fish) => fish.discovered).length;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>鱼类图鉴</Text>
          <Text style={styles.subtitle}>把见过的鱼，一条条收藏起来</Text>

          {error !== null ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText} numberOfLines={2}>
                {offlinePreview ? `离线预览：${error}` : error}
              </Text>
              <Pressable
                onPress={() => setRetryToken((value) => value + 1)}
                style={({ pressed }) => [styles.retryChip, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel="重试"
              >
                <Icon name="refresh" size={14} color="#FFFFFF" />
                <Text style={styles.retryChipText}>重试</Text>
              </Pressable>
            </View>
          ) : offlinePreview ? (
            <Text style={styles.offlineHint}>
              当前为离线预览数据，连接后将自动读取 Fish Knowledge Database。
            </Text>
          ) : null}

          <View style={styles.progressCard}>
            <View style={styles.progressBody}>
              <Text style={styles.progressLabel}>我的图鉴</Text>
              <View style={styles.progressCountRow}>
                <Text style={styles.progressCount}>{discovered}</Text>
                <Text style={styles.progressTotal}>{` / ${species.length}`}</Text>
              </View>
              <Text style={styles.progressCaption}>已发现鱼种</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(
                        (species.length === 0
                          ? 0
                          : Math.min(1, Math.max(0, discovered / species.length))) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
            <FishIllustration size={104} bodyColor="rgba(46,139,131,0.78)" />
          </View>

          <View style={styles.searchWrap}>
            <Icon name="search" size={18} color={palette.mutedInk} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索鱼名或别名"
              placeholderTextColor={palette.mutedInk}
              selectionColor={palette.waterTeal}
              returnKeyType="search"
            />
          </View>

          <View style={styles.filterRow}>
            {guideFilters.map((item) => (
              <Pressable key={item.key} onPress={() => setFilter(item.key)}>
                <TagChip text={item.label} emphasized={filter === item.key} />
              </Pressable>
            ))}
          </View>

          <View style={styles.countRow}>
            <Text style={styles.countTitle}>鱼种</Text>
            <Text style={styles.countText}>{`${visible.length} 种`}</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <SpeciesCard
          fish={item}
          imageUrl={fishKnowledgeService.resolveAssetUrl(item.coverImage)}
          onClick={() => navigation.navigate('Species', { key: item.id })}
        />
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.emptyText}>没有匹配的鱼种。</Text>
        ) : null
      }
    />
  );
};

const SpeciesCard: React.FC<{
  fish: FishGuideItem;
  imageUrl: string | null;
  onClick: () => void;
}> = ({ fish, imageUrl, onClick }) => (
  <Pressable
    onPress={onClick}
    style={({ pressed }) => [styles.speciesCard, pressed && { opacity: 0.85 }]}
    accessibilityRole="button"
    accessibilityLabel={`${fish.nameCn} 鱼鉴`}
  >
    <View
      style={[
        styles.speciesImageWrap,
        { backgroundColor: fish.discovered ? palette.softWater : '#EEEFEA' },
      ]}
    >
      {imageUrl ? (
        <RemoteImage url={imageUrl} style={styles.speciesImage} resizeMode="cover" />
      ) : (
        <FishIllustration
          size={112}
          bodyColor={
            fish.discovered ? 'rgba(46,139,131,0.72)' : 'rgba(138,151,155,0.45)'
          }
        />
      )}
      {fish.discovered ? (
        <View style={styles.discoveredBadge}>
          <Text style={styles.discoveredBadgeText}>已发现</Text>
        </View>
      ) : null}
    </View>
    <Text style={styles.speciesName}>{fish.nameCn}</Text>
    <TagChip text={fish.category.length > 0 ? fish.category : '鱼鉴内容'} emphasized />
    {fish.catches && fish.catches > 0 ? (
      <Text style={styles.speciesMetaTeal}>{`我的鱼获 ${fish.catches} 次`}</Text>
    ) : (
      <Text style={styles.speciesMetaMuted}>查看完整鱼鉴</Text>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.warmBackground,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 110,
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
  title: {
    color: palette.deepInk,
    fontSize: 29,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.mutedInk,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E8',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#9A5B16',
    fontSize: 11,
  },
  retryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.waterTeal,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryChipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  offlineHint: {
    color: palette.mutedInk,
    fontSize: 11,
    marginBottom: 12,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.softWater,
    borderRadius: 28,
    padding: 20,
    marginBottom: 12,
  },
  progressBody: {
    flex: 1,
  },
  progressLabel: {
    color: palette.waterTeal,
    fontSize: 13,
    fontWeight: '600',
  },
  progressCountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  progressCount: {
    color: palette.deepInk,
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 44,
  },
  progressTotal: {
    color: palette.mutedInk,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 2,
  },
  progressCaption: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  progressTrack: {
    alignSelf: 'stretch',
    marginTop: 14,
    height: 7,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 50,
    backgroundColor: palette.waterTeal,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: palette.deepInk,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  countTitle: {
    color: palette.deepInk,
    fontSize: 20,
    fontWeight: '700',
  },
  countText: {
    color: palette.mutedInk,
    fontSize: 12,
  },
  gridRow: {
    gap: 12,
    marginBottom: 14,
  },
  speciesCard: {
    flex: 1,
    backgroundColor: palette.cardWhite,
    borderRadius: 22,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  speciesImageWrap: {
    height: 164,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesImage: {
    width: '100%',
    height: '100%',
  },
  discoveredBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 50,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discoveredBadgeText: {
    color: palette.waterTeal,
    fontSize: 9,
    fontWeight: '700',
  },
  speciesName: {
    color: palette.deepInk,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 11,
  },
  speciesMetaTeal: {
    color: palette.waterTeal,
    fontSize: 10,
    marginTop: 5,
  },
  speciesMetaMuted: {
    color: palette.mutedInk,
    fontSize: 10,
    marginTop: 5,
  },
  emptyText: {
    color: palette.mutedInk,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 24,
  },
});
