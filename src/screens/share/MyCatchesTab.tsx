import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCatchArchive } from '../../contexts/CatchContext';
import { RemoteCatch } from '../../types/models';
import { palette } from '../../constants/colors';
import { font, radius, spacing } from '../../constants/tokens';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import { groupCatchesByMonth } from '../../utils/formatters';
import { RemoteImage } from '../../components/RemoteImage';
import { PressableScale } from '../../components/ui/PressableScale';
import { EmptyState } from '../../components/ui/EmptyState';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RadioDot } from '../../components/ui/RadioDot';

type MyCatchesTabNavigationProp = StackNavigationProp<RootStackParamList, 'MyCatches'>;

const COLUMNS = 2;
const GOLD = '#C9A96A';

/**
 * 我的鱼获 Tab（P20-1）：筛选 chips（全部 / 鱼种 / 时间 / 地点）；
 * 按月份分组、两列 3:4 照片卡；右下角相机 FAB。
 * 由 CatchHub 容器承载页面标题与分段切换，这里只负责列表本体。
 */
export const MyCatchesTab: React.FC = () => {
  const navigation = useNavigation<MyCatchesTabNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches, loading, error, reload } = useCatchArchive();
  const insets = useSafeAreaInsets();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [speciesSheet, setSpeciesSheet] = useState(false);
  const [locationSheet, setLocationSheet] = useState(false);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  // 地点筛选来源：本地 Catch Memory
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

  const speciesOptions = useMemo(() => {
    const seen = new Map<string, string>();
    catches.forEach((item) => {
      if (item.speciesId && !seen.has(item.speciesId)) {
        seen.set(item.speciesId, item.speciesName || item.speciesId);
      }
    });
    return Array.from(seen, ([key, name]) => ({ key, name }));
  }, [catches]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(memories).forEach((memory) => {
      const value = memory.location?.trim();
      if (value) {
        set.add(value);
      }
    });
    return Array.from(set);
  }, [memories]);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    let list = catches;
    if (keyword) {
      list = list.filter((item) => item.speciesName.includes(keyword));
    }
    if (speciesFilter) {
      list = list.filter((item) => item.speciesId === speciesFilter);
    }
    if (locationFilter) {
      list = list.filter((item) => memories[item.id]?.location?.trim() === locationFilter);
    }
    const sorted = [...list].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    return sortAsc ? sorted : sorted.reverse();
  }, [catches, query, speciesFilter, locationFilter, memories, sortAsc]);

  const groups = useMemo(() => groupCatchesByMonth(filtered), [filtered]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const speciesFilterName = speciesOptions.find((option) => option.key === speciesFilter)?.name;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 120 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 摘要 + 搜索 */}
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: textSecondary }]}>
            {catches.length} 次渔获 ·{' '}
            {new Set(catches.map((item) => item.speciesId).filter(Boolean)).size} 种鱼
          </Text>
          <PressableScale
            onPress={() => {
              setSearchOpen((value) => !value);
              if (searchOpen) {
                setQuery('');
              }
            }}
            scaleTo={0.92}
            style={styles.searchHit}
          >
            <Icon name={searchOpen ? 'close' : 'search'} size={20} color={textPrimary} />
          </PressableScale>
        </View>

        {searchOpen ? (
          <View style={[styles.searchWrap, { backgroundColor: profile.surface.glassStrong }]}>
            <Icon name="search-outline" size={17} color={textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索鱼种名称"
              placeholderTextColor={textSecondary}
              autoFocus
            />
          </View>
        ) : null}

        {/* 筛选 chips：全部 / 鱼种 / 时间 / 地点 */}
        <View style={styles.chipRow}>
          <PressableScale
            onPress={() => {
              setSpeciesFilter(null);
              setLocationFilter(null);
            }}
            scaleTo={0.96}
          >
            <View
              style={[
                styles.chip,
                !speciesFilter && !locationFilter
                  ? { backgroundColor: profile.surface.glassStrong }
                  : { backgroundColor: 'transparent' },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: textPrimary },
                  (speciesFilter || locationFilter) && { color: textSecondary },
                ]}
              >
                全部
              </Text>
              {!speciesFilter && !locationFilter ? <View style={styles.chipUnderline} /> : null}
            </View>
          </PressableScale>
          <PressableScale onPress={() => setSpeciesSheet(true)} scaleTo={0.96}>
            <View style={styles.chipPlain}>
              <Text style={[styles.chipText, { color: speciesFilter ? GOLD : textSecondary }]}>
                {speciesFilter ? speciesFilterName ?? '鱼种' : '鱼种'}
              </Text>
              <Icon name="chevron-down" size={13} color={speciesFilter ? GOLD : textSecondary} />
            </View>
          </PressableScale>
          <PressableScale onPress={() => setSortAsc((value) => !value)} scaleTo={0.96}>
            <View style={styles.chipPlain}>
              <Text style={[styles.chipText, { color: textSecondary }]}>
                {sortAsc ? '最早' : '最新'}
              </Text>
              <Icon name="chevron-down" size={13} color={textSecondary} />
            </View>
          </PressableScale>
          <PressableScale onPress={() => setLocationSheet(true)} scaleTo={0.96}>
            <View style={styles.chipPlain}>
              <Text style={[styles.chipText, { color: locationFilter ? GOLD : textSecondary }]}>
                {locationFilter ?? '地点'}
              </Text>
              <Icon name="chevron-down" size={13} color={locationFilter ? GOLD : textSecondary} />
            </View>
          </PressableScale>
        </View>

        {/* LOADING ≠ EMPTY（14.1） */}
        {loading && catches.length === 0 ? (
          <Text style={[styles.stateText, { color: textSecondary }]}>正在打开你的收藏…</Text>
        ) : error && catches.length === 0 ? (
          <View style={styles.stateWrap}>
            <Text style={[styles.stateTitle, { color: textPrimary }]}>网络好像断开了</Text>
            <Text style={[styles.stateText, { color: textSecondary }]}>
              你的鱼获还在，恢复网络后就能看到
            </Text>
            <PressableScale onPress={reload} scaleTo={0.97} style={styles.retryHit}>
              <Text style={[styles.retryText, { color: profile.surface.accent }]}>重新尝试</Text>
            </PressableScale>
          </View>
        ) : catches.length === 0 ? (
          <EmptyState
            title="你的鱼获会收藏在这里"
            description="每次拍照识别后的渔获，都会按时间收进这本收藏册"
            actionLabel="拍照识鱼"
            onAction={() => navigation.navigate('Identify')}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="没有找到这个鱼种"
            description="可以试试其他名称，或清除筛选浏览全部鱼获"
            actionLabel="清除筛选"
            onAction={() => {
              setQuery('');
              setSpeciesFilter(null);
              setLocationFilter(null);
            }}
          />
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.monthGroup}>
              <Text style={[styles.monthLabel, { color: textPrimary }]}>{group.label}</Text>
              {chunk(group.items, COLUMNS).map((row, rowIndex) => (
                <View key={rowIndex} style={styles.gridRow}>
                  {row.map((item) => (
                    <CatchCard
                      key={item.id}
                      item={item}
                      accessToken={session?.accessToken ?? null}
                      location={memories[item.id]?.location?.trim() ?? null}
                      onPress={() =>
                        navigation.navigate('CatchDetail', { catchId: item.id, initialCatch: item })
                      }
                    />
                  ))}
                  {row.length < COLUMNS ? <View style={styles.gridFiller} /> : null}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* 右下角相机 FAB */}
      <PressableScale
        onPress={() => navigation.navigate('Identify')}
        scaleTo={0.94}
        style={[styles.fab, { bottom: insets.bottom + spacing.xl }]}
      >
        <View
          style={[
            styles.fabCircle,
            {
              backgroundColor: profile.surface.glassStrong,
              borderColor: 'rgba(255,255,255,0.7)',
            },
          ]}
        >
          <Icon name="camera-outline" size={22} color={GOLD} />
        </View>
      </PressableScale>

      {/* 鱼种筛选 */}
      <BottomSheet visible={speciesSheet} onClose={() => setSpeciesSheet(false)} title="按鱼种筛选">
        <OptionRow
          label="全部鱼种"
          selected={!speciesFilter}
          color={profile.surface.accent}
          textPrimary={textPrimary}
          idleColor={textSecondary}
          onPress={() => {
            setSpeciesFilter(null);
            setSpeciesSheet(false);
          }}
        />
        {speciesOptions.map((option) => (
          <OptionRow
            key={option.key}
            label={option.name}
            selected={speciesFilter === option.key}
            color={profile.surface.accent}
            textPrimary={textPrimary}
            idleColor={textSecondary}
            onPress={() => {
              setSpeciesFilter(option.key);
              setSpeciesSheet(false);
            }}
          />
        ))}
      </BottomSheet>

      {/* 地点筛选 */}
      <BottomSheet visible={locationSheet} onClose={() => setLocationSheet(false)} title="按地点筛选">
        <OptionRow
          label="全部地点"
          selected={!locationFilter}
          color={profile.surface.accent}
          textPrimary={textPrimary}
          idleColor={textSecondary}
          onPress={() => {
            setLocationFilter(null);
            setLocationSheet(false);
          }}
        />
        {locationOptions.map((option) => (
          <OptionRow
            key={option}
            label={option}
            selected={locationFilter === option}
            color={profile.surface.accent}
            textPrimary={textPrimary}
            idleColor={textSecondary}
            onPress={() => {
              setLocationFilter(option);
              setLocationSheet(false);
            }}
          />
        ))}
      </BottomSheet>
    </View>
  );
};

const OptionRow: React.FC<{
  label: string;
  selected: boolean;
  color: string;
  textPrimary: string;
  idleColor: string;
  onPress: () => void;
}> = ({ label, selected, color, textPrimary, idleColor, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.99} style={styles.optionHit}>
    <View style={styles.optionRow} pointerEvents="none">
      <Text style={[styles.optionLabel, { color: selected ? color : textPrimary }]}>{label}</Text>
      <RadioDot selected={selected} color={GOLD} idleColor={idleColor} />
    </View>
  </PressableScale>
);

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - spacing.page * 2 - spacing.md) / COLUMNS;

const CatchCard: React.FC<{
  item: RemoteCatch;
  accessToken: string | null;
  location: string | null;
  onPress: () => void;
}> = ({ item, accessToken, location, onPress }) => {
  const when = formatCardDate(item.capturedAt);
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.cardHit}>
      <View style={[styles.card, { borderColor: 'rgba(255,255,255,0.6)' }]}>
        {item.imageUrl ? (
          <RemoteImage
            url={item.imageUrl}
            authToken={accessToken}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.fallbackText}>渔见</Text>
          </View>
        )}
        {/* 底部渐变 + 鱼名/地点 */}
        <View style={styles.cardOverlay}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="myCatchScrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0A2029" stopOpacity="0" />
                <Stop offset="0.55" stopColor="#0A2029" stopOpacity="0.22" />
                <Stop offset="1" stopColor="#0A2029" stopOpacity="0.68" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#myCatchScrim)" />
          </Svg>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.speciesName || '确认中的鱼'}
            </Text>
            <View style={styles.cardMetaRow}>
              <Icon name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
              <Text style={styles.cardMetaText} numberOfLines={1}>
                {location ?? '待确认'}
              </Text>
              <Text style={styles.cardMetaText}>·</Text>
              <Text style={styles.cardMetaText}>{when}</Text>
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
};

const formatCardDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
  } as ViewStyle,
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  summaryText: {
    fontSize: 14,
  } as TextStyle,
  searchHit: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  } as ViewStyle,
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    height: 42,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  } as TextStyle,
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  } as ViewStyle,
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
  } as ViewStyle,
  chipUnderline: {
    width: 20,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: GOLD,
    marginTop: 3,
  } as ViewStyle,
  chipPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 9,
  } as ViewStyle,
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  stateWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  } as ViewStyle,
  stateTitle: {
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
  stateText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  } as TextStyle,
  retryHit: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  } as ViewStyle,
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  monthGroup: {
    marginTop: spacing.lg,
  } as ViewStyle,
  monthLabel: {
    fontFamily: font.serif,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  } as TextStyle,
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  } as ViewStyle,
  gridFiller: {
    flex: 1,
  } as ViewStyle,
  cardHit: {
    width: CARD_W,
  } as ViewStyle,
  card: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  cardImage: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  cardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  fallbackText: {
    fontFamily: font.serif,
    fontSize: 18,
    color: palette.waterTeal,
    letterSpacing: 3,
  } as TextStyle,
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  } as ViewStyle,
  cardInfo: {
    paddingBottom: 14,
    paddingHorizontal: 14,
    gap: 4,
  } as ViewStyle,
  cardName: {
    fontFamily: font.serif,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8,26,34,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  cardMetaText: {
    fontSize: 12,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.88)',
    textShadowColor: 'rgba(8,26,34,0.5)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  fab: {
    position: 'absolute',
    right: spacing.page,
  } as ViewStyle,
  fabCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#173B4B',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  } as ViewStyle,
  optionHit: {
    borderRadius: radius.s,
  } as ViewStyle,
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 6,
  } as ViewStyle,
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
  } as TextStyle,
});
