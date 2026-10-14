import type { AppIconName } from '../components/icons/AppIcon';
import { RemoteCatch } from '../types/models';
import { CatchMemoryData } from '../services/catchMemoryService';
import { ShareRangeKey, ShareSnapshotFish } from '../services/shareWorkService';

/**
 * 分享与成长 —— 数据推导层。
 * 所有统计 / 时间线事件 / 年度回顾 / 分享快照均由真实鱼获记录
 * （RemoteCatch + 本地 Catch Memory 的长度重量地点故事）推导得出。
 */

export interface CatchWithMemory {
  catch: RemoteCatch;
  memory: CatchMemoryData | null;
}

const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/** 2026.09.05 */
export function formatDot(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** 2026年9月 */
export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function safeDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function weightOf(item: CatchWithMemory): number | null {
  const value = item.memory?.weightKg;
  return typeof value === 'number' && value > 0 ? value : null;
}

function lengthOf(item: CatchWithMemory): number | null {
  const value = item.memory?.lengthCm;
  return typeof value === 'number' && value > 0 ? value : null;
}

function locationOf(item: CatchWithMemory): string | null {
  const value = item.memory?.location?.trim();
  return value ? value : null;
}

function sizeLabel(item: CatchWithMemory): string | null {
  const parts: string[] = [];
  const length = lengthOf(item);
  const weight = weightOf(item);
  if (length != null) {
    parts.push(`${Number.isInteger(length) ? length : length.toFixed(1)}cm`);
  }
  if (weight != null) {
    parts.push(`${weight}kg`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** 周一为一周开始。 */
export function weekRangeOf(base: Date = new Date()): { start: Date; end: Date } {
  const start = startOfDay(base);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export interface ShareRangeSpec {
  key: ShareRangeKey;
  start: Date;
  /** 不含端点 */
  end: Date;
  /** 选项文案：本周 */
  label: string;
  /** 海报范围文案：2026.09.01 - 09.07 */
  rangeLabel: string;
}

/** 自定义范围预设（不引入日期选择器，先提供常用跨度）。 */
export type CustomRangePreset = '7d' | '14d' | '30d' | 'year' | 'all';

export const CUSTOM_RANGE_OPTIONS: { key: CustomRangePreset; label: string }[] = [
  { key: '7d', label: '最近 7 天' },
  { key: '14d', label: '最近 14 天' },
  { key: '30d', label: '最近 30 天' },
  { key: 'year', label: '今年至今' },
  { key: 'all', label: '全部记录' },
];

export function buildCustomRange(preset: CustomRangePreset, base: Date = new Date()): ShareRangeSpec {
  const end = startOfDay(base);
  end.setDate(end.getDate() + 1);
  const spanDays: Record<Exclude<CustomRangePreset, 'year' | 'all'>, number> = {
    '7d': 7,
    '14d': 14,
    '30d': 30,
  };
  if (preset === 'year') {
    const start = new Date(base.getFullYear(), 0, 1);
    return { key: 'custom', start, end, label: '今年至今', rangeLabel: `${base.getFullYear()}年` };
  }
  if (preset === 'all') {
    return { key: 'custom', start: new Date(2000, 0, 1), end, label: '全部记录', rangeLabel: '记录以来' };
  }
  const start = new Date(end);
  start.setDate(end.getDate() - spanDays[preset]);
  const lastDay = new Date(end);
  lastDay.setDate(end.getDate() - 1);
  return {
    key: 'custom',
    start,
    end,
    label: CUSTOM_RANGE_OPTIONS.find((option) => option.key === preset)?.label ?? '自定义',
    rangeLabel: `${formatDot(start).slice(5)} - ${formatDot(lastDay).slice(5)}`,
  };
}

export function buildRange(key: ShareRangeKey, base: Date = new Date()): ShareRangeSpec {
  if (key === 'today') {
    const start = startOfDay(base);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { key, start, end, label: '今天', rangeLabel: formatDot(start) };
  }
  if (key === 'week') {
    const { start, end } = weekRangeOf(base);
    const lastDay = new Date(end);
    lastDay.setDate(end.getDate() - 1);
    return {
      key,
      start,
      end,
      label: '本周',
      rangeLabel: `${formatDot(start).slice(5)} - ${formatDot(lastDay).slice(5)}`,
    };
  }
  if (key === 'month') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return { key, start, end, label: '本月', rangeLabel: `${base.getFullYear()}.${pad(base.getMonth() + 1)}` };
  }
  // custom 默认近 7 天（自定义面板会传入具体范围覆盖）
  const end = startOfDay(base);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { key: 'custom', start, end, label: '自定义', rangeLabel: `${formatDot(start).slice(5)} - ${formatDot(base).slice(5)}` };
}

// ---------------------------------------------------------------------------
// 分享快照（生成作品 / AI 推荐模板卡共用）
// ---------------------------------------------------------------------------

export interface ShareSnapshot {
  count: number;
  speciesCount: number;
  top: ShareSnapshotFish[];
  others: ShareSnapshotFish[];
  biggest: ShareSnapshotFish | null;
  location: string | null;
  story: string | null;
  photoUris: (string | null)[];
}

interface SpeciesAgg {
  name: string;
  count: number;
  lengthCm: number | null;
  weightKg: number | null;
  imageUri: string | null;
}

/** 把范围内鱼获聚合为按鱼种统计的分享快照。 */
export function buildShareSnapshot(items: CatchWithMemory[], range: ShareRangeSpec): ShareSnapshot {
  const inRange = items.filter((item) => {
    const date = safeDate(item.catch.capturedAt);
    return date != null && date >= range.start && date < range.end;
  });

  const agg = new Map<string, SpeciesAgg>();
  const locationTally = new Map<string, number>();
  const photoUris: (string | null)[] = [];
  let story: string | null = null;

  for (const item of inRange) {
    const name = item.catch.speciesName?.trim();
    const key = item.catch.speciesId || name || 'unknown';
    const entry = agg.get(key) ?? {
      name: name || '确认中的鱼',
      count: 0,
      lengthCm: null,
      weightKg: null,
      imageUri: null,
    };
    entry.count += 1;
    const length = lengthOf(item);
    if (length != null && (entry.lengthCm == null || length > entry.lengthCm)) {
      entry.lengthCm = length;
    }
    const weight = weightOf(item);
    if (weight != null && (entry.weightKg == null || weight > entry.weightKg)) {
      entry.weightKg = weight;
    }
    if (!entry.imageUri && item.catch.imageUrl) {
      entry.imageUri = item.catch.imageUrl;
    }
    agg.set(key, entry);

    const location = locationOf(item);
    if (location) {
      locationTally.set(location, (locationTally.get(location) ?? 0) + 1);
    }
    if (photoUris.length < 3 && item.catch.imageUrl) {
      photoUris.push(item.catch.imageUrl);
    }
    if (!story && item.memory?.story?.trim()) {
      story = item.memory.story.trim();
    }
  }

  const fishes = Array.from(agg.values());
  const sorted = [...fishes].sort((a, b) => {
    const weightA = a.weightKg ?? -1;
    const weightB = b.weightKg ?? -1;
    if (weightA !== weightB) {
      return weightB - weightA;
    }
    return b.count - a.count;
  });

  let location: string | null = null;
  let locationMax = 0;
  locationTally.forEach((tally, name) => {
    if (tally > locationMax) {
      locationMax = tally;
      location = name;
    }
  });

  return {
    count: inRange.length,
    speciesCount: fishes.length,
    top: sorted.slice(0, 3),
    others: sorted.slice(3),
    biggest: sorted[0] ?? null,
    location,
    story,
    photoUris,
  };
}

/** 生成失败兜底：范围内没有任何记录时给出提示文案。 */
export function shareMessageFor(snapshot: ShareSnapshot, rangeLabel: string): string {
  return (
    `我的${rangeLabel}鱼获：${snapshot.count} 条 / ${snapshot.speciesCount} 种鱼` +
    (snapshot.biggest?.weightKg ? `，最大 ${snapshot.biggest.name} ${snapshot.biggest.weightKg}kg` : '') +
    '\n\n渔见 · 遇见更大的水域'
  );
}

// ---------------------------------------------------------------------------
// 成长时间线（新纪录 / 新鱼种 / 里程碑 / 连续记录）
// ---------------------------------------------------------------------------

export type GrowthEventKind = 'record' | 'species' | 'milestone' | 'streak';

export interface GrowthEvent {
  id: string;
  date: Date;
  kind: GrowthEventKind;
  badge: string;
  title: string;
  details: string[];
  location: string | null;
  imageUri: string | null;
  iconName: AppIconName;
}

export interface GrowthMonthGroup {
  key: string;
  label: string;
  events: GrowthEvent[];
}

const MILESTONES = [10, 25, 50, 100, 200, 365, 500, 1000];

/** 由真实记录推导成长事件，按时间倒序返回。 */
export function buildGrowthEvents(items: CatchWithMemory[]): GrowthEvent[] {
  const asc = items
    .filter((item) => safeDate(item.catch.capturedAt) != null)
    .sort((a, b) => a.catch.capturedAt.localeCompare(b.catch.capturedAt));

  const events: GrowthEvent[] = [];
  const seenSpecies = new Set<string>();
  let maxWeight: number | null = null;
  const streakDays: { key: string; date: Date }[] = [];

  asc.forEach((item, index) => {
    const date = safeDate(item.catch.capturedAt) as Date;
    const name = item.catch.speciesName?.trim() || '确认中的鱼';
    const speciesKey = item.catch.speciesId || name;
    const size = sizeLabel(item);
    const location = locationOf(item);
    const imageUri = item.catch.imageUrl || null;

    // 新鱼种：第一次记录该鱼种
    if (!seenSpecies.has(speciesKey)) {
      seenSpecies.add(speciesKey);
      events.push({
        id: `species-${speciesKey}-${item.catch.id}`,
        date,
        kind: 'species',
        badge: '新鱼种',
        title: `第一次记录${name}`,
        details: [size ?? '鱼鉴新增 1 种鱼'],
        location,
        imageUri,
        iconName: 'species',
      });
    }

    // 新纪录：个人最大重量被刷新
    const weight = weightOf(item);
    if (weight != null) {
      if (maxWeight != null && weight > maxWeight) {
        events.push({
          id: `record-${item.catch.id}`,
          date,
          kind: 'record',
          badge: '新纪录',
          title: `${name} ${size ?? `${weight}kg`}`,
          details: ['刷新了个人最大鱼获记录', `上一次最大：${maxWeight}kg`],
          location,
          imageUri,
          iconName: 'weight',
        });
      }
      if (maxWeight == null || weight > maxWeight) {
        maxWeight = weight;
      }
    }

    // 里程碑
    const reached = index + 1;
    if (MILESTONES.includes(reached)) {
      events.push({
        id: `milestone-${reached}`,
        date,
        kind: 'milestone',
        badge: '里程碑',
        title: `第 ${reached} 次鱼获记录`,
        details: [`从第一条开始，已记录 ${reached} 次鱼获。`],
        location: null,
        imageUri: null,
        iconName: 'chart',
      });
    }

    // 连续记录：按自然日找连续段
    const key = dayKey(date);
    const last = streakDays[streakDays.length - 1];
    if (last && last.key === key) {
      // 同一天多条，不改变连续段
    } else if (last && isNextDay(last.date, date)) {
      streakDays.push({ key, date });
    } else {
      flushStreak(streakDays, events);
      streakDays.push({ key, date });
    }
  });
  flushStreak(streakDays, events);

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function isNextDay(prev: Date, next: Date): boolean {
  const diff = Math.round((startOfDay(next).getTime() - startOfDay(prev).getTime()) / 86400000);
  return diff === 1;
}

function flushStreak(
  streakDays: { key: string; date: Date }[],
  events: GrowthEvent[],
): void {
  if (streakDays.length >= 3) {
    const first = streakDays[0].date;
    const last = streakDays[streakDays.length - 1].date;
    events.push({
      id: `streak-${dayKey(last)}`,
      date: last,
      kind: 'streak',
      badge: '连续记录',
      title: `连续 ${streakDays.length} 天留下鱼获记录`,
      details: [`${formatDot(first)} - ${formatDot(last)}`],
      location: null,
      imageUri: null,
      iconName: 'date',
    });
  }
  streakDays.length = 0;
}

/** 事件按月分组（2026年9月 …），倒序。 */
export function groupGrowthEvents(events: GrowthEvent[]): GrowthMonthGroup[] {
  const groups = new Map<string, GrowthMonthGroup>();
  for (const event of events) {
    const key = `${event.date.getFullYear()}-${pad(event.date.getMonth() + 1)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: formatYearMonth(event.date), events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  }
  return Array.from(groups.values());
}

export interface GrowthSummary {
  total: number;
  speciesCount: number;
  firstDate: Date | null;
  events: GrowthEvent[];
  groups: GrowthMonthGroup[];
}

export function buildGrowthSummary(items: CatchWithMemory[]): GrowthSummary {
  const dates = items
    .map((item) => safeDate(item.catch.capturedAt))
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  const events = buildGrowthEvents(items);
  return {
    total: items.length,
    speciesCount: new Set(
      items.map((item) => item.catch.speciesId || item.catch.speciesName).filter(Boolean),
    ).size,
    firstDate: dates[0] ?? null,
    events,
    groups: groupGrowthEvents(events),
  };
}

// ---------------------------------------------------------------------------
// 年度回顾
// ---------------------------------------------------------------------------

export interface AnnualFirstCard {
  id: string;
  dateLabel: string;
  title: string;
  size: string | null;
  location: string | null;
  imageUri: string | null;
}

export interface AnnualMemoryCard {
  id: string;
  title: string;
  description: string;
  location: string | null;
  dateLabel: string;
  imageUri: string | null;
}

export interface AnnualReviewData {
  year: number;
  total: number;
  speciesCount: number;
  newSpeciesThisYear: number;
  days: number;
  /** 平均每个记录日钓获条数（保留 1 位） */
  avgPerDay: number;
  startDateLabel: string | null;
  firsts: AnnualFirstCard[];
  /** 最大重量刷新路径 */
  recordProgression: { weightKg: number; dateLabel: string; imageUri: string | null }[];
  recordRefreshCount: number;
  speciesBefore: number;
  monthly: number[];
  memories: AnnualMemoryCard[];
}

export function buildAnnualReview(items: CatchWithMemory[], year: number): AnnualReviewData {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const inYear = items.filter((item) => {
    const date = safeDate(item.catch.capturedAt);
    return date != null && date >= yearStart && date < yearEnd;
  });
  const asc = [...inYear].sort((a, b) => a.catch.capturedAt.localeCompare(b.catch.capturedAt));

  // 今年的第一次： overall + 各鱼种第一次
  const firsts: AnnualFirstCard[] = [];
  const seenSpecies = new Set<string>();
  for (const item of asc) {
    const name = item.catch.speciesName?.trim();
    const speciesKey = item.catch.speciesId || name;
    const isOverall = firsts.length === 0;
    if (!isOverall && seenSpecies.has(speciesKey)) {
      continue;
    }
    seenSpecies.add(speciesKey);
    const date = safeDate(item.catch.capturedAt) as Date;
    firsts.push({
      id: `first-${item.catch.id}`,
      dateLabel: formatDot(date),
      title: isOverall ? '第一次记录鱼获' : `第一次记录${name || '新的鱼'}`,
      size: sizeLabel(item),
      location: locationOf(item),
      imageUri: item.catch.imageUrl || null,
    });
    if (firsts.length >= 3) {
      break;
    }
  }

  // 最大重量刷新路径
  const progression: AnnualReviewData['recordProgression'] = [];
  let maxWeight: number | null = null;
  let refreshCount = 0;
  for (const item of asc) {
    const weight = weightOf(item);
    if (weight == null) {
      continue;
    }
    if (maxWeight == null || weight > maxWeight) {
      if (maxWeight != null) {
        refreshCount += 1;
      }
      maxWeight = weight;
      progression.push({
        weightKg: weight,
        dateLabel: formatDot(safeDate(item.catch.capturedAt) as Date),
        imageUri: item.catch.imageUrl || null,
      });
    }
  }

  // 鱼种数量：今年之前已有的 vs 现在总数
  const speciesBeforeSet = new Set<string>();
  const speciesAllSet = new Set<string>();
  let newSpeciesThisYear = 0;
  const speciesFirstSeen = new Map<string, Date>();
  for (const item of items) {
    const name = item.catch.speciesName?.trim();
    const speciesKey = item.catch.speciesId || name;
    if (!speciesKey) {
      continue;
    }
    const date = safeDate(item.catch.capturedAt);
    if (!date) {
      continue;
    }
    const known = speciesFirstSeen.get(speciesKey);
    if (!known || date < known) {
      speciesFirstSeen.set(speciesKey, date);
    }
  }
  speciesFirstSeen.forEach((firstDate, key) => {
    speciesAllSet.add(key);
    if (firstDate < yearStart) {
      speciesBeforeSet.add(key);
    } else if (firstDate < yearEnd) {
      newSpeciesThisYear += 1;
    }
  });

  // 每月数量
  const monthly = new Array(12).fill(0) as number[];
  for (const item of inYear) {
    const date = safeDate(item.catch.capturedAt);
    if (date) {
      monthly[date.getMonth()] += 1;
    }
  }

  const days = new Set(inYear.map((item) => dayKey(safeDate(item.catch.capturedAt) as Date))).size;

  // 值得留下的记忆：最大的一条 / 今年第一次新鱼种 / 最近一段文字记录
  const memories: AnnualMemoryCard[] = [];
  const biggestItem = asc.reduce<CatchWithMemory | null>((best, item) => {
    if (weightOf(item) == null) {
      return best;
    }
    if (!best || (weightOf(item) as number) > (weightOf(best) as number)) {
      return item;
    }
    return best;
  }, null);
  if (biggestItem) {
    const date = safeDate(biggestItem.catch.capturedAt) as Date;
    const weight = weightOf(biggestItem) as number;
    memories.push({
      id: `memory-biggest-${biggestItem.catch.id}`,
      title: '最大的一条',
      description: `${biggestItem.catch.speciesName || '鱼获'} ${weight}kg · ${formatDot(date)}`,
      location: locationOf(biggestItem),
      dateLabel: formatDot(date),
      imageUri: biggestItem.catch.imageUrl || null,
    });
  }
  const firstNewSpeciesItem = asc.find((item) => {
    const name = item.catch.speciesName?.trim();
    const speciesKey = item.catch.speciesId || name;
    const first = speciesKey ? speciesFirstSeen.get(speciesKey) : undefined;
    return first != null && first >= yearStart && first < yearEnd;
  });
  if (firstNewSpeciesItem) {
    const date = safeDate(firstNewSpeciesItem.catch.capturedAt) as Date;
    memories.push({
      id: `memory-species-${firstNewSpeciesItem.catch.id}`,
      title: `第一次记录${firstNewSpeciesItem.catch.speciesName || '新的鱼'}`,
      description: `${sizeLabel(firstNewSpeciesItem) ?? '鱼鉴图鉴又多了一位'} · ${formatDot(date)}`,
      location: locationOf(firstNewSpeciesItem),
      dateLabel: formatDot(date),
      imageUri: firstNewSpeciesItem.catch.imageUrl || null,
    });
  }
  const storyItem = [...inYear]
    .sort((a, b) => b.catch.capturedAt.localeCompare(a.catch.capturedAt))
    .find((item) => item.memory?.story?.trim());
  if (storyItem) {
    const date = safeDate(storyItem.catch.capturedAt) as Date;
    memories.push({
      id: `memory-story-${storyItem.catch.id}`,
      title: '那天水边',
      description: (storyItem.memory?.story ?? '').trim().slice(0, 42),
      location: locationOf(storyItem),
      dateLabel: formatDot(date),
      imageUri: storyItem.catch.imageUrl || storyItem.memory?.media?.[0]?.uri || null,
    });
  }

  const allDates = items
    .map((item) => safeDate(item.catch.capturedAt))
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    year,
    total: inYear.length,
    speciesCount: speciesAllSet.size,
    newSpeciesThisYear,
    days,
    avgPerDay: days > 0 ? Math.round((inYear.length / days) * 10) / 10 : 0,
    startDateLabel: allDates.length ? formatDot(allDates[0]) : null,
    firsts,
    recordProgression: progression,
    recordRefreshCount: refreshCount,
    speciesBefore: speciesBeforeSet.size,
    monthly,
    memories,
  };
}

/** 有记录的最近一年（无记录则当前年份）。 */
export function latestYearWithCatches(items: CatchWithMemory[]): number {
  let latest: number | null = null;
  for (const item of items) {
    const date = safeDate(item.catch.capturedAt);
    if (date && (latest == null || date.getFullYear() > latest)) {
      latest = date.getFullYear();
    }
  }
  return latest ?? new Date().getFullYear();
}
