import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp, RootStackParamList } from '../../../navigation/types';
import { useCatchArchive } from '../../../contexts/CatchContext';
import { catchMemoryService, CatchMemoryData } from '../../../services/catchMemoryService';
import { coreColors, PAGE_MARGIN } from '../../../constants/coreUi';
import { fs, spacing } from '../../../constants/tokens';
import { ScreenHeader } from '../../../components';
import { MorningLakeScene } from '../../../components/coreui';
import {
  buildEntries,
  groupByMonthAndDay,
  resolveGrowthMarks,
  sortNewestFirst,
} from '../../../utils/myCatchesTimeline';
import { FishRecordRowCard } from './FishRecordRowCard';

type CatchDayRoute = RouteProp<RootStackParamList, 'CatchDay'>;

/**
 * 当天鱼获详情（Timeline Scroll Spec §4：单日 >10 条时「查看全部」进入）。
 * 只展示该日期全部 FishRecord，保留日期、地点摘要与 Growth Mark；
 * 停留在同一清晨湖畔世界（BG_DATA），返回后由主 Timeline 保持滚动位置与折叠状态。
 */
export const CatchDayScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp>();
  const route = useRoute<CatchDayRoute>();
  const { catches } = useCatchArchive();
  const insets = useSafeAreaInsets();
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const dayKey = route.params?.dayKey ?? '';

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await Promise.all(
        catches.map(async (item) => [item.id, await catchMemoryService.load(item.id)] as const),
      );
      if (mounted) {
        setMemories(Object.fromEntries(list));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [catches]);

  const all = useMemo(() => buildEntries(catches, memories), [catches, memories]);
  const marks = useMemo(() => resolveGrowthMarks(all), [all]);

  const day = useMemo(() => {
    for (const month of groupByMonthAndDay(all)) {
      for (const item of month.days) {
        if (item.key === dayKey) {
          return item;
        }
      }
    }
    return null;
  }, [all, dayKey]);

  const entries = useMemo(
    () => (day ? sortNewestFirst(day.entries) : []),
    [day],
  );

  const first = day?.entries[0];
  const title = first?.date
    ? `${first.month}月${first.day}日${first.year !== new Date().getFullYear() ? ` · ${first.year}` : ''}`
    : '当天鱼获';
  const summary = day?.summary ?? '';

  return (
    <View style={styles.screen}>
      <MorningLakeScene level="data" />
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        {entries.map((entry) => (
          <View key={entry.catch.id} style={styles.cardWrap}>
            <FishRecordRowCard
              entry={entry}
              mark={marks.get(entry.catch.id)}
              onPress={() =>
                navigation.navigate('CatchDetail', {
                  catchId: entry.catch.id,
                  initialCatch: entry.catch,
                })
              }
            />
          </View>
        ))}
        {entries.length === 0 ? (
          <Text style={styles.empty}>这一天没有可见鱼获</Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: PAGE_MARGIN,
    paddingTop: spacing.sm,
  } as ViewStyle,
  summary: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    marginBottom: spacing.md,
  } as TextStyle,
  cardWrap: {
    marginBottom: 10,
  } as ViewStyle,
  empty: {
    textAlign: 'center',
    color: coreColors.mistBlueGray,
    fontSize: fs(13),
    paddingVertical: 40,
  } as TextStyle,
});
