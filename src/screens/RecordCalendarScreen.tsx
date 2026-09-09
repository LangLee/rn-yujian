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
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { RemoteCatch } from '../types/models';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import { dayKeyOf, formatLength, formatWeight } from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { usePreferences } from '../contexts/PreferencesContext';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { RemoteImage } from '../components/RemoteImage';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/ui/EmptyState';
import { FishGlyph } from '../components/ui/FishGlyph';
import { ScreenHeader } from '../components';

type CalendarScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Calendar'>;

type ViewMode = 'month' | 'year';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const GOLD = '#C9A96A';

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 记录日历 / 时间线（设计文档 10 + 高保真参考稿）：
 * 月视图 = 顶部记录/今天 + 月份导航与月年切换 + 轻摘要条 + 月历（小鱼 glyph、
 * 选中日金色光晕）+ 当天时间轴时间线；年视图 = 月份索引 + 选中月按天聚合。
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

  // 轻摘要：连续记录 / 本周 / 本月
  const summary = useMemo(() => {
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
    let monthDays = 0;
    dayMap.forEach((_, key) => {
      if (key.startsWith(`${today.getFullYear()}-${pad2(today.getMonth() + 1)}`)) {
        monthDays += 1;
      }
    });
    return { streak, weekDays, monthDays };
  }, [dayMap, today]);

  // 月历网格（含前后月补位，参考稿灰显相邻月日期）
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
  const selectedDate = useMemo(() => new Date(selectedDay), [selectedDay]);

  // 年视图：选中月的按天聚合
  const yearMonthDays = useMemo(() => {
    const prefix = `${cursor.year}-${pad2(cursor.month + 1)}`;
    const entries: { key: string; date: Date; items: RemoteCatch[] }[] = [];
    dayMap.forEach((items, key) => {
      if (key.startsWith(prefix)) {
        entries.push({ key, date: new Date(key), items });
      }
    });
    entries.sort((a, b) => b.key.localeCompare(a.key));
    return entries;
  }, [dayMap, cursor]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const accent = profile.surface.accent;
  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const selectedSpeciesCount = new Set(selectedCatches.map((item) => item.speciesId).filter(Boolean)).size;

  const shiftMonth = (delta: number) => {
    setCursor((previous) => {
      const next = new Date(previous.year, previous.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDay(todayKey);
    setMode('month');
  };

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
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
        {catches.length === 0 ? (
          <EmptyState
            title="今天还没有留下鱼获"
            description="每次去水边拍下的渔获，都会标记在这里的日子上"
            actionLabel="拍照识鱼"
            onAction={() => navigation.navigate('Identify')}
          />
        ) : mode === 'month' ? (
          <>
            {/* 月份导航 + 月/年切换 */}
            <View style={styles.monthNavRow}>
              <PressableScale onPress={() => shiftMonth(-1)} scaleTo={0.9} style={styles.navArrow}>
                <Icon name="chevron-back" size={18} color={textPrimary} />
              </PressableScale>
              <Text style={[styles.monthNavLabel, { color: textPrimary }]}>
                {cursor.year}年{cursor.month + 1}月
              </Text>
              <PressableScale onPress={() => shiftMonth(1)} scaleTo={0.9} style={styles.navArrow}>
                <Icon name="chevron-forward" size={18} color={textPrimary} />
              </PressableScale>
              <ModeSegment
                mode={mode}
                glassBorder={profile.surface.glassBorder}
                textSecondary={textSecondary}
                onChange={setMode}
              />
            </View>

            {/* 轻摘要条：鱼 glyph + 三段数据 */}
            <SummaryStrip
              streak={summary.streak}
              weekDays={summary.weekDays}
              monthDays={summary.monthDays}
              glass={profile.surface.glass}
              glassBorder={profile.surface.glassBorder}
              textPrimary={textPrimary}
            />

            {/* 月历 */}
            <View style={[styles.calendarCard, { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder }]}>
              <View style={styles.weekRow}>
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
                    const isSelected = key === selectedDay && cell.inMonth;
                    const isToday = key === todayKey;
                    return (
                      <PressableScale
                        key={`${key}-${dayIndex}`}
                        onPress={() => setSelectedDay(key)}
                        scaleTo={0.9}
                        style={styles.dayCell}
                      >
                        <View style={styles.dayInner}>
                          {/* 选中日金色光晕 */}
                          {isSelected ? <View style={styles.selectedGlow} /> : null}
                          {isToday && !isSelected ? <View style={[styles.todayRing, { borderColor: accent }]} /> : null}
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
                            {count > 0 && count <= 3 ? (
                              <View style={styles.markerRow}>
                                {Array.from({ length: count }, (_, i) => (
                                  <FishGlyph key={i} size={8} color="#4E838A" />
                                ))}
                              </View>
                            ) : count > 3 ? (
                              <Text style={styles.markerCount}>{count}</Text>
                            ) : null}
                          </View>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* 选中日期：时间轴时间线（单个玻璃容器） */}
            <View
              style={[
                styles.timelinePanel,
                { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
              ]}
            >
              <Text style={[styles.timelineTitle, { color: textPrimary }]}>
                {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 ·{' '}
                {WEEKDAY_CN[selectedDate.getDay()]}
              </Text>
              {selectedCatches.length > 0 ? (
                <Text style={[styles.timelineSub, { color: textSecondary }]}>
                  {selectedCatches.length} 次鱼获 · {selectedSpeciesCount} 种鱼
                </Text>
              ) : null}
              {selectedCatches.length === 0 ? (
                <Text style={[styles.timelineEmpty, { color: textSecondary }]}>
                  这一天还没有留下鱼获
                </Text>
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
            {/* 年视图：年份导航 + 月/年切换（切换常驻，随时可回月视图） */}
            <View style={styles.monthNavRow}>
              <PressableScale
                onPress={() => setCursor((c) => ({ ...c, year: c.year - 1 }))}
                scaleTo={0.9}
                style={styles.navArrow}
              >
                <Icon name="chevron-back" size={18} color={textPrimary} />
              </PressableScale>
              <Text style={[styles.monthNavLabel, { color: textPrimary }]}>{cursor.year}年</Text>
              <PressableScale
                onPress={() => setCursor((c) => ({ ...c, year: c.year + 1 }))}
                scaleTo={0.9}
                style={styles.navArrow}
              >
                <Icon name="chevron-forward" size={18} color={textPrimary} />
              </PressableScale>
              <ModeSegment
                mode={mode}
                glassBorder={profile.surface.glassBorder}
                textSecondary={textSecondary}
                onChange={setMode}
              />
            </View>

            {/* 轻摘要条：鱼 glyph + 三段数据 */}
            <SummaryStrip
              streak={summary.streak}
              weekDays={summary.weekDays}
              monthDays={summary.monthDays}
              glass={profile.surface.glass}
              glassBorder={profile.surface.glassBorder}
              textPrimary={textPrimary}
            />

            {/* 12 月份宫格（2 列 × 6 行）：月份 + 金色短线、本月徽章、天数/次数 + 小鱼评级 */}
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
                // 小鱼评级：8 次以上三档、3 次以上两档、有记录一档
                const glyphTier = count >= 8 ? 3 : count >= 3 ? 2 : count > 0 ? 1 : 0;
                return (
                  <PressableScale
                    key={monthIndex}
                    onPress={() => setCursor((c) => ({ ...c, month: monthIndex }))}
                    scaleTo={0.97}
                    style={styles.monthIndexHit}
                  >
                    <View
                      style={[
                        styles.monthIndexCell,
                        { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
                        selectedMonth && { borderColor: GOLD, borderWidth: 1.5 },
                        isNow && !selectedMonth && { borderColor: accent },
                        days === 0 && styles.monthIndexDim,
                      ]}
                    >
                      <View style={styles.monthIndexTop}>
                        <View style={styles.monthIndexHead}>
                          <Text
                            style={[
                              styles.monthIndexLabel,
                              { color: selectedMonth ? GOLD : textPrimary },
                            ]}
                          >
                            {monthIndex + 1}月
                          </Text>
                          {glyphTier > 0 ? <View style={styles.monthIndexTick} /> : null}
                        </View>
                        {isNow ? (
                          <View style={styles.monthIndexBadge}>
                            <Text style={styles.monthIndexBadgeText}>本月</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.monthIndexBottom}>
                        <Text style={[styles.monthIndexMeta, { color: textSecondary }]}>
                          {days > 0 ? `${days} 天 · ${count} 次` : '还没有记录'}
                        </Text>
                        {glyphTier > 0 ? (
                          <View style={styles.monthIndexGlyphs}>
                            {Array.from({ length: glyphTier }, (_, i) => (
                              <FishGlyph key={i} size={12} color={GOLD} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </PressableScale>
                );
              })}
            </View>

            {/* 选中月按天聚合列表：标题 + 金色装饰短线 */}
            <View style={styles.yearListTitleRow}>
              <View style={styles.yearListAccent} />
              <Text style={[styles.timelineTitle, { color: textPrimary }]}>
                {cursor.month + 1}月记录
              </Text>
            </View>
            <Text style={[styles.timelineSub, { color: textSecondary }]}>
              {yearMonthDays.length} 天有鱼获 ·{' '}
              {yearMonthDays.reduce((total, entry) => total + entry.items.length, 0)} 次鱼获 ·{' '}
              {
                new Set(
                  yearMonthDays
                    .flatMap((entry) => entry.items.map((item) => item.speciesId))
                    .filter(Boolean),
                ).size
              }{' '}
              种鱼
            </Text>
            {yearMonthDays.length === 0 ? (
              <Text style={[styles.timelineEmpty, { color: textSecondary }]}>
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
                      setSelectedDay(entry.key);
                      const date = new Date(entry.key);
                      setCursor({ year: date.getFullYear(), month: date.getMonth() });
                    }}
                    scaleTo={0.99}
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
                          {entry.items.length} 次 · {speciesNames.length} 种
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
                      <Icon name="chevron-forward" size={15} color={textSecondary} />
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

/** 月 / 年 模式切换（月、年视图都常驻，保证随时可互切） */
const ModeSegment: React.FC<{
  mode: ViewMode;
  glassBorder: string;
  textSecondary: string;
  onChange: (mode: ViewMode) => void;
}> = ({ mode, glassBorder, textSecondary, onChange }) => (
  <View style={[styles.segment, { borderColor: glassBorder }]}>
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

/** 轻摘要条：鱼 glyph + 连续记录 / 本周 / 本月 */
const SummaryStrip: React.FC<{
  streak: number;
  weekDays: number;
  monthDays: number;
  glass: string;
  glassBorder: string;
  textPrimary: string;
}> = ({ streak, weekDays, monthDays, glass, glassBorder, textPrimary }) => (
  <View style={[styles.summaryBar, { backgroundColor: glass, borderColor: glassBorder }]}>
    <View style={styles.summaryGlyph}>
      <FishGlyph size={20} color="#3E6E75" />
    </View>
    <SummaryCell label="连续记录" value={streak} textPrimary={textPrimary} />
    <View style={[styles.summaryDivider, { backgroundColor: glassBorder }]} />
    <SummaryCell label="本周" value={weekDays} textPrimary={textPrimary} />
    <View style={[styles.summaryDivider, { backgroundColor: glassBorder }]} />
    <SummaryCell label="本月" value={monthDays} textPrimary={textPrimary} />
  </View>
);

const SummaryCell: React.FC<{ label: string; value: number; textPrimary: string }> = ({
  label,
  value,
  textPrimary,
}) => (
  <View style={styles.summaryCell}>
    <Text style={[styles.summaryText, { color: textPrimary }]}>
      {label} <Text style={styles.summaryValue}>{value}</Text> 天
    </Text>
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
      {/* 时间轴：时间 + 虚线 + 空心点 */}
      <View style={styles.timelineAxis}>
        <Text style={[styles.timelineTime, { color: textSecondary }]}>{timeLabel}</Text>
        {!isLast ? <View style={[styles.timelineDash, { backgroundColor: textSecondary }]} /> : null}
        <View style={[styles.timelineDot, { borderColor: textSecondary }]} />
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
              <Icon name="location-outline" size={11} color={textSecondary} />
              <Text style={[styles.timelineLocation, { color: textSecondary }]} numberOfLines={1}>
                {location ?? '待确认'}
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={16} color={textSecondary} />
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
    fontSize: 15,
  } as TextStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  } as ViewStyle,
  navArrow: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  monthNavLabel: {
    fontFamily: font.serif,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 110,
  } as TextStyle,
  segment: {
    flexDirection: 'row',
    marginLeft: 'auto',
    borderRadius: 16,
    borderWidth: 1,
    padding: 2,
  } as ViewStyle,
  segmentCell: {
    paddingHorizontal: 15,
    paddingVertical: 6,
  } as ViewStyle,
  segmentCellPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 13,
    backgroundColor: '#5E8D91',
  } as ViewStyle,
  segmentText: {
    fontSize: 13,
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
    width: 40,
    alignItems: 'center',
  } as ViewStyle,
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  summaryText: {
    fontSize: 13,
  } as TextStyle,
  summaryValue: {
    fontFamily: font.serif,
    fontSize: 15,
    fontWeight: '700',
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
  weekRow: {
    flexDirection: 'row',
  } as ViewStyle,
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 8,
  } as TextStyle,
  dayCell: {
    flex: 1,
    height: 52,
    padding: 2,
  } as ViewStyle,
  dayInner: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  selectedGlow: {
    position: 'absolute',
    top: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(201,169,106,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(201,169,106,0.5)',
  } as ViewStyle,
  todayRing: {
    position: 'absolute',
    top: 7,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
  } as ViewStyle,
  dayText: {
    fontSize: 15,
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
    gap: 1,
  } as ViewStyle,
  markerCount: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4E838A',
  } as TextStyle,
  timelinePanel: {
    marginTop: spacing.xl,
    borderRadius: radius.l + 4,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  timelineTitle: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: '700',
  } as TextStyle,
  timelineSub: {
    fontSize: 13,
    marginTop: 4,
    paddingHorizontal: 2,
  } as TextStyle,
  timelineEmpty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  } as TextStyle,
  timeline: {
    marginTop: spacing.lg,
  } as ViewStyle,
  timelineRowWrap: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  } as ViewStyle,
  timelineAxis: {
    width: 52,
    alignItems: 'center',
  } as ViewStyle,
  timelineTime: {
    fontSize: 12,
    marginBottom: 6,
  } as TextStyle,
  timelineDash: {
    width: 1,
    flex: 1,
    opacity: 0.25,
    marginBottom: 6,
    borderStyle: 'dashed',
  } as ViewStyle,
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
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
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  timelineMeta: {
    fontSize: 13,
    fontWeight: '500',
  } as TextStyle,
  timelineLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  timelineLocation: {
    fontSize: 12,
  } as TextStyle,
  monthIndexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  } as ViewStyle,
  monthIndexHit: {
    // 宫格直接子元素是 PressableScale 外层，百分比宽度必须挂这一层才能相对宫格解析
    width: '48.5%',
  } as ViewStyle,
  monthIndexCell: {
    width: '100%',
    borderRadius: radius.m + 2,
    borderWidth: 1,
    // 紧凑高度：12 张卡压缩后让下方明细区在首屏露出
    padding: spacing.sm,
    minHeight: 64,
    justifyContent: 'space-between',
    gap: 6,
  } as ViewStyle,
  monthIndexDim: {
    opacity: 0.55,
  } as ViewStyle,
  monthIndexTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  } as ViewStyle,
  monthIndexHead: {
    alignItems: 'flex-start',
  } as ViewStyle,
  monthIndexLabel: {
    fontFamily: font.serif,
    fontSize: 17,
    fontWeight: '700',
  } as TextStyle,
  monthIndexTick: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: GOLD,
    marginTop: 2,
  } as ViewStyle,
  monthIndexBadge: {
    backgroundColor: 'rgba(201,169,106,0.16)',
    borderColor: 'rgba(201,169,106,0.45)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  } as ViewStyle,
  monthIndexBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1,
  } as TextStyle,
  monthIndexBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  monthIndexMeta: {
    fontSize: 12,
  } as TextStyle,
  monthIndexGlyphs: {
    flexDirection: 'row',
    gap: 3,
  } as ViewStyle,
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
  dayAggHit: {
    marginBottom: spacing.md,
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
    width: 60,
  } as ViewStyle,
  dayAggDay: {
    fontFamily: font.serif,
    fontSize: 16,
    fontWeight: '700',
  } as TextStyle,
  dayAggMeta: {
    fontSize: 11,
    marginTop: 2,
  } as TextStyle,
  dayAggSpecies: {
    flex: 1,
  } as ViewStyle,
  dayAggSpeciesText: {
    fontSize: 13,
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
