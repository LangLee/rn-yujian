import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '../../navigation/types';
import { fs, font, spacing } from '../../constants/tokens';
import { coreColors } from '../../constants/coreUi';
import { MorningLakeScene } from '../../components/coreui';
import { PressableScale } from '../../components/ui/PressableScale';
import { MyCatchesTab } from './MyCatchesTab';
import { ShareHomeTab } from './ShareHomeTab';
import { GrowthTab } from './GrowthTab';

export type CatchHubTab = 'catches' | 'share' | 'growth';

type CatchHubNavigationProp = StackNavigationProp;
type CatchHubRoute = RouteProp<{ MyCatches: { tab?: CatchHubTab } | undefined }, 'MyCatches'>;

const TABS: { key: CatchHubTab; label: string }[] = [
  { key: 'catches', label: '我的鱼获' },
  { key: 'share', label: '鱼获分享' },
  { key: 'growth', label: '成长历程' },
];

/**
 * 我的鱼获 Hub（P20 容器 + My Catches V2 头部合同）：
 * - 常规：`← 我的鱼获 [Search] [Filter]`（Search/Filter 仅我的鱼获 Tab 出现）；
 * - Search Mode：`← [搜索鱼种、地点或日期] 取消`，键盘自动打开，标题让位（Search Spec §2）；
 * - Filter Action：展开/收起 F1；任一非默认筛选生效时显示低权重状态提示点（F1 Spec §5）。
 * 三个 Tab 常驻挂载保留各自浏览状态，切换只做显隐。
 */
export const CatchHubScreen: React.FC = () => {
  const navigation = useNavigation<CatchHubNavigationProp>();
  const route = useRoute<CatchHubRoute>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<CatchHubTab>(route.params?.tab ?? 'catches');

  /* 我的鱼获 Tab 的搜索 / 筛选头部状态（ lifted 供头部与 Tab 共享） */
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterActive, setFilterActive] = useState(false);

  useEffect(() => {
    if (route.params?.tab) {
      setTab(route.params.tab);
    }
  }, [route.params]);

  const exitSearch = useCallback(() => {
    // 取消：退出 Search Mode、清 query、关键盘；Filter 条件保留（Search Spec §11）
    setSearchMode(false);
    setQuery('');
  }, []);

  /* Android Back：Search Mode 下先退出搜索再返回（Search Spec §14） */
  useEffect(() => {
    if (!searchMode) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSearch();
      return true;
    });
    return () => handler.remove();
  }, [searchMode, exitSearch]);

  const showSearchHeader = searchMode && tab === 'catches';

  const renderBack = () => (
    /* Icon Action V1 / NAVIGATION：44dp 目标 + 22dp glyph，无缩放按压 */
    <Pressable
      onPress={() => navigation.goBack()}
      style={headerStyles.hit}
      accessibilityRole="button"
      accessibilityLabel="返回"
    >
      <Icon name="chevron-back" size={22} color={coreColors.deepLakeBlue} />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <MorningLakeScene level="data" />

      {/* 顶栏：常规 = 返回 + 标题 + Search/Filter；Search Mode = 返回 + 搜索框 + 取消 */}
      <View
        style={[
          headerStyles.bar,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm },
        ]}
      >
        {renderBack()}
        {showSearchHeader ? (
          <>
            {/* Search Bar 视觉合同：44dp / radius 14 / Mist Glass / 1dp 湖灰边 / 15sp */}
            <View style={headerStyles.searchBar}>
              <Icon name="search" size={19} color={coreColors.deepLakeBlue} />
              <TextInput
                style={headerStyles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="搜索鱼种、地点或日期"
                placeholderTextColor={coreColors.mistBlueGray}
                autoFocus
                returnKeyType="search"
                submitBehavior="submit"
              />
              {query.length > 0 ? (
                <PressableScale
                  onPress={() => setQuery('')}
                  scaleTo={0.9}
                  style={headerStyles.clearHit}
                  accessibilityLabel="清除搜索词"
                >
                  <Icon name="close-circle" size={18} color={coreColors.mistBlueGray} />
                </PressableScale>
              ) : null}
            </View>
            <PressableScale onPress={exitSearch} scaleTo={0.94} style={headerStyles.cancelHit}>
              <Text style={headerStyles.cancelText}>取消</Text>
            </PressableScale>
          </>
        ) : (
          <>
            <View style={headerStyles.titleBlock}>
              <Text style={headerStyles.title}>我的鱼获</Text>
            </View>
            {tab === 'catches' ? (
              <View style={headerStyles.actions}>
                <PressableScale
                  onPress={() => {
                    setSearchMode(true);
                    setFilterOpen(false);
                  }}
                  scaleTo={0.9}
                  style={headerStyles.hit}
                  accessibilityLabel="搜索"
                >
                  <Icon name="search" size={21} color={coreColors.deepLakeBlue} />
                </PressableScale>
                <PressableScale
                  onPress={() => setFilterOpen((value) => !value)}
                  scaleTo={0.9}
                  style={headerStyles.hit}
                  accessibilityLabel="筛选"
                >
                  <Icon
                    name="funnel-outline"
                    size={21}
                    color={
                      filterOpen || filterActive
                        ? coreColors.deepLakeBlue
                        : coreColors.lakeBlue
                    }
                  />
                  {/* 非默认筛选生效：低权重状态提示点（面板未展开时显示） */}
                  {filterActive && !filterOpen ? <View style={headerStyles.filterDot} /> : null}
                </PressableScale>
              </View>
            ) : (
              <View style={headerStyles.actionsPlaceholder} />
            )}
          </>
        )}
      </View>

      {/* 三段式切换（Search Mode 保持可用，便于结果与分享/成长互切） */}
      <View
        style={[
          styles.segmentBar,
          {
            marginTop: spacing.md,
            backgroundColor: 'rgba(255,255,255,0.60)',
            borderColor: 'rgba(255,255,255,0.55)',
          },
        ]}
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <PressableScale
              key={item.key}
              onPress={() => setTab(item.key)}
              scaleTo={0.96}
              style={styles.segmentHit}
            >
              <View style={styles.segment}>
                {/* Android：backgroundColor 在 transparent ↔ 色值间切换会重建背景 drawable 丢圆角，
                    改为常驻圆角背景层并用 opacity 显隐（opacity 变化不重建 drawable） */}
                <View
                  style={[
                    styles.segmentPill,
                    {
                      backgroundColor: '#FFFFFF',
                      opacity: active ? 1 : 0,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? coreColors.deepLakeBlue : coreColors.lakeBlue },
                    active && styles.segmentTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                {active ? <View style={styles.segmentUnderline} /> : null}
              </View>
            </PressableScale>
          );
        })}
      </View>

      {/* Tab 内容（常驻挂载，保留各自滚动与筛选状态） */}
      <View style={styles.body}>
        <View style={[styles.tabPane, tab !== 'catches' && styles.tabPaneHidden]}>
          <MyCatchesTab
            searchMode={searchMode}
            query={query}
            onQueryChange={setQuery}
            onEditFilterFromSearch={() => {
              // 点击 Filter Summary：返回原页面并展开 F1，Search query 保留（§12）
              setSearchMode(false);
              setFilterOpen(true);
            }}
            filterOpen={filterOpen}
            onFilterActiveChange={setFilterActive}
          />
        </View>
        <View style={[styles.tabPane, tab !== 'share' && styles.tabPaneHidden]}>
          <ShareHomeTab />
        </View>
        <View style={[styles.tabPane, tab !== 'growth' && styles.tabPaneHidden]}>
          <GrowthTab />
        </View>
      </View>
    </View>
  );
};

const headerStyles = StyleSheet.create({
  /* TITLE_ONLY V1：min 64dp、内边距 16dp；返回与 Search/Filter 命中区 44dp */
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 64,
  } as ViewStyle,
  hit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  titleBlock: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
  } as ViewStyle,
  title: {
    /* TITLE_ONLY：28sp·Medium 500·行高 34sp·左对齐·无衬线 */
    fontSize: fs(28),
    lineHeight: fs(34),
    fontWeight: '500',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  actionsPlaceholder: {
    minWidth: 40,
    minHeight: 40,
  } as ViewStyle,
  /* Search Mode */
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(116,136,151,0.22)',
    paddingHorizontal: 12,
    marginHorizontal: spacing.xs,
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
    paddingVertical: 0,
  } as TextStyle,
  clearHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  cancelHit: {
    paddingLeft: spacing.sm,
    paddingVertical: 8,
    paddingRight: 2,
  } as ViewStyle,
  cancelText: {
    fontSize: fs(15),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: coreColors.morningGold,
  } as ViewStyle,
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.page,
    borderRadius: 26,
    borderWidth: 1,
    padding: 4,
  } as ViewStyle,
  segmentHit: {
    flex: 1,
  } as ViewStyle,
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
  } as ViewStyle,
  segmentPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  } as ViewStyle,
  segmentText: {
    fontSize: fs(15),
    fontWeight: '500',
  } as TextStyle,
  segmentTextActive: {
    fontWeight: '700',
  } as TextStyle,
  segmentUnderline: {
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: coreColors.morningGold,
    marginTop: 3,
  } as ViewStyle,
  body: {
    flex: 1,
    marginTop: spacing.lg,
  } as ViewStyle,
  tabPane: {
    flex: 1,
  } as ViewStyle,
  tabPaneHidden: {
    display: 'none',
  } as ViewStyle,
});
