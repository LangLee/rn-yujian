import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppIcon } from '../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { RemoteCatch } from '../types/models';
import { palette } from '../constants/colors';
import { font, fs, radius, spacing } from '../constants/tokens';
import { dayKeyOf, formatLength, formatWeight } from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { usePreferences } from '../contexts/PreferencesContext';
import { MorningLakeScene } from '../components/coreui';
import { RemoteImage } from '../components/RemoteImage';
import { PressableScale } from '../components/ui/PressableScale';
import { FishGlyph } from '../components/ui/FishGlyph';
import { ScreenHeader } from '../components';

type CalendarScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Calendar'>;

type ViewMode = 'month' | 'year';

/** 设计稿冻结值：星期一为首列 */
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** MorningGold —— 仅用于已选日/月与有意义记录（Gold Is Rare） */
const GOLD = '#D6A541';
/** 深青绿：分段选中胶囊 / 摘要鱼 glyph */
const TEAL_DEEP = '#3E6E75';
/** 日历鱼标记 / 时间轴圆点 teal */
const TEAL_MARKER = '#4E838A';

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/**
 * 记录日历 V2（design/pages/record_date/v2 · FROZEN）：
 * 月视图 = 月份导航 → 居中月/年分段 → 轻摘要 → 月历（淡金细边+浅底选中、
 * 1条=1图标上限5、第6条起×N 汇总）→ 当日时间线；
 * 年视图 = 年份导航 → 分段 → 全年统计 → 4×3 月份宫格（无记录月显示 0）→ 选中月按天归档。
 */
export const RecordCalendarScreen: React.FC = () => {
  const navigation = useNavigation<CalendarScreenNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const { lengthUnit, weightUnit } = usePreferences();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ViewMode>('month');
  const today = useMemo(() => new Date(), []);
  const todayKey = dayKeyOf(today);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  // 时间线需要长度/重量/地点记忆
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

  // 去重自然日 → FishRecord 列表（recordDayCount / catchCount 真值口径）
  const dayMap = useMemo(() => {
    const map = new Map<string, RemoteCatch[]>();
    for (const item of catches) {
      const key = dayKeyOf(item.capturedAt);
      if (!key) {
        continue;
      }
      const list = map.get(key);
      if (list) {
        list.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  }, [catches]);

  // 月视图轻摘要：连续记录 / 本周 / 本月（截至今天）
  const monthSummary = useMemo(() => {
    let streak = 0;
    const cursorDate = new Date(today);
    if (!dayMap.has(dayKeyOf(cursorDate))) {
      cursorDate.setDate(cursorDate.getDate() - 1);
    }
    while (dayMap.has(dayKeyOf(cursorDate))) {
      streak += 1;
      cursorDate.setDate(cursorDate.getDate() - 1);
    }
    let weekDays = 0;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      if (dayMap.has(dayKeyOf(d))) {
        weekDays += 1;
      }
    }
    let currentMonthDays = 0;
    dayMap.forEach((_, key) => {
      if (key.startsWith(`${today.getFullYear()}-${pad2(today.getMonth() + 1)}`)) {
        currentMonthDays += 1;
      }
    });
    return { streak, weekDays, currentMonthDays };
  }, [dayMap, today]);

  // 年视图统计：全年记录日数 / 鱼获总次数 / 平均每月（当年按已过月数作分母）
  const yearSummary = useMemo(() => {
    let days = 0;
    let count = 0;
    const species = new Set<string>();
    dayMap.forEach((items, key) => {
      if (!key.startsWith(`${cursor.year}-`)) {
        return;
      }
      days += 1;
      count += items.length;
      items.forEach((item) => {
        if (item.speciesId) {
          species.add(item.speciesId);
        }
      });
    });
    const monthsElapsed =
      cursor.year === today.getFullYear() ? today.getMonth() + 1 : 12;
    const avg = count / Math.max(monthsElapsed, 1);
    return { days, count, speciesCount: species.size, avg };
  }, [dayMap, cursor.year, today]);

  // 月历网格（真实 Gregorian：前后月补位灰显，周一为首列，最多 6 周）
  const monthGrid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cells: { date: Date; inMonth: boolean }[] = [];
    const prevDays = new Date(cursor.year, cursor.month, 0).getDate();
    for (let i = offset - 1; i >= 0; i -= 1) {
      cells.push({ date: new Date(cursor.year, cursor.month - 1, prevDays - i), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(cursor.year, cursor.month, day), inMonth: true });
    }
    let nextDay = 1;
    while (cells.length % 7 !== 0 || cells.length < 35) {
      cells.push({ date: new Date(cursor.year, cursor.month + 1, nextDay), inMonth: false });
      nextDay += 1;
    }
    return cells;
  }, [cursor]);

  const selectedCatches = useMemo(() => dayMap.get(selectedDay) ?? [], [dayMap, selectedDay]);
  const selectedDate = useMemo(() => new Date(`${selectedDay}T00:00:00`), [selectedDay]);

  // 年视图：选中月的按天聚合，最新在前
  const yearMonthDays = useMemo(() => {
    const prefix = `${cursor.year}-${pad2(cursor.month + 1)}`;
    const entries: { key: string; date: Date; items: RemoteCatch[] }[] = [];
    dayMap.forEach((items, key) => {
      if (key.startsWith(prefix)) {
        entries.push({ key, date: new Date(`${key}T00:00:00`), items });
      }
    });
    entries.sort((a, b) => b.key.localeCompare(a.key));
    return entries;
  }, [dayMap, cursor]);

  // 空日期的轻引导：最近的相邻有记录日（双向就近，不新增拍照 CTA）
  const nearestRecordedDay = useMemo<string | null>(() => {
    if (selectedCatches.length > 0) {
      return null;
    }
    const base = new Date(`${selectedDay}T00:00:00`);
    for (let offset = 1; offset <= 60; offset += 1) {
      for (const direction of [-1, 1]) {
        const d = new Date(base);
        d.setDate(base.getDate() + direction * offset);
        const key = dayKeyOf(d);
        if (dayMap.has(key)) {
          return key;
        }
      }
    }
    return null;
  }, [dayMap, selectedCatches.length, selectedDay]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const accent = profile.surface.accent;
  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const selectedSpeciesCount = new Set(
    selectedCatches.map((item) => item.speciesId).filter(Boolean),
  ).size;

  /** 选择日期并同步聚焦其年月（含跨月补位格） */
  const selectDay = (key: string) => {
    const d = new Date(`${key}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      setCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
    setSelectedDay(key);
  };

  /** 目标年月内保留同日选择，越界则收敛到月末（交互合同：不留无效 selectedDate） */
  const clampSelection = (year: number, month: number, key: string): string => {
    const d = new Date(`${key}T00:00:00`);
    if (d.getFullYear() === year && d.getMonth() === month) {
      return key;
    }
    const days = new Date(year, month + 1, 0).getDate();
    const day = Math.min(Math.max(d.getDate(), 1), days);
    return dayKeyOf(new Date(year, month, day));
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const year = next.getFullYear();
    const month = next.getMonth();
    setCursor({ year, month });
    setSelectedDay((previous) => clampSelection(year, month, previous));
  };

  const shiftYear = (delta: number) => {
    const year = cursor.year + delta;
    setCursor((previous) => ({ ...previous, year }));
    setSelectedDay((previous) => clampSelection(year, cursor.month, previous));
  };

  const goToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDay(todayKey);
    setMode('month');
  };

  return (
    <View style={styles.screen}>
      {/* BG_DATA 冻结档（record_date_v2 → BG_DATA）：存在感 48%，高密度日期数据保持主视觉 */}
      <MorningLakeScene level="data" />
      <ScreenHeader
        title="记录"
        onBack={() => navigation.goBack()}
        right={
          <PressableScale onPress={goToday} scaleTo={0.95} style={styles.todayHit}>
            <Text style={[styles.todayText, { color: textPrimary }]}>今天</Text>
          </PressableScale>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 时间导航：‹ 2026年9月 ›（月）/ ‹ 2026年 ›（年） */}
        <View style={styles.timeNavRow}>
          <PressableScale onPress={() => (mode === 'month' ? shiftMonth(-1) : shiftYear(-1))} scaleTo={0.9} style={styles.navArrow}>
            <AppIcon name="back" size={18} color={textPrimary} />
          </PressableScale>
          <Text style={[styles.timeNavLabel, { color: textPrimary }]}>
            {mode === 'month' ? `${cursor.year}年${cursor.month + 1}月` : `${cursor.year}年`}
          </Text>
          <PressableScale onPress={() => (mode === 'month' ? shiftMonth(1) : shiftYear(1))} scaleTo={0.9} style={styles.navArrow}>
            <AppIcon name="chevron_right" size={18} color={textPrimary} />
          </PressableScale>
        </View>

        {/* 月 / 年 分段：标题行下方水平居中，同一页面状态互切 */}
        <View style={styles.segmentRow}>
          <ModeSegment
            mode={mode}
            glass={profile.surface.glass}
            glassBorder={profile.surface.glassBorder}
            textSecondary={textSecondary}
            onChange={setMode}
          />
        </View>

        {mode === 'month' ? (
          <>
            {/* 轻摘要条：鱼 glyph + 连续记录 / 本周 / 本月 */}
            <SummaryStrip
              glass={profile.surface.glass}
              glassBorder={profile.surface.glassBorder}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              cells={[
                { label: '连续记录', value: monthSummary.streak, unit: '天' },
                { label: '本周', value: monthSummary.weekDays, unit: '天' },
                { label: '本月', value: monthSummary.currentMonthDays, unit: '天' },
              ]}
            />

            {/* 月历（GLASS_A）：淡金细边 + 浅底选中日，鱼标记 1条=1图标上限5、6条起 ×N */}
            <View
              style={[
                styles.calendarCard,
                { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
              ]}
            >
              <View style={styles.weekHeadRow}>
                {WEEK_LABELS.map((label) => (
                  <Text key={label} style={[styles.weekLabel, { color: textSecondary }]}>
                    {label}
                  </Text>
                ))}
              </View>
              {chunkDays(monthGrid).map((week, weekIndex) => (
                <View key={weekIndex} style={styles.weekRow}>
                  {week.map((cell, dayIndex) => {
                    const key = dayKeyOf(cell.date);
                    const count = dayMap.get(key)?.length ?? 0;
                    const isSelected = key === selectedDay;
                    const isToday = key === todayKey;
                    return (
                      <PressableScale
                        key={`${key}-${dayIndex}`}
                        onPress={() => selectDay(key)}
                        scaleTo={0.9}
                        style={styles.dayCell}
                      >
                        <View
                          style={[
                            styles.dayInner,
                            isSelected && styles.daySelected,
                            isToday && !isSelected && [styles.dayToday, { borderColor: accent }],
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              { color: cell.inMonth ? textPrimary : textSecondary },
                              !cell.inMonth && styles.dayTextFaded,
                              isSelected && styles.dayTextSelected,
                            ]}
                          >
                            {cell.date.getDate()}
                          </Text>
                          <View style={styles.markerSpace}>
                            {count > 0 && count <= 5 ? (
                              <View style={styles.markerRow}>
                                {Array.from({ length: count }, (_, i) => (
                                  <FishGlyph key={i} size={8} color={TEAL_MARKER} />
                                ))}
                              </View>
                            ) : count > 5 ? (
                              <Text style={styles.markerCount}>×{count}</Text>
                            ) : null}
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* 选中日时间线（GLASS_B 大卡 + 每条鱼获小卡） */}
            <View
              style={[
                styles.timelinePanel,
                { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
              ]}
            >
              <Text style={[styles.timelineTitle, { color: textPrimary }]}>
                {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日{' '}
                {WEEKDAY_CN[selectedDate.getDay()]}
              </Text>
              {selectedCatches.length > 0 ? (
                <Text style={[styles.timelineSub, { color: textSecondary }]}>
                  {selectedCatches.length}次鱼获 · {selectedSpeciesCount}种鱼
                </Text>
              ) : null}
              {selectedCatches.length === 0 ? (
                <View style={styles.timelineEmpty}>
                  <Text style={[styles.timelineEmptyText, { color: textSecondary }]}>
                    这一天暂无鱼获
                  </Text>
                  {nearestRecordedDay ? (
                    <PressableScale
                      onPress={() => selectDay(nearestRecordedDay)}
                      scaleTo={0.95}
                      style={styles.timelineEmptyHint}
                    >
                      <Text style={[styles.timelineEmptyHintText, { color: accent }]}>
                        最近的鱼获在{' '}
                        {new Date(`${nearestRecordedDay}T00:00:00`).getMonth() + 1}月
                        {new Date(`${nearestRecordedDay}T00:00:00`).getDate()}日
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              ) : (
                <View style={styles.timeline}>
                  {selectedCatches.map((item, index) => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      memory={memories[item.id]}
                      accessToken={session?.accessToken ?? null}
                      lengthUnit={lengthUnit}
                      weightUnit={weightUnit}
                      textPrimary={textPrimary}
                      textSecondary={textSecondary}
                      isLast={index === selectedCatches.length - 1}
                      onPress={() =>
                        navigation.navigate('CatchDetail', { catchId: item.id, initialCatch: item })
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* 年度统计条：全年记录日数 / 鱼获总次数 / 平均每月（标题与值两行居中） */}
            <SummaryStrip
              stacked
              glass={profile.surface.glass}
              glassBorder={profile.surface.glassBorder}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              cells={[
                { label: '全年记录', value: yearSummary.days, unit: '天' },
                { label: '鱼获总次数', value: yearSummary.count, unit: '次' },
                {
                  label: '平均每月',
                  value: yearSummary.avg >= 10 || yearSummary.avg === 0
                    ? Math.round(yearSummary.avg)
                    : Math.round(yearSummary.avg * 10) / 10,
                  unit: '次',
                },
              ]}
            />

            {/* 4×3 月份宫格：月名 / X天·Y次（无记录月显示 0）、淡金细边+浅底选中、本月徽章 */}
            <View style={styles.monthIndexGrid}>
              {Array.from({ length: 12 }, (_, index) => index).map((monthIndex) => {
                const prefix = `${cursor.year}-${pad2(monthIndex + 1)}`;
                let days = 0;
                let count = 0;
                dayMap.forEach((items, key) => {
                  if (key.startsWith(prefix)) {
                    days += 1;
                    count += items.length;
                  }
                });
                const selectedMonth = cursor.month === monthIndex;
                const isNow = isCurrentMonth && today.getMonth() === monthIndex;
                return (
                  <PressableScale
                    key={monthIndex}
                    onPress={() => setCursor((c) => ({ ...c, month: monthIndex }))}
                    scaleTo={0.93}
                    style={styles.monthIndexHit}
                  >
                    <View
                      style={[
                        styles.monthIndexCell,
                        { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
                        selectedMonth && styles.monthIndexSelected,
                        isNow && !selectedMonth && { borderColor: accent },
                        days === 0 && styles.monthIndexDim,
                      ]}
                    >
                      <View style={styles.monthIndexTop}>
                        <Text
                          style={[
                            styles.monthIndexLabel,
                            { color: selectedMonth ? GOLD : textPrimary },
                          ]}
                        >
                          {monthIndex + 1}月
                        </Text>
                        {isNow ? (
                          <View style={styles.monthIndexBadge}>
                            <Text style={styles.monthIndexBadgeText}>本月</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.monthIndexCounts}>
                        <Text style={[styles.monthIndexMeta, { color: textSecondary }]}>
                          {days}天
                        </Text>
                        <Text style={[styles.monthIndexMeta, { color: textSecondary }]}>
                          {count}次
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* 选中月按天归档列表：金色装饰短线 + 最新在前，点击进入该日 */}
            <View style={styles.yearListTitleRow}>
              <View style={styles.yearListAccent} />
              <Text style={[styles.timelineTitle, { color: textPrimary }]}>
                {cursor.month + 1}月记录
              </Text>
            </View>
            <Text style={[styles.timelineSub, { color: textSecondary }]}>
              {yearMonthDays.length}天有鱼获 ·{' '}
              {yearMonthDays.reduce((total, entry) => total + entry.items.length, 0)}次鱼获 ·{' '}
              {
                new Set(
                  yearMonthDays
                    .flatMap((entry) => entry.items.map((item) => item.speciesId))
                    .filter(Boolean),
                ).size
              }
              种鱼
            </Text>
            {yearMonthDays.length === 0 ? (
              <Text style={[styles.timelineEmptyText, styles.yearListEmpty, { color: textSecondary }]}>
                这个月还没有留下鱼获
              </Text>
            ) : (
              yearMonthDays.map((entry) => {
                const speciesNames = Array.from(
                  new Set(entry.items.map((item) => item.speciesName).filter(Boolean)),
                ).slice(0, 3);
                const thumb = entry.items[0];
                return (
                  <PressableScale
                    key={entry.key}
                    onPress={() => {
                      setMode('month');
                      selectDay(entry.key);
                    }}
                    scaleTo={0.98}
                    style={styles.dayAggHit}
                  >
                    <View
                      style={[
                        styles.dayAggRow,
                        { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
                      ]}
                    >
                      <View style={styles.dayAggDate}>
                        <Text style={[styles.dayAggDay, { color: textPrimary }]}>
                          {entry.date.getMonth() + 1}.{entry.date.getDate()}
                        </Text>
                        <Text style={[styles.dayAggMeta, { color: textSecondary }]}>
                          {WEEKDAY_CN[entry.date.getDay()]} · {entry.items.length}次
                        </Text>
                      </View>
                      <View style={styles.dayAggSpecies}>
                        <Text
                          style={[styles.dayAggSpeciesText, { color: textPrimary }]}
                          numberOfLines={2}
                        >
                          {speciesNames.join(' · ') || '确认中的鱼'}
                        </Text>
                      </View>
                      {thumb?.imageUrl ? (
                        <RemoteImage
                          url={thumb.imageUrl}
                          authToken={session?.accessToken ?? null}
                          style={styles.dayAggThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.dayAggThumb, styles.dayAggThumbEmpty]}>
                          <FishGlyph size={14} color={accent} />
                        </View>
                      )}
                      <AppIcon name="chevron_right" size={15} color={textSecondary} />
                    </View>
                  </PressableScale>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const hapticSelection = () => {
  // 轻量模式切换 S1（17.22：月/年切换可选）
  import('../utils/haptics').then(({ haptics }) => haptics.selection());
};

/** 月 / 年 模式切换：标题行下方居中，玻璃胶囊容器 + 深青绿选中胶囊 */
const ModeSegment: React.FC<{
  mode: ViewMode;
  glass: string;
  glassBorder: string;
  textSecondary: string;
  onChange: (mode: ViewMode) => void;
}> = ({ mode, glass, glassBorder, textSecondary, onChange }) => (
  <View style={[styles.segment, { backgroundColor: glass, borderColor: glassBorder }]}>
    {(['month', 'year'] as ViewMode[]).map((value) => (
      <PressableScale
        key={value}
        onPress={() => {
          onChange(value);
          hapticSelection();
        }}
        scaleTo={0.95}
      >
        <View style={styles.segmentCell}>
          {/* Android：backgroundColor 在无 ↔ 有间切换会重建背景 drawable 丢圆角，
              改为常驻圆角背景层并用 opacity 显隐（opacity 变化不重建 drawable） */}
          <View style={[styles.segmentCellPill, { opacity: mode === value ? 1 : 0 }]} />
          <Text style={[styles.segmentText, { color: mode === value ? '#FFFFFF' : textSecondary }]}>
            {value === 'month' ? '月' : '年'}
          </Text>
        </View>
      </PressableScale>
    ))}
  </View>
);

/** 轻摘要条：teal 鱼 glyph + 竖线分隔的数据组；stacked = 标题与值两行水平居中 */
const SummaryStrip: React.FC<{
  glass: string;
  glassBorder: string;
  textPrimary: string;
  textSecondary: string;
  stacked?: boolean;
  cells: { label: string; value: number; unit: string }[];
}> = ({ glass, glassBorder, textPrimary, textSecondary, stacked = false, cells }) => (
  <View style={[styles.summaryBar, { backgroundColor: glass, borderColor: glassBorder }]}>
    <View style={styles.summaryGlyph}>
      <FishGlyph size={20} color={TEAL_DEEP} />
    </View>
    {cells.map((cell, index) => (
      <React.Fragment key={cell.label}>
        {index > 0 ? <View style={[styles.summaryDivider, { backgroundColor: glassBorder }]} /> : null}
        <View style={styles.summaryCell}>
          {stacked ? (
            <>
              <Text style={[styles.summaryLabel, { color: textSecondary }]}>{cell.label}</Text>
              <Text style={[styles.summaryValueStack, { color: textPrimary }]}>
                {cell.value}
                <Text style={[styles.summaryUnit, { color: textSecondary }]}> {cell.unit}</Text>
              </Text>
            </>
          ) : (
            <Text style={[styles.summaryText, { color: textSecondary }]}>
              {cell.label}{' '}
              <Text style={[styles.summaryValue, { color: textPrimary }]}>{cell.value}</Text> {cell.unit}
            </Text>
          )}
        </View>
      </React.Fragment>
    ))}
  </View>
);

const TimelineRow: React.FC<{
  item: RemoteCatch;
  memory?: CatchMemoryData;
  accessToken: string | null;
  lengthUnit: 'cm' | 'inch';
  weightUnit: 'kg' | 'jin' | 'lb';
  textPrimary: string;
  textSecondary: string;
  isLast: boolean;
  onPress: () => void;
}> = ({ item, memory, accessToken, lengthUnit, weightUnit, textPrimary, textSecondary, isLast, onPress }) => {
  const { profile } = useTheme();
  const time = new Date(item.capturedAt);
  const timeLabel = Number.isNaN(time.getTime())
    ? ''
    : `${`0${time.getHours()}`.slice(-2)}:${`0${time.getMinutes()}`.slice(-2)}`;
  const lengthLabel = formatLength(memory?.lengthCm ?? null, lengthUnit);
  const weightLabel = formatWeight(memory?.weightKg ?? null, weightUnit);
  const location = memory?.location?.trim() ?? null;
  const metaBits = [lengthLabel, weightLabel].filter(Boolean).join(' · ');
  return (
    <View style={styles.timelineRowWrap}>
      {/* 时间轴：时间在上、teal 空心圆点、虚线连向下一行 */}
      <View style={styles.timelineAxis}>
        <Text style={[styles.timelineTime, { color: textSecondary }]}>{timeLabel}</Text>
        <View style={styles.timelineDot} />
        {!isLast ? <View style={[styles.timelineDash, { borderLeftColor: `${textSecondary}8C` }]} /> : <View style={styles.timelineDashSpace} />}
      </View>
      <PressableScale onPress={onPress} scaleTo={0.99} style={styles.timelineCardHit}>
        <View
          style={[
            styles.timelineRow,
            { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
          ]}
        >
          {item.imageUrl ? (
            <RemoteImage
              url={item.imageUrl}
              authToken={accessToken}
              style={styles.timelineThumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.timelineThumb, styles.timelineThumbEmpty]}>
              <FishGlyph size={16} color={palette.waterTeal} />
            </View>
          )}
          <View style={styles.timelineBody}>
            <Text style={[styles.timelineName, { color: textPrimary }]} numberOfLines={1}>
              {item.speciesName || '确认中的鱼'}
            </Text>
            {metaBits ? <Text style={[styles.timelineMeta, { color: textPrimary }]}>{metaBits}</Text> : null}
            <View style={styles.timelineLocationRow}>
              <AppIcon name="location" size={11} color={textSecondary} />
              <Text style={[styles.timelineLocation, { color: textSecondary }]} numberOfLines={1}>
                {location ?? '待确认'}
              </Text>
            </View>
          </View>
          <AppIcon name="chevron_right" size={16} color={textSecondary} />
        </View>
      </PressableScale>
    </View>
  );
};

function chunkDays(cells: { date: Date; inMonth: boolean }[]): { date: Date; inMonth: boolean }[][] {
  const weeks: { date: Date; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  flex: {
    flex: 1,
  } as ViewStyle,
  todayHit: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  todayText: {
    fontSize: fs(15),
  } as TextStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  /** 时间导航行：‹ 2026年9月 › 居中排布（设计稿：页面最大衬线标题） */
  timeNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  } as ViewStyle,
  navArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  timeNavLabel: {
    fontFamily: font.serif,
    fontSize: fs(22),
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 132,
    letterSpacing: 1,
  } as TextStyle,
  /** 分段切换：标题行下方水平居中（设计稿版式） */
  segmentRow: {
    alignItems: 'center',
    marginTop: spacing.xs,
  } as ViewStyle,
  segment: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 2,
  } as ViewStyle,
  segmentCell: {
    paddingHorizontal: 18,
    paddingVertical: 6,
  } as ViewStyle,
  segmentCellPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 13,
    backgroundColor: TEAL_DEEP,
  } as ViewStyle,
  segmentText: {
    fontSize: fs(13),
    fontWeight: '600',
  } as TextStyle,
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    borderRadius: radius.l,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  } as ViewStyle,
  summaryGlyph: {
    width: 36,
    alignItems: 'center',
  } as ViewStyle,
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  summaryText: {
    fontSize: fs(13),
  } as TextStyle,
  summaryValue: {
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '700',
  } as TextStyle,
  /** stacked 模式：标题与值两行水平居中 */
  summaryLabel: {
    fontSize: fs(12),
  } as TextStyle,
  summaryValueStack: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    marginTop: 2,
  } as TextStyle,
  summaryUnit: {
    fontFamily: font.sans,
    fontSize: fs(12),
    fontWeight: '400',
  } as TextStyle,
  summaryDivider: {
    width: 1,
    height: 22,
    opacity: 0.7,
  } as ViewStyle,
  calendarCard: {
    marginTop: spacing.lg,
    borderRadius: radius.l + 4,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  } as ViewStyle,
  /** 星期标题行：下缘细分割线（设计稿） */
  weekHeadRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
    marginBottom: spacing.xs,
  } as ViewStyle,
  weekRow: {
    flexDirection: 'row',
  } as ViewStyle,
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: fs(13),
    paddingVertical: 8,
  } as TextStyle,
  dayCell: {
    flex: 1,
    height: 52,
    padding: 2,
  } as ViewStyle,
  /** 日期格：圆角方形槽位，供淡金细边+浅底选中 / 今日 teal 细边使用。
      注意 PressableScale 内层是自动高度的 Animated.View，这里必须用固定高度，
      flex:1（flexBasis 0）会在自动高度父级里塌缩成 0 导致日期不显示 */
  dayInner: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  } as ViewStyle,
  daySelected: {
    borderWidth: 1,
    borderColor: 'rgba(214,165,65,0.55)',
    backgroundColor: palette.accentGoldSoft,
  } as ViewStyle,
  dayToday: {
    borderWidth: 1,
  } as ViewStyle,
  dayText: {
    fontSize: fs(15),
    fontWeight: '500',
  } as TextStyle,
  dayTextFaded: {
    opacity: 0.35,
  } as TextStyle,
  dayTextSelected: {
    fontWeight: '700',
  } as TextStyle,
  markerSpace: {
    height: 10,
    justifyContent: 'center',
  } as ViewStyle,
  markerRow: {
    flexDirection: 'row',
  } as ViewStyle,
  /** 第 6 条及以后汇总显示（设计稿 ×N） */
  markerCount: {
    fontSize: fs(9),
    fontWeight: '700',
    color: TEAL_MARKER,
  } as TextStyle,
  timelinePanel: {
    marginTop: spacing.xl,
    borderRadius: radius.l + 4,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  timelineTitle: {
    fontFamily: font.serif,
    fontSize: fs(20),
    fontWeight: '700',
  } as TextStyle,
  timelineSub: {
    fontSize: fs(13),
    marginTop: 4,
    paddingHorizontal: 2,
  } as TextStyle,
  timelineEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  } as ViewStyle,
  timelineEmptyText: {
    fontSize: fs(13),
    textAlign: 'center',
  } as TextStyle,
  /** 相邻有记录日轻引导（不新增拍照 CTA） */
  timelineEmptyHint: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  } as ViewStyle,
  timelineEmptyHintText: {
    fontSize: fs(13),
    fontWeight: '600',
  } as TextStyle,
  timeline: {
    marginTop: spacing.lg,
  } as ViewStyle,
  timelineRowWrap: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  } as ViewStyle,
  timelineAxis: {
    width: 48,
    alignItems: 'center',
  } as ViewStyle,
  timelineTime: {
    fontSize: fs(12),
    marginBottom: 4,
  } as TextStyle,
  /** teal 空心圆点（设计稿） */
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: TEAL_MARKER,
    backgroundColor: 'transparent',
  } as ViewStyle,
  timelineDash: {
    width: 0,
    flex: 1,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.55,
    marginTop: 5,
  } as ViewStyle,
  timelineDashSpace: {
    flex: 1,
  } as ViewStyle,
  timelineCardHit: {
    flex: 1,
  } as ViewStyle,
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    padding: spacing.md,
  } as ViewStyle,
  timelineThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
  } as ViewStyle,
  timelineThumbEmpty: {
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  timelineBody: {
    flex: 1,
    gap: 2,
  } as ViewStyle,
  timelineName: {
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  timelineMeta: {
    fontSize: fs(13),
    fontWeight: '500',
  } as TextStyle,
  timelineLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  timelineLocation: {
    fontSize: fs(12),
  } as TextStyle,
  /** 4×3 月份宫格（设计稿：1~12月自然序） */
  monthIndexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
  } as ViewStyle,
  monthIndexHit: {
    // 宫格直接子元素是 PressableScale 外层，百分比宽度必须挂这一层才能相对宫格解析；
    // 内层 padding 形成卡片间隙
    width: '25%',
    padding: 3,
  } as ViewStyle,
  monthIndexCell: {
    width: '100%',
    flexGrow: 1,
    borderRadius: radius.m,
    borderWidth: 1,
    padding: 7,
    minHeight: 70,
    justifyContent: 'space-between',
    gap: 4,
  } as ViewStyle,
  monthIndexSelected: {
    borderColor: GOLD,
    borderWidth: 1.5,
    backgroundColor: palette.accentGoldSoft,
  } as ViewStyle,
  monthIndexDim: {
    opacity: 0.55,
  } as ViewStyle,
  monthIndexTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  } as ViewStyle,
  monthIndexLabel: {
    fontFamily: font.serif,
    fontSize: fs(14),
    fontWeight: '700',
  } as TextStyle,
  monthIndexBadge: {
    backgroundColor: 'rgba(214,165,65,0.16)',
    borderColor: 'rgba(214,165,65,0.45)',
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
  } as ViewStyle,
  monthIndexBadgeText: {
    fontSize: fs(9),
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1,
  } as TextStyle,
  monthIndexCounts: {
    gap: 1,
  } as ViewStyle,
  monthIndexMeta: {
    fontSize: fs(10),
    lineHeight: fs(14),
  } as TextStyle,
  yearListTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.lg,
  } as ViewStyle,
  yearListAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: GOLD,
  } as ViewStyle,
  yearListEmpty: {
    paddingVertical: spacing.xl,
    textAlign: 'center',
  } as TextStyle,
  dayAggHit: {
    marginTop: spacing.md,
  } as ViewStyle,
  dayAggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    padding: spacing.md,
  } as ViewStyle,
  dayAggDate: {
    width: 58,
  } as ViewStyle,
  dayAggDay: {
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '700',
  } as TextStyle,
  dayAggMeta: {
    fontSize: fs(10),
    marginTop: 2,
  } as TextStyle,
  dayAggSpecies: {
    flex: 1,
  } as ViewStyle,
  dayAggSpeciesText: {
    fontSize: fs(13),
    lineHeight: 19,
  } as TextStyle,
  dayAggThumb: {
    width: 44,
    height: 44,
    borderRadius: 11,
  } as ViewStyle,
  dayAggThumbEmpty: {
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
});
