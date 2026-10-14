import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
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
import { AppIcon } from '../../components/icons/AppIcon';
import { CatchHubTab, StackNavigationProp } from '../../navigation/types';
import { fs, spacing } from '../../constants/tokens';
import { coreColors } from '../../constants/coreUi';
import { MorningLakeScene } from '../../components/coreui';
import { PressableScale } from '../../components/ui/PressableScale';
import { MyCatchesTab } from './MyCatchesTab';

type CatchHubNavigationProp = StackNavigationProp;
type CatchHubRoute = RouteProp<
  { MyCatches: { tab?: CatchHubTab; speciesQuery?: string } | undefined },
  'MyCatches'
>;

/**
 * 我的鱼获 Hub（My Catches V2 容器 + 头部合同）：
 * - 常规：`← 我的鱼获 [Search] [Filter]`；
 * - Search Mode：`← [搜索鱼种、地点或日期] 取消`，键盘自动打开，标题让位（Search Spec §2）；
 * - Filter Action：展开/收起 F1；任一非默认筛选生效时显示低权重状态提示点（F1 Spec §5）。
 * 分享 / 成长模块当前隐藏，仅保留鱼获列表；tab 参数保留类型兼容、不再分流。
 */
export const CatchHubScreen: React.FC = () => {
  const navigation = useNavigation<CatchHubNavigationProp>();
  const route = useRoute<CatchHubRoute>();
  const insets = useSafeAreaInsets();

  /* 搜索 / 筛选头部状态（lifted 供头部与列表共享） */
  const [searchMode, setSearchMode] = useState(false);
  /** 鱼种详情「我的{鱼种}」进入：预置鱼种筛选（Species Detail §7.3） */
  const [query, setQuery] = useState(route.params?.speciesQuery ?? '');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterActive, setFilterActive] = useState(false);

  useEffect(() => {
    if (typeof route.params?.speciesQuery === 'string') {
      setQuery(route.params.speciesQuery);
    }
  }, [route.params]);

  const exitSearch = useCallback(() => {
    // 取消：退出 Search Mode、清 query、关键盘；Filter 条件保留（Search Spec §11）
    setSearchMode(false);
    setQuery('');
    Keyboard.dismiss();
  }, []);

  /* Android Back：第一次收键盘，再次退出 Search Mode（Search Spec §14） */
  useEffect(() => {
    if (!searchMode) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      exitSearch();
      return true;
    });
    return () => handler.remove();
  }, [searchMode, exitSearch]);

  const renderBack = () => (
    /* Icon Action V1 / NAVIGATION：44dp 目标 + 22dp glyph，无缩放按压 */
    <Pressable
      onPress={() => navigation.goBack()}
      style={headerStyles.hit}
      accessibilityRole="button"
      accessibilityLabel="返回"
    >
      <AppIcon name="back" size={22} color={coreColors.deepLakeBlue} />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      {/* v2 列表页：不盖全屏白纱，场景直接呈现；白蒙版只保留在鱼获卡片上 */}
      <MorningLakeScene level="data" salience={1} />

      {/* 顶栏：常规 = 返回 + 标题 + Search/Filter；Search Mode = 返回 + 搜索框 + 取消 */}
      <View
        style={[
          headerStyles.bar,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm },
        ]}
      >
        {renderBack()}
        {searchMode ? (
          <>
            {/* Search Bar 视觉合同：44dp / radius 14 / Mist Glass / 1dp 湖灰边（聚焦叠极轻 Lake Blue）/ 15sp */}
            <View style={headerStyles.searchBar}>
              <AppIcon name="search" size={19} color={coreColors.deepLakeBlue} />
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
                  /* × 仅清 query，保持 Search Mode 与键盘（Search Spec §11） */
                  onPress={() => setQuery('')}
                  scaleTo={0.9}
                  style={headerStyles.clearHit}
                  accessibilityLabel="清除搜索词"
                >
                  <AppIcon name="clear_field" size={18} color={coreColors.mistBlueGray} />
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
                <AppIcon name="search" size={21} color={coreColors.deepLakeBlue} />
              </PressableScale>
              <PressableScale
                onPress={() => setFilterOpen((value) => !value)}
                scaleTo={0.9}
                style={headerStyles.hit}
                accessibilityLabel="筛选"
              >
                <AppIcon
                  name="filter"
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
          </>
        )}
      </View>

      {/* 鱼获列表（My Catches V2：摘要 → F1 → Timeline → 相机入口） */}
      <View style={styles.body}>
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
    /* Search Mode 常驻聚焦：1dp 湖灰底 + 极轻 Lake Blue 聚焦环（Search Spec §3） */
    borderColor: 'rgba(77,158,161,0.35)',
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
  body: {
    flex: 1,
    marginTop: spacing.xs,
  } as ViewStyle,
});
