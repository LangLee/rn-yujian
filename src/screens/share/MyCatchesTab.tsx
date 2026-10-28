import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SectionList,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppIcon } from '../../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useCatchArchive } from '../../contexts/CatchContext';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import { coreColors, PAGE_MARGIN } from '../../constants/coreUi';
import { font, fs, spacing } from '../../constants/tokens';
import { PressableScale } from '../../components/ui/PressableScale';
import { YuJianPrimaryCaptureButton } from '../../components/coreui';
import {
  ActiveCondition,
  ActiveConditionKey,
  CatchEntry,
  DayGroup,
  EMPTY_FILTER,
  MyCatchesFilterState,
  buildEntries,
  groupByMonthAndDay,
  isFilterActive,
  activeConditionCount,
  activeConditions,
  matchFilter,
  matchSearch,
  resolveEmptyKind,
  resolveGrowthMarks,
  sortNewestFirst,
  withoutCondition,
} from '../../utils/myCatchesTimeline';
import { FishRecordRowCard } from './myCatches/FishRecordRowCard';
import { F1FilterPanel } from './myCatches/F1FilterPanel';

type MyCatchesTabNavigationProp = StackNavigationProp<RootStackParamList, 'MyCatches'>;

/** 初始加载最近 3 个月，滚动到历史边界再加载更早（Timeline Scroll Spec §6） */
const INITIAL_MONTH_WINDOW = 3;
const MONTH_PAGE_SIZE = 3;
/** 搜索防抖（Search Spec §16：150–250ms，用户感知即时） */
const SEARCH_DEBOUNCE_MS = 200;
/** 最近搜索最多保存 6 个（Search Spec §6） */
const RECENT_SEARCH_KEY = '@yujian/recent_catch_search';
const RECENT_SEARCH_MAX = 6;

export interface MyCatchesTabControllerProps {
  /** Search Mode（由 Hub 头部驱动） */
  searchMode: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  /** 搜索模式内点击 Filter Summary：返回原页面并展开 F1，query 保留（Search Spec §12） */
  onEditFilterFromSearch: () => void;
  /** F1 展开状态（Hub Filter Action 驱动） */
  filterOpen: boolean;
  /** 通知 Hub：当前是否有生效筛选（Filter Action 状态提示点） */
  onFilterActiveChange: (active: boolean) => void;
}

type Row =
  | { kind: 'day'; day: DayGroup; firstOfMonth: boolean }
  | { kind: 'card'; entry: CatchEntry; rail: 'through' | 'end' }
  | { kind: 'expand'; dayKey: string; hidden: number; total: number }
  | { kind: 'collapse'; dayKey: string };

/**
 * 时间线轨道几何（my_catches_v2 冻结稿 @941px）：
 * 日期栏（大日期 + SEP + 星期）在页边距与轨道之间；轨道中心 ≈ 屏宽 18%，
 * 卡片列左缘 ≈ 屏宽 21%（轨道右侧 ~12dp）。相对内容左缘取整为 48 / 60。
 */
const RAIL_INSET = 48;
const CARD_INSET = 60;
/** 轨道线色（设计稿 #BCC3CE 灰蓝） */
const RAIL_COLOR = 'rgba(184,198,206,0.85)';

/**
 * 我的鱼获 Tab · My Catches V2（Chronological Archive，FROZEN）。
 *
 * 结构（Design Audit §2）：搜索/筛选（Hub 头部）→ 档案摘要 → 月份分组（Sticky）
 * → 日期节点/当日摘要 → FishRecordRowCard → Growth Mark → 共享拍摄入口。
 */
export const MyCatchesTab: React.FC<MyCatchesTabControllerProps> = ({
  searchMode,
  query,
  onQueryChange,
  onEditFilterFromSearch,
  filterOpen,
  onFilterActiveChange,
}) => {
  const navigation = useNavigation<MyCatchesTabNavigationProp>();
  const { catches, loading, error, reload } = useCatchArchive();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<MyCatchesFilterState>(EMPTY_FILTER);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [monthWindow, setMonthWindow] = useState(INITIAL_MONTH_WINDOW);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const listRef = useRef<SectionList<Row, { key: string; data: Row[] }>>(null);
  /** query 有效结果标记（Search Spec §7：仅在点击结果 / 有效退出时写最近搜索） */
  const queryHadResultsRef = useRef(false);
  /** 最后一次非空 query：取消会与清空 query 同批提交，退出时用 ref 收口最近搜索 */
  const lastQueryRef = useRef('');

  /* ---------- 数据装配 ---------- */

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_SEARCH_KEY);
        if (mounted) {
          const parsed = raw ? (JSON.parse(raw) as string[]) : [];
          setRecentSearches(Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCH_MAX) : []);
        }
      } catch {
        // 本地存储失败不阻塞页面
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const entries = useMemo(() => buildEntries(catches, memories), [catches, memories]);
  const marks = useMemo(() => resolveGrowthMarks(entries), [entries]);

  /* 搜索防抖：头部即时显示输入，时间线按防抖后的 query 重算（Search Spec §16） */
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const now = new Date();
    return sortNewestFirst(
      entries.filter(
        (entry) =>
          matchSearch(entry, debouncedQuery, marks) && matchFilter(entry, filter, marks, now),
      ),
    );
  }, [entries, debouncedQuery, filter, marks]);

  const allMonths = useMemo(() => groupByMonthAndDay(filtered), [filtered]);
  const months = useMemo(() => allMonths.slice(0, monthWindow), [allMonths, monthWindow]);

  const filterActive = useMemo(() => isFilterActive(filter), [filter]);
  useEffect(() => {
    onFilterActiveChange(filterActive);
  }, [filterActive, onFilterActiveChange]);

  const emptyKind = resolveEmptyKind({
    loading,
    hasError: !!error,
    rawCount: catches.length,
    query: debouncedQuery,
    filterActive,
    resultCount: filtered.length,
  });

  /* 搜索/筛选条件变化：折叠态复位、回到结果顶部（Timeline Scroll Spec §7） */
  const conditionKey = `${debouncedQuery}|${JSON.stringify(filter)}`;
  const lastConditionRef = useRef(conditionKey);
  useEffect(() => {
    if (query.trim()) {
      lastQueryRef.current = query;
    }
    if (lastConditionRef.current === conditionKey) return;
    lastConditionRef.current = conditionKey;
    setExpandedDays(new Set());
    setMonthWindow(INITIAL_MONTH_WINDOW);
    queryHadResultsRef.current = filtered.length > 0 && debouncedQuery.trim().length > 0;
    requestAnimationFrame(() => {
      listRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        viewPosition: 0,
        viewOffset: 0,
        animated: false,
      });
    });
    // filtered 依赖 conditionKey 派生，避免重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionKey]);

  /* 点击 Hub 头部 Search / Filter：列表滚回顶部（F1 面板 / 最近搜索位于 ListHeader，滚到首行会看不到）；收起时不打断阅读位置 */
  useEffect(() => {
    if (!searchMode && !filterOpen) return;
    requestAnimationFrame(() => {
      listRef.current
        ?.getScrollResponder()
        ?.scrollTo({ x: 0, y: 0, animated: true });
    });
  }, [searchMode, filterOpen]);

  /* ---------- 最近搜索（仅在有效结果时写入） ---------- */

  const persistRecentSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(
        0,
        RECENT_SEARCH_MAX,
      );
      AsyncStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /** 退出搜索模式（取消）时按规则收口最近搜索 */
  useEffect(() => {
    if (searchMode) return;
    if (queryHadResultsRef.current) {
      persistRecentSearch(lastQueryRef.current);
      queryHadResultsRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode]);

  const openCatch = (entry: CatchEntry) => {
    // Search Mode 内点击结果 → 记为有效搜索（B5：返回后保持 Search Mode 与结果集合）
    if (searchMode && query.trim()) {
      persistRecentSearch(query);
      queryHadResultsRef.current = false;
    }
    navigation.navigate('CatchDetail', {
      catchId: entry.catch.id,
      initialCatch: entry.catch,
    });
  };

  /* ---------- 鱼种选项（F1 快捷 / F2 全量） ---------- */

  const speciesStats = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number }>();
    for (const entry of entries) {
      const key = entry.catch.speciesId || entry.catch.speciesName || 'unknown';
      const name = entry.catch.speciesName || key;
      const current = map.get(key);
      if (current) {
        current.count += 1;
      } else {
        map.set(key, { key, name, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  const speciesOptions = useMemo(
    () => speciesStats.map(({ key, name }) => ({ key, name })),
    [speciesStats],
  );
  const quickSpecies = useMemo(() => speciesOptions.slice(0, 3), [speciesOptions]);

  /* ---------- SectionList 组装 ---------- */

  const sections = useMemo(() => {
    return months.map((month) => {
      const data: Row[] = [];
      for (const day of month.days) {
        data.push({ kind: 'day', day, firstOfMonth: data.length === 0 });
        const total = day.entries.length;
        const expanded = expandedDays.has(day.key);
        /** 组内卡片列表（默认前 5 / 展开全部） */
        const pushCards = (list: CatchEntry[], hasFurnitureAfter: boolean) => {
          list.forEach((entry, index) => {
            const last = index === list.length - 1;
            data.push({
              kind: 'card',
              entry,
              // 时间线竖线：非尾卡贯通，尾卡视后续展开行决定收笔
              rail: !last ? 'through' : hasFurnitureAfter ? 'through' : 'end',
            });
          });
        };
        if (total <= 5) {
          pushCards(day.entries, false);
        } else if (total <= 10 && expanded) {
          pushCards(day.entries, true);
          data.push({ kind: 'collapse', dayKey: day.key });
        } else {
          // 6-10 条默认前 5 + 原位展开；>10 条前 5 + 「查看全部」进当天详情（§4）
          pushCards(day.entries.slice(0, 5), true);
          data.push({ kind: 'expand', dayKey: day.key, hidden: total - 5, total });
        }
      }
      return { key: month.key, data };
    });
  }, [months, expandedDays]);

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case 'day':
          return <DayNode day={item.day} firstOfMonth={item.firstOfMonth} />;
        case 'card':
          return (
            <View style={styles.cardWrap}>
              <View
                style={[
                  styles.cardRailLine,
                  item.rail === 'through' ? styles.cardRailThrough : styles.cardRailEnd,
                ]}
              />
              <FishRecordRowCard
                entry={item.entry}
                mark={marks.get(item.entry.catch.id)}
                onPress={() => openCatch(item.entry)}
              />
            </View>
          );
        case 'expand':
          return (
            <ExpandRow
              label={
                item.total <= 10
                  ? `查看另外 ${item.hidden} 条`
                  : `查看全部 ${item.total} 条鱼获`
              }
              chevron={item.total <= 10 ? 'down' : 'forward'}
              onPress={() =>
                item.total <= 10
                  ? setExpandedDays((prev) => new Set(prev).add(item.dayKey))
                  : navigation.navigate('CatchDay', { dayKey: item.dayKey })
              }
            />
          );
        case 'collapse':
          return (
            <ExpandRow
              label="收起"
              chevron="up"
              onPress={() =>
                setExpandedDays((prev) => {
                  const next = new Set(prev);
                  next.delete(item.dayKey);
                  return next;
                })
              }
            />
          );
        default:
          return null;
      }
    },
    // openCatch 依赖运行时状态，刷新频率低；marks 变化需重建
    [marks, navigation, searchMode, query],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  /* ---------- 头部内容（F1 / 摘要 / 最近搜索 / 结果摘要） ---------- */

  const visibleSpecies = useMemo(
    () =>
      new Set(filtered.map((entry) => entry.catch.speciesId || entry.catch.speciesName))
        .size,
    [filtered],
  );

  const visibleDays = useMemo(
    () =>
      new Set(
        filtered.map((entry) =>
          entry.date ? `${entry.year}-${entry.month}-${entry.day}` : 'unknown',
        ),
      ).size,
    [filtered],
  );

  const speciesNameOf = useCallback(
    (key: string) => speciesStats.find((item) => item.key === key)?.name ?? key,
    [speciesStats],
  );

  /** 维度级已选条件（Filter Spec V2 §4 compact removable summary / B4 摘要卡） */
  const conditions = useMemo(
    () => activeConditions(filter, speciesNameOf),
    [filter, speciesNameOf],
  );

  const removeCondition = useCallback(
    (key: ActiveConditionKey) => setFilter((prev) => withoutCondition(prev, key)),
    [],
  );

  const listHeader = (
    <View>
      {/* 档案摘要（Search Focused 阶段隐藏 / 降权；冻结稿：N 次鱼获 · M 种鱼 · D 记录天数） */}
      {!searchMode ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {catches.length === 0
              ? '时间档案'
              : `${filtered.length} 次鱼获 · ${visibleSpecies} 种鱼 · ${visibleDays} 记录天数`}
          </Text>
          {query.trim() ? (
            <PressableScale
              onPress={() => onQueryChange('')}
              scaleTo={0.94}
              style={styles.queryChip}
            >
              <Text style={styles.queryChipText} numberOfLines={1}>
                搜索「{query.trim()}」 ×
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : query.trim() ? (
        <View style={styles.searchMetaWrap}>
          {/* B4 · Search + Filter：低权重摘要卡，点击返回原页面并展开 F1（query 保留） */}
          {filterActive && conditions.length > 0 ? (
            <FilterSummaryCard
              count={activeConditionCount(filter)}
              summary={conditions.map((item) => item.label).join(' · ')}
              onPress={onEditFilterFromSearch}
            />
          ) : null}
          <Text style={styles.searchMetaText}>
            {filtered.length > 0 ? `${filtered.length} 次鱼获` : ''}
          </Text>
        </View>
      ) : (
        <RecentSearchBlock
          items={recentSearches}
          onPick={(value) => onQueryChange(value)}
          onClear={() => {
            setRecentSearches([]);
            AsyncStorage.removeItem(RECENT_SEARCH_KEY).catch(() => {});
          }}
        />
      )}

      {/* Filter Spec V2 §4：已选条件 compact removable summary + 清空（F1 收起时显示） */}
      {!searchMode && !filterOpen && conditions.length > 0 ? (
        <ConditionSummaryRow
          conditions={conditions}
          onRemove={removeCondition}
          onClearAll={() => setFilter(EMPTY_FILTER)}
        />
      ) : null}

      {/* F1 · 顶部内联筛选面板：Header/Summary 之下、Timeline 之上，展开时推动 Timeline（F1 Spec §2/§6） */}
      {filterOpen && !searchMode ? (
        <View style={styles.filterPanelWrap}>
          <F1FilterPanel
            filter={filter}
            speciesOptions={speciesOptions}
            quickSpecies={quickSpecies}
            onChange={setFilter}
            onReset={() => setFilter(EMPTY_FILTER)}
          />
        </View>
      ) : null}
    </View>
  );

  /* ---------- 渲染 ---------- */

  const showTimeline = !loading && !error && emptyKind === null && sections.length > 0;

  return (
    <View style={styles.flex}>
      {showTimeline ? (
        <SectionList
          ref={listRef}
          sections={sections}
          keyExtractor={(item, index) =>
            item.kind === 'day'
              ? `day-${item.day.key}`
              : item.kind === 'card'
                ? `card-${item.entry.catch.id}`
                : item.kind === 'expand'
                  ? `expand-${item.dayKey}`
                  : `collapse-${item.dayKey}-${index}`
          }
          contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => <MonthHeader label={monthLabelOf(section.key)} />}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          onEndReached={() => {
            if (monthWindow < allMonths.length) {
              setMonthWindow((value) => value + MONTH_PAGE_SIZE);
            }
          }}
          onEndReachedThreshold={0.6}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      ) : (
        <View style={[styles.content, styles.stateContainer]}>
          {listHeader}
          {loading ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>正在整理你的时间档案…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>鱼获档案暂时无法加载</Text>
              <Text style={styles.stateText}>恢复网络后，你的鱼获会回到这里</Text>
              <PressableScale onPress={reload} scaleTo={0.97} style={styles.stateActionHit}>
                <Text style={styles.stateAction}>重新加载</Text>
              </PressableScale>
            </View>
          ) : emptyKind === 'archive' ? (
            <ArchiveEmptyState />
          ) : emptyKind === 'search' ? (
            <SearchEmptyState
              onClear={() => {
                queryHadResultsRef.current = false;
                onQueryChange('');
              }}
            />
          ) : emptyKind === 'filter' ? (
            <FilterEmptyState
              onClear={() => setFilter(EMPTY_FILTER)}
              onEdit={() => setFilter(EMPTY_FILTER)}
            />
          ) : (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>这里还很安静</Text>
            </View>
          )}
        </View>
      )}

      {/* 底部中央共享拍摄入口（Archive/Search/Filter Empty 与时间线常驻，不参与滚动） */}
      <View style={[styles.fab, { bottom: insets.bottom + spacing.md }]}>
        <YuJianPrimaryCaptureButton
          onPress={() => navigation.navigate('Identify')}
          size={52}
          accessibilityLabel="拍照识别"
        />
      </View>
    </View>
  );
};

/** monthKey（YYYY-MM / unknown）→ 章节标题 */
function monthLabelOf(key: string): string {
  if (key === 'unknown') return '时间未知';
  const [year, month] = key.split('-');
  return `${Number(year)}年${Number(month)}月`;
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

/** 月份章节头（Sticky）：衬线加粗，直接浮在场景上，不加白色底 */
const MonthHeader: React.FC<{ label: string }> = ({ label }) => (
  <View style={monthStyles.wrap}>
    <Text style={monthStyles.label}>{label}</Text>
  </View>
);

const monthStyles = StyleSheet.create({
  wrap: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginBottom: 2,
  } as ViewStyle,
  label: {
    fontFamily: font.serif,
    fontSize: fs(18),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
    letterSpacing: 0.5,
  } as TextStyle,
});

/**
 * 日期节点（my_catches_v2 冻结稿）：
 * - 大衬线日期 + 月份缩写 + 星期 叠放在轨道左侧日期栏（绝对定位下段与首卡并排）；
 * - 轨道圆点（Morning Gold）与日期行垂直居中；
 * - 当日摘要（📍 地点 · N条鱼获 · M种鱼）与日期同行，对齐卡片列。
 */
const DayNode: React.FC<{ day: DayGroup; firstOfMonth: boolean }> = ({ day, firstOfMonth }) => (
  <View style={dayStyles.wrap}>
    <View style={[dayStyles.railLine, firstOfMonth && dayStyles.railLineFirst]} />
    <View style={dayStyles.dot} />
    <View style={dayStyles.mainRow}>
      <View style={dayStyles.dateCol}>
        <Text style={dayStyles.dayNumber}>{day.dayLabel}</Text>
      </View>
      <View style={dayStyles.summaryRow}>
        <AppIcon name="location" size={12} color={coreColors.lakeBlue} />
        <Text style={dayStyles.summary} numberOfLines={1}>
          {day.summary}
        </Text>
      </View>
    </View>
    {day.monthLabel || day.weekday ? (
      <View style={dayStyles.subBlock}>
        <Text style={dayStyles.monthAbbr}>{day.monthLabel}</Text>
        <Text style={dayStyles.weekday}>{day.weekday}</Text>
      </View>
    ) : null}
  </View>
);

/** 日期数字行高（summaryRow 同高，与圆点对齐的基准） */
const DAY_LINE_HEIGHT = 34;

const dayStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginTop: 10,
    marginBottom: 6,
  } as ViewStyle,
  /* 竖线向上衔接上一组尾卡（卡片底距 + 组间距 ~20dp，负值覆盖并重叠） */
  railLine: {
    position: 'absolute',
    left: RAIL_INSET - 0.5,
    top: -24,
    bottom: -6,
    width: 1,
    backgroundColor: RAIL_COLOR,
  } as ViewStyle,
  /* 每月首个日期节点：竖线自圆点起，不越过月份标题 */
  railLineFirst: {
    top: DAY_LINE_HEIGHT / 2 - 4,
  } as ViewStyle,
  /* 轨道圆点：Morning Gold，与日期数字行垂直居中 */
  dot: {
    position: 'absolute',
    left: RAIL_INSET - 3.5,
    top: DAY_LINE_HEIGHT / 2 - 3.5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: coreColors.morningGold,
  } as ViewStyle,
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  } as ViewStyle,
  /* 日期栏：整列在轨道左侧居中（设计稿数字 + SEP + 星期同轴） */
  dateCol: {
    width: RAIL_INSET,
    alignItems: 'center',
  } as ViewStyle,
  dayNumber: {
    fontFamily: font.serif,
    fontSize: fs(26),
    lineHeight: fs(DAY_LINE_HEIGHT),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  /* 当日摘要：与日期数字同行，起点对齐卡片列 */
  summaryRow: {
    flex: 1,
    height: fs(DAY_LINE_HEIGHT),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: CARD_INSET - RAIL_INSET,
    paddingRight: 2,
  } as ViewStyle,
  summary: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    flexShrink: 1,
  } as TextStyle,
  /* 日期栏下段（SEP + 星期）：绝对定位，只占日期栏宽，与首卡并排 */
  subBlock: {
    position: 'absolute',
    left: 0,
    top: fs(DAY_LINE_HEIGHT) + 4,
    width: RAIL_INSET,
    alignItems: 'center',
  } as ViewStyle,
  monthAbbr: {
    fontSize: fs(11),
    fontWeight: '700',
    letterSpacing: 2,
    /* 冻结稿实测深石板 #2F4565 档（deepLakeBlue 82%），日期栏叠在山影上需偏深 */
    color: 'rgba(11,45,75,0.82)',
  } as TextStyle,
  weekday: {
    marginTop: 2,
    fontSize: fs(11),
    color: 'rgba(11,45,75,0.82)',
  } as TextStyle,
});

/** 展开 / 收起行：Timeline furniture，弱于卡片（文字 + 极轻 chevron，不用实心按钮） */
const ExpandRow: React.FC<{
  label: string;
  chevron: 'down' | 'up' | 'forward';
  onPress: () => void;
}> = ({ label, chevron, onPress }) => (
  <View style={expandStyles.wrap}>
    {/* 轨道延续：日期组内部家具行仍处于轨道右侧 */}
    <View style={expandStyles.rail} />
    <PressableScale onPress={onPress} scaleTo={0.97} style={expandStyles.hit}>
      <Text style={expandStyles.text}>{label}</Text>
      <AppIcon
        name={chevron === 'down' ? 'expand_more' : chevron === 'up' ? 'expand_less' : 'chevron_right'}
        size={13}
        color={coreColors.mistBlueGray}
      />
    </PressableScale>
  </View>
);

const expandStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginLeft: CARD_INSET,
    paddingVertical: 4,
  } as ViewStyle,
  rail: {
    position: 'absolute',
    left: RAIL_INSET - CARD_INSET - 0.5,
    /* 上探 12：跨过卡片间距 10 与尾卡竖线段（止于卡底 +2）重叠，避免断口 */
    top: -12,
    bottom: -4,
    width: 1,
    backgroundColor: RAIL_COLOR,
  } as ViewStyle,
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignSelf: 'flex-start',
  } as ViewStyle,
  text: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
  } as TextStyle,
});

/** B1 · 最近搜索（轻量辅助，不盖住时间线） */
const RecentSearchBlock: React.FC<{
  items: string[];
  onPick: (value: string) => void;
  onClear: () => void;
}> = ({ items, onPick, onClear }) => {
  if (items.length === 0) return null;
  return (
    <View style={recentStyles.wrap}>
      <View style={recentStyles.headerRow}>
        <Text style={recentStyles.title}>最近搜索</Text>
        <PressableScale onPress={onClear} scaleTo={0.95} style={recentStyles.clearHit}>
          <Text style={recentStyles.clear}>清空</Text>
        </PressableScale>
      </View>
      <View style={recentStyles.chipWrap}>
        {items.map((item) => (
          <PressableScale key={item} onPress={() => onPick(item)} scaleTo={0.95}>
            <View style={recentStyles.chip}>
              <Text style={recentStyles.chipText}>{item}</Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
};

const recentStyles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  } as ViewStyle,
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  } as ViewStyle,
  title: {
    fontSize: fs(13),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  clearHit: {
    paddingVertical: 4,
    paddingLeft: 8,
  } as ViewStyle,
  clear: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  } as ViewStyle,
  chip: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 7,
  } as ViewStyle,
  chipText: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
  } as TextStyle,
});

/**
 * B4 · Search + Filter 低权重筛选摘要卡（frozen B4 PNG）：
 * 雾白玻璃卡 + 漏斗图标徽标 + 「筛选中 · N个条件」/ 条件行 + ›。
 * 点击：返回原页面并展开 F1，Search query 保留（Search Spec §12）。
 */
const FilterSummaryCard: React.FC<{
  count: number;
  summary: string;
  onPress: () => void;
}> = ({ count, summary, onPress }) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.98}
    style={summaryCardStyles.wrap}
    accessibilityLabel="编辑筛选"
    accessibilityRole="button"
  >
    <View style={summaryCardStyles.iconBadge}>
      <AppIcon name="filter" size={16} color="#3D8A8D" />
    </View>
    <View style={summaryCardStyles.textWrap}>
      <Text style={summaryCardStyles.title}>筛选中 · {count}个条件</Text>
      <Text style={summaryCardStyles.summary} numberOfLines={1}>
        {summary}
      </Text>
    </View>
    <Text style={summaryCardStyles.chevron}>›</Text>
  </PressableScale>
);

const summaryCardStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    marginBottom: 8,
    alignSelf: 'stretch',
  } as ViewStyle,
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(77,158,161,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  textWrap: {
    flex: 1,
    gap: 2,
  } as ViewStyle,
  title: {
    fontSize: fs(13),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  summary: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
  } as TextStyle,
  chevron: {
    fontSize: fs(20),
    fontWeight: '400',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
});

/**
 * Filter Spec V2 §4 · 已选条件 compact removable summary：
 * 每个维度一枚可移除 chip（× 即时清除该维度），尾部保留「清空」全清入口。
 */
const ConditionSummaryRow: React.FC<{
  conditions: ActiveCondition[];
  onRemove: (key: ActiveConditionKey) => void;
  onClearAll: () => void;
}> = ({ conditions, onRemove, onClearAll }) => (
  <View style={conditionStyles.wrap}>
    {conditions.map((item) => (
      <PressableScale
        key={item.key}
        onPress={() => onRemove(item.key)}
        scaleTo={0.95}
        style={conditionStyles.chip}
        accessibilityLabel={`移除筛选条件 ${item.label}`}
        accessibilityRole="button"
      >
        <Text style={conditionStyles.chipText} numberOfLines={1}>
          {item.label}
        </Text>
        <AppIcon name="clear_field" size={12} color={coreColors.mistBlueGray} />
      </PressableScale>
    ))}
    <PressableScale onPress={onClearAll} scaleTo={0.95} style={conditionStyles.clearHit}>
      <Text style={conditionStyles.clear}>清空</Text>
    </PressableScale>
  </View>
);

const conditionStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
  } as ViewStyle,
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    maxWidth: 180,
  } as ViewStyle,
  chipText: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
  clearHit: {
    paddingVertical: 6,
    paddingLeft: 4,
  } as ViewStyle,
  clear: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
});

/** Archive Empty（Empty States Spec §1：底部共享相机按钮是唯一主行动，不再叠加同级按钮） */
const ArchiveEmptyState: React.FC = () => (
  <View style={stateStyles.wrap}>
    <Text style={stateStyles.title}>还没有鱼获记录</Text>
    <Text style={stateStyles.subtitle}>拍下第一条鱼，开始你的鱼获时间线</Text>
    <Text style={stateStyles.hint}>记录第一条鱼</Text>
  </View>
);

/** Search Empty（§3：保留 query / × / 取消 / Filter 条件 / 相机按钮） */
const SearchEmptyState: React.FC<{ onClear: () => void }> = ({ onClear }) => (
  <View style={stateStyles.wrap}>
    <Text style={stateStyles.title}>没有找到相关鱼获</Text>
    <Text style={stateStyles.subtitle}>你可以搜索：鱼种、地点、日期</Text>
    <PressableScale onPress={onClear} scaleTo={0.97} style={stateStyles.actionHit}>
      <Text style={stateStyles.action}>清除搜索</Text>
    </PressableScale>
  </View>
);

/** Filter Empty（§2：清除筛选 主恢复 / 修改筛选 次恢复；相机按钮是记录入口不是恢复 CTA） */
const FilterEmptyState: React.FC<{ onClear: () => void; onEdit: () => void }> = ({
  onClear,
  onEdit,
}) => (
  <View style={stateStyles.wrap}>
    <Text style={stateStyles.title}>没有找到符合条件的鱼获</Text>
    <Text style={stateStyles.subtitle}>试试调整筛选条件</Text>
    <PressableScale onPress={onClear} scaleTo={0.97} style={stateStyles.actionHit}>
      <Text style={stateStyles.action}>清除筛选</Text>
    </PressableScale>
    <PressableScale onPress={onEdit} scaleTo={0.97} style={stateStyles.actionHit}>
      <Text style={stateStyles.actionSecondary}>修改筛选</Text>
    </PressableScale>
  </View>
);

const stateStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl + 8,
    paddingHorizontal: spacing.lg,
    gap: 6,
  } as ViewStyle,
  title: {
    fontSize: fs(17),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  subtitle: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    textAlign: 'center',
  } as TextStyle,
  hint: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
    marginTop: 4,
  } as TextStyle,
  actionHit: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 6,
  } as ViewStyle,
  action: {
    fontSize: fs(15),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  actionSecondary: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    marginTop: -4,
  } as TextStyle,
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    /* Core UI V1 页面安全边距（冻结稿 ~5.8% 屏宽；F1 面板 20-24dp 同源） */
    paddingHorizontal: PAGE_MARGIN,
    paddingTop: spacing.sm,
  } as ViewStyle,
  stateContainer: {
    flexGrow: 1,
  } as ViewStyle,
  filterPanelWrap: {
    marginBottom: spacing.md,
  } as ViewStyle,
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  } as ViewStyle,
  summaryText: {
    /* 冻结稿：摘要行深墨蓝（~#19304E），直接坐场景上必须够深 */
    fontSize: fs(13),
    fontWeight: '500',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  queryChip: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 200,
  } as ViewStyle,
  queryChipText: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
  searchMetaWrap: {
    /* B2/B4：摘要卡在上、结果计数在下（frozen：低权重单行，不铺满 chips） */
    paddingVertical: 2,
    minHeight: 24,
  } as ViewStyle,
  searchMetaText: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    fontWeight: '500',
  } as TextStyle,
  cardWrap: {
    marginLeft: CARD_INSET,
    marginBottom: 8,
  } as ViewStyle,
  /** 卡片区左侧的时间线竖线段（连接日期节点，贯穿日期组） */
  cardRailLine: {
    position: 'absolute',
    left: RAIL_INSET - CARD_INSET - 0.5,
    top: -5,
    width: 1,
    backgroundColor: RAIL_COLOR,
  } as ViewStyle,
  /** 贯通段：跨过卡片间距延续到下一行 */
  cardRailThrough: {
    bottom: -8,
  } as ViewStyle,
  /** 组尾段：止于尾卡底 */
  cardRailEnd: {
    bottom: 2,
  } as ViewStyle,
  stateCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: 6,
  } as ViewStyle,
  stateTitle: {
    fontSize: fs(16),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  stateText: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    textAlign: 'center',
  } as TextStyle,
  stateActionHit: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  } as ViewStyle,
  stateAction: {
    fontSize: fs(14),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  /** 底部中央共享相机底座（My Catches 冻结稿：Camera 居中，全局不参与滚动） */
  fab: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  } as ViewStyle,
});
