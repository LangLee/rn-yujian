/**
 * 我的鱼获 V2 · 时间档案逻辑层（纯函数，便于单测）。
 *
 * 设计依据（design/pages/fish_records/list，FROZEN）：
 * - Timeline Scroll Spec V1：月份章节 → 日期节点/当日摘要 → FishRecordRowCard；
 *   newest first；月头 Sticky；单日 1–5 条全展、6–10 条前 5 +「查看另外 N 条」、
 *   >10 条前 5 +「查看全部 N 条鱼获」进当天详情；初始最近 3 个月，滚动加载更早。
 * - Filter Spec V2 / F1 Panel Spec V1：四维 鱼种/时间/尺寸/特殊记录；
 *   同维 OR、跨维 AND、Search AND Filter、「不限」清空该维。
 * - Growth Mark Spec V1：首条某鱼种 / 数量里程碑(10/50/100/500/1000) /
 *   同鱼种最长 / 同鱼种最重；列表最多显示 1 个，
 *   优先级 里程碑 > 首条 > 尺寸纪录（最长+最重合并为「最长 · 最重」）。
 * - Search Spec V1：关键词 = 鱼种/地点/日期/Growth Mark 文案，多关键词 AND，
 *   大小写不敏感；日期支持 9月23日 / 2026年9月 / 2026-09-23 等格式。
 */
import { RemoteCatch } from '../types/models';
import { CatchMemoryData } from '../services/catchMemoryService';

// ---------------------------------------------------------------------------
// 基础数据结构
// ---------------------------------------------------------------------------

export interface CatchEntry {
  catch: RemoteCatch;
  memory: CatchMemoryData | null;
  /** 排序 / 分组用时间戳（毫秒）；无效时为 null */
  time: number | null;
  date: Date | null;
  year: number;
  month: number; // 1-12
  day: number;
}

const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

function parseTime(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** RemoteCatch + 本地记忆 → 统一档案条目（时间未知仍保留，归入「时间未知」组）。 */
export function buildEntries(
  catches: RemoteCatch[],
  memories: Record<string, CatchMemoryData>,
): CatchEntry[] {
  return catches.map((item) => {
    const date = parseTime(item.capturedAt) ?? parseTime(item.createdAt);
    return {
      catch: item,
      memory: memories[item.id] ?? null,
      time: date ? date.getTime() : null,
      date,
      year: date ? date.getFullYear() : 0,
      month: date ? date.getMonth() + 1 : 0,
      day: date ? date.getDate() : 0,
    };
  });
}

export function sortNewestFirst(entries: CatchEntry[]): CatchEntry[] {
  return [...entries].sort((a, b) => {
    const at = a.time ?? Number.MIN_SAFE_INTEGER;
    const bt = b.time ?? Number.MIN_SAFE_INTEGER;
    if (bt !== at) return bt - at;
    return a.catch.id.localeCompare(b.catch.id);
  });
}

// ---------------------------------------------------------------------------
// Growth Mark
// ---------------------------------------------------------------------------

export type GrowthMarkKind = 'milestone' | 'firstSpecies' | 'longest' | 'heaviest';

export interface GrowthMarkInfo {
  milestone?: number;
  firstSpecies?: boolean;
  longest?: boolean;
  heaviest?: boolean;
}

export const MILESTONES = [10, 50, 100, 500, 1000] as const;

/** 列表徽章：最多 1 个，里程碑 > 首条 > 尺寸纪录（最长·最重合并）。 */
export function primaryGrowthMarkLabel(
  info: GrowthMarkInfo | undefined,
  speciesName: string,
): string | null {
  if (!info) return null;
  if (info.milestone) return `第${info.milestone}条`;
  if (info.firstSpecies) return `首条${speciesName}`;
  if (info.longest && info.heaviest) return '最长 · 最重';
  if (info.longest) return '最长';
  if (info.heaviest) return '最重';
  return null;
}

/** 徽章视觉分档：里程碑金 / 首条灰绿 / 尺寸蓝灰（最长·最重合并一档） */
export function growthMarkBadgeKind(
  info: GrowthMarkInfo | undefined,
): 'milestone' | 'firstSpecies' | 'size' | null {
  if (!info) return null;
  if (info.milestone) return 'milestone';
  if (info.firstSpecies) return 'firstSpecies';
  if (info.longest || info.heaviest) return 'size';
  return null;
}

function lengthOf(entry: CatchEntry): number | null {
  const value = entry.memory?.lengthCm;
  return typeof value === 'number' && value > 0 ? value : null;
}

function weightOf(entry: CatchEntry): number | null {
  const value = entry.memory?.weightKg;
  return typeof value === 'number' && value > 0 ? value : null;
}

export function locationOf(entry: CatchEntry): string | null {
  const value = entry.memory?.location?.trim();
  return value ? value : null;
}

/**
 * 解析全部 Growth Mark：
 * - 里程碑按全档案时间正序计数（第 N 条命中阈值）；
 * - 首条按鱼种历史最早一条（时间未知的不参与首条判定）；
 * - 最长/最重按同鱼种有效记录的最大值（并列都标记，解析器刻意返回全部命中）。
 */
export function resolveGrowthMarks(entries: CatchEntry[]): Map<string, GrowthMarkInfo> {
  const marks = new Map<string, GrowthMarkInfo>();
  const ensure = (id: string): GrowthMarkInfo => {
    let info = marks.get(id);
    if (!info) {
      info = {};
      marks.set(id, info);
    }
    return info;
  };

  // 时间正序（最老在前）计里程碑
  const chronological = sortNewestFirst(entries).reverse();
  const milestoneSet = new Set<number>(MILESTONES);
  chronological.forEach((entry, index) => {
    const order = index + 1;
    if (milestoneSet.has(order)) {
      ensure(entry.catch.id).milestone = order;
    }
  });

  // 首条某鱼种 / 同鱼种最长 / 同鱼种最重
  const firstSeen = new Map<string, CatchEntry>();
  const maxLength = new Map<string, number>();
  const maxWeight = new Map<string, number>();
  for (const entry of chronological) {
    const key = speciesKey(entry);
    if (!firstSeen.has(key)) {
      firstSeen.set(key, entry);
    }
    const len = lengthOf(entry);
    if (len !== null) {
      maxLength.set(key, Math.max(maxLength.get(key) ?? Number.NEGATIVE_INFINITY, len));
    }
    const weight = weightOf(entry);
    if (weight !== null) {
      maxWeight.set(key, Math.max(maxWeight.get(key) ?? Number.NEGATIVE_INFINITY, weight));
    }
  }
  for (const [, entry] of firstSeen) {
    ensure(entry.catch.id).firstSpecies = true;
  }
  for (const entry of entries) {
    const key = speciesKey(entry);
    const len = lengthOf(entry);
    if (len !== null && len === maxLength.get(key)) {
      ensure(entry.catch.id).longest = true;
    }
    const weight = weightOf(entry);
    if (weight !== null && weight === maxWeight.get(key)) {
      ensure(entry.catch.id).heaviest = true;
    }
  }
  return marks;
}

export function speciesKey(entry: CatchEntry): string {
  return entry.catch.speciesId || entry.catch.speciesName || 'unknown';
}

// ---------------------------------------------------------------------------
// 筛选（Filter Spec V2 四维）+ 搜索（Search Spec V1）
// ---------------------------------------------------------------------------

export type TimeQuickKey = 'all' | 'thisMonth' | 'last3Months' | 'thisYear' | 'custom';

export type SizeQuickKey =
  | 'all'
  | 'lt20'
  | '20to40'
  | '40to60'
  | 'gte60'
  | 'lt05'
  | '05to1'
  | '1to3'
  | 'gte3'
  | 'custom';

export interface SizeRange {
  min?: number | null;
  max?: number | null;
}

export interface MyCatchesFilterState {
  /** 鱼种 key 集合（OR）；空 = 不限 */
  species: string[];
  /** 时间单选 */
  time: TimeQuickKey;
  /** 自定义时间范围（F3），[startMs, endMs] */
  timeCustom?: { start: number; end: number } | null;
  /** 当前编辑视图：长度 / 重量（切换不丢另一指标条件） */
  sizeMode: 'length' | 'weight';
  /** 长度快捷（cm） */
  lengthQuick: SizeQuickKey;
  weightQuick: SizeQuickKey;
  /** 自定义长度范围（cm，F4） */
  lengthCustom?: SizeRange | null;
  weightCustom?: SizeRange | null;
  /** 特殊记录（OR）：首条 / 最长 / 最重 / 里程碑 */
  special: ('first' | 'longest' | 'heaviest' | 'milestone')[];
}

export const EMPTY_FILTER: MyCatchesFilterState = {
  species: [],
  time: 'all',
  timeCustom: null,
  sizeMode: 'length',
  lengthQuick: 'all',
  weightQuick: 'all',
  lengthCustom: null,
  weightCustom: null,
  special: [],
};

export function isFilterActive(filter: MyCatchesFilterState): boolean {
  return (
    filter.species.length > 0 ||
    filter.time !== 'all' ||
    filter.lengthQuick !== 'all' ||
    filter.weightQuick !== 'all' ||
    !!filter.lengthCustom ||
    !!filter.weightCustom ||
    filter.special.length > 0
  );
}

/** 已选条件摘要（B4 / Filter Spec：compact removable summary）。 */
export function activeConditionCount(filter: MyCatchesFilterState): number {
  let count = 0;
  if (filter.species.length > 0) count += 1;
  if (filter.time !== 'all') count += 1;
  if (filter.lengthQuick !== 'all' || filter.lengthCustom) count += 1;
  if (filter.weightQuick !== 'all' || filter.weightCustom) count += 1;
  if (filter.special.length > 0) count += 1;
  return count;
}

function matchTime(entry: CatchEntry, filter: MyCatchesFilterState, now: Date): boolean {
  if (filter.time === 'all') return true;
  if (entry.time === null) return false;
  const time = entry.time;
  switch (filter.time) {
    case 'thisMonth':
      return (
        entry.year === now.getFullYear() && entry.month === now.getMonth() + 1
      );
    case 'last3Months':
      return time >= now.getTime() - 90 * 24 * 60 * 60 * 1000;
    case 'thisYear':
      return entry.year === now.getFullYear();
    case 'custom': {
      const range = filter.timeCustom;
      if (!range) return true;
      return time >= range.start && time <= range.end;
    }
    default:
      return true;
  }
}

function matchQuickRange(value: number, quick: SizeQuickKey): boolean {
  switch (quick) {
    case 'all':
      return true;
    case 'lt20':
      return value < 20;
    case '20to40':
      return value >= 20 && value <= 40;
    case '40to60':
      return value > 40 && value < 60;
    case 'gte60':
      return value >= 60;
    case 'lt05':
      return value < 0.5;
    case '05to1':
      return value >= 0.5 && value <= 1;
    case '1to3':
      return value > 1 && value < 3;
    case 'gte3':
      return value >= 3;
    default:
      return true;
  }
}

function matchCustomRange(value: number, range: SizeRange | null | undefined): boolean {
  if (!range) return true;
  const { min, max } = range;
  if (typeof min === 'number' && value < min) return false;
  if (typeof max === 'number' && value > max) return false;
  return true;
}

/** 尺寸维度：长度与重量各自独立，均设置时 AND；无值记录在任一约束下不命中。 */
function matchSize(entry: CatchEntry, filter: MyCatchesFilterState): boolean {
  const hasLengthCondition =
    filter.lengthQuick !== 'all' || !!filter.lengthCustom;
  const hasWeightCondition =
    filter.weightQuick !== 'all' || !!filter.weightCustom;
  if (!hasLengthCondition && !hasWeightCondition) return true;

  if (hasLengthCondition) {
    const len = lengthOf(entry);
    if (
      len === null ||
      !matchQuickRange(len, filter.lengthQuick) ||
      !matchCustomRange(len, filter.lengthCustom)
    ) {
      return false;
    }
  }
  if (hasWeightCondition) {
    const weight = weightOf(entry);
    if (
      weight === null ||
      !matchQuickRange(weight, filter.weightQuick) ||
      !matchCustomRange(weight, filter.weightCustom)
    ) {
      return false;
    }
  }
  return true;
}

function matchSpecial(
  entry: CatchEntry,
  filter: MyCatchesFilterState,
  marks: Map<string, GrowthMarkInfo>,
): boolean {
  if (filter.special.length === 0) return true;
  const info = marks.get(entry.catch.id);
  return filter.special.some((kind) => {
    switch (kind) {
      case 'first':
        return info?.firstSpecies === true;
      case 'longest':
        return info?.longest === true;
      case 'heaviest':
        return info?.heaviest === true;
      case 'milestone':
        return info?.milestone !== undefined;
      default:
        return false;
    }
  });
}

export function matchFilter(
  entry: CatchEntry,
  filter: MyCatchesFilterState,
  marks: Map<string, GrowthMarkInfo>,
  now: Date,
): boolean {
  if (filter.species.length > 0 && !filter.species.includes(speciesKey(entry))) {
    return false;
  }
  if (!matchTime(entry, filter, now)) return false;
  if (!matchSize(entry, filter)) return false;
  if (!matchSpecial(entry, filter, marks)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 搜索匹配
// ---------------------------------------------------------------------------

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const MONTHS_EN = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/** 日期的可搜索写法：9月23日 / 2026年9月 / 2026-09-23 / 09.23 / 23 SEP 等。 */
export function searchableDateStrings(entry: CatchEntry): string[] {
  if (!entry.date) return [];
  const { year, month, day } = entry;
  const weekday = WEEKDAYS[entry.date.getDay()];
  return [
    `${year}年${month}月`,
    `${month}月${day}日`,
    `${year}年${month}月${day}日`,
    `${year}-${pad(month)}-${pad(day)}`,
    `${year}.${pad(month)}.${pad(day)}`,
    `${pad(month)}.${pad(day)}`,
    `${pad(month)}/${pad(day)}`,
    `${day} ${MONTHS_EN[month - 1]}`,
    `星期${weekday}`,
    `周${weekday}`,
  ];
}

function searchableStrings(
  entry: CatchEntry,
  marks: Map<string, GrowthMarkInfo>,
): string[] {
  const strings: string[] = [];
  if (entry.catch.speciesName) strings.push(entry.catch.speciesName);
  const location = locationOf(entry);
  if (location) strings.push(location);
  strings.push(...searchableDateStrings(entry));
  // 可读 Growth Mark 文案：搜索按全部语义命中，不止列表展示的主徽章（Search Spec §4）
  const info = marks.get(entry.catch.id);
  if (info) {
    if (info.milestone) strings.push(`第${info.milestone}条`);
    if (info.firstSpecies) {
      strings.push('首条');
      strings.push(`首条${entry.catch.speciesName}`);
    }
    if (info.longest) strings.push('最长');
    if (info.heaviest) strings.push('最重');
  }
  return strings;
}

/** 多关键词 AND，大小写不敏感（拉丁字符），query trim。 */
export function matchSearch(
  entry: CatchEntry,
  query: string,
  marks: Map<string, GrowthMarkInfo>,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = searchableStrings(entry, marks)
    .map((value) => value.toLowerCase())
    .join('\n');
  return tokens.every((token) => haystack.includes(token.toLowerCase()));
}

// ---------------------------------------------------------------------------
// 分组
// ---------------------------------------------------------------------------

export interface DayGroup {
  key: string;
  /** 23 */
  dayLabel: string;
  /** SEP */
  monthLabel: string;
  /** 2026年9月23日 星期三 */
  fullLabel: string;
  /** 单一地点：「地点 · N条鱼获 · M种鱼」；多地点/无地点：「N条鱼获 · M种鱼」 */
  summary: string;
  entries: CatchEntry[];
}

export interface MonthGroup {
  key: string;
  /** 2026年9月 */
  label: string;
  days: DayGroup[];
}

/** 当日摘要按当前可见记录重算（搜索/筛选后仍成立）。 */
export function daySummary(entries: CatchEntry[]): string {
  const locations = Array.from(
    new Set(entries.map(locationOf).filter((value): value is string => !!value)),
  );
  const species = new Set(entries.map(speciesKey)).size;
  const core = `${entries.length}条鱼获 · ${species}种鱼`;
  return locations.length === 1 ? `${locations[0]} · ${core}` : core;
}

export function groupByMonthAndDay(entries: CatchEntry[]): MonthGroup[] {
  const sorted = sortNewestFirst(entries);
  const months = new Map<string, { label: string; days: Map<string, CatchEntry[]> }>();
  for (const entry of sorted) {
    const known = entry.date !== null;
    const monthKey = known
      ? `${pad(entry.year)}-${pad(entry.month)}`
      : 'unknown';
    const dayKey = known
      ? `${pad(entry.year)}-${pad(entry.month)}-${pad(entry.day)}`
      : 'unknown';
    let month = months.get(monthKey);
    if (!month) {
      month = {
        label: known ? `${entry.year}年${entry.month}月` : '时间未知',
        days: new Map<string, CatchEntry[]>(),
      };
      months.set(monthKey, month);
    }
    const dayList = month.days.get(dayKey) ?? [];
    dayList.push(entry);
    month.days.set(dayKey, dayList);
  }
  return Array.from(months.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, month]) => ({
      key,
      label: month.label,
      days: Array.from(month.days.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([dayKey, list]) => {
          const first = list[0];
          const weekday = first.date ? WEEKDAYS[first.date.getDay()] : '';
          return {
            key: dayKey,
            dayLabel: first.date ? `${first.day}` : '·',
            monthLabel: first.date ? MONTHS_EN[first.month - 1] : '',
            fullLabel: first.date
              ? `${first.year}年${first.month}月${first.day}日${weekday ? ` 星期${weekday}` : ''}`
              : '日期未知',
            summary: daySummary(list),
            entries: sortNewestFirst(list),
          };
        }),
    }));
}

// ---------------------------------------------------------------------------
// 空状态判定（Empty States Spec V1 优先级）
// ---------------------------------------------------------------------------

export type MyCatchesEmptyKind = 'archive' | 'search' | 'filter' | null;

export function resolveEmptyKind(params: {
  loading: boolean;
  hasError: boolean;
  rawCount: number;
  query: string;
  filterActive: boolean;
  resultCount: number;
}): MyCatchesEmptyKind {
  const { loading, hasError, rawCount, query, filterActive, resultCount } = params;
  if (loading || hasError) return null;
  if (rawCount === 0) return 'archive';
  if (resultCount === 0 && query.trim().length > 0) return 'search';
  if (resultCount === 0 && filterActive) return 'filter';
  return null;
}
