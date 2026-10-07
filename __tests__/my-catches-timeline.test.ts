/**
 * 我的鱼获 V2 时间档案逻辑层单测（对齐原生 MyCatchesPresentationTest 的分组/筛选/Growth Mark 语义）。
 */
import { RemoteCatch } from '../src/types/models';
import { CatchMemoryData } from '../src/services/catchMemoryService';
import {
  EMPTY_FILTER,
  buildEntries,
  daySummary,
  groupByMonthAndDay,
  isFilterActive,
  matchSearch,
  matchFilter,
  primaryGrowthMarkLabel,
  resolveEmptyKind,
  resolveGrowthMarks,
  sortNewestFirst,
  MyCatchesFilterState,
} from '../src/utils/myCatchesTimeline';

const memory = (over: Partial<CatchMemoryData> = {}): CatchMemoryData => ({
  story: '',
  lengthCm: null,
  weightKg: null,
  location: null,
  latitude: null,
  longitude: null,
  media: [],
  ...over,
});

const makeCatch = (
  id: string,
  speciesId: string,
  speciesName: string,
  capturedAt: string,
): RemoteCatch => ({
  id,
  imageUrl: `/img/${id}.jpg`,
  speciesId,
  speciesName,
  confidence: 0.9,
  modelVersion: 'v1',
  capturedAt,
  createdAt: capturedAt,
});

const baseCatches = [
  makeCatch('a', 'grass', '草鱼', '2026-09-23T10:00:00Z'),
  makeCatch('b', 'crucian', '鲫鱼', '2026-09-23T08:00:00Z'),
  makeCatch('c', 'grass', '草鱼', '2026-08-15T09:00:00Z'),
  makeCatch('d', 'carp', '鲤鱼', '2026-07-02T09:00:00Z'),
];

const baseMemories: Record<string, CatchMemoryData> = {
  a: memory({ lengthCm: 42, weightKg: 1.2, location: '千岛湖' }),
  b: memory({ location: '千岛湖' }),
  c: memory({ lengthCm: 55 }),
  d: memory({ lengthCm: 30, weightKg: 2.4 }),
};

describe('buildEntries + sortNewestFirst', () => {
  it('按时间倒序排列（newest first）', () => {
    const entries = buildEntries(baseCatches, baseMemories);
    const sorted = sortNewestFirst(entries);
    expect(sorted.map((item) => item.catch.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('groupByMonthAndDay', () => {
  it('月份 → 日期 两级分组，月份与日期均倒序', () => {
    const groups = groupByMonthAndDay(buildEntries(baseCatches, baseMemories));
    expect(groups.map((month) => month.key)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(groups[0].days.map((day) => day.key)).toEqual(['2026-09-23']);
    expect(groups[0].days[0].entries.map((item) => item.catch.id)).toEqual(['a', 'b']);
  });

  it('当日摘要：单一地点带地点前缀，多地点不带头', () => {
    const groups = groupByMonthAndDay(buildEntries(baseCatches, baseMemories));
    expect(groups[0].days[0].summary).toBe('千岛湖 · 2条鱼获 · 2种鱼');
    expect(groups[2].days[0].summary).toBe('1条鱼获 · 1种鱼');
  });
});

describe('resolveGrowthMarks', () => {
  it('里程碑按时间正序计数（第10条等）', () => {
    const catches = Array.from({ length: 12 }, (_, index) =>
      makeCatch(`x${index}`, 'grass', '草鱼', `2026-01-${String(index + 1).padStart(2, '0')}T09:00:00Z`),
    );
    const marks = resolveGrowthMarks(buildEntries(catches, {}));
    // 时间正序第 10 条 = x9
    expect(marks.get('x9')?.milestone).toBe(10);
    expect(marks.get('x8')?.milestone).toBeUndefined();
  });

  it('首条某鱼种 / 同鱼种最长最重（全局最长不算草鱼的）', () => {
    const marks = resolveGrowthMarks(buildEntries(baseCatches, baseMemories));
    // 草鱼首条 = c（2026-08-15 早于 a）
    expect(marks.get('c')?.firstSpecies).toBe(true);
    expect(marks.get('a')?.firstSpecies).toBeUndefined();
    // 草鱼最长 = c(55) 而非 a(42)
    expect(marks.get('c')?.longest).toBe(true);
    expect(marks.get('a')?.longest).toBeUndefined();
    // 鲤鱼最重 = d(2.4)；鲫鱼无尺寸数据无标记
    expect(marks.get('d')?.heaviest).toBe(true);
    expect(marks.get('b')?.longest).toBeUndefined();
  });

  it('列表徽章优先级：里程碑 > 首条 > 尺寸（最长·最重合并）', () => {
    expect(primaryGrowthMarkLabel({ milestone: 100 }, '草鱼')).toBe('第100条');
    expect(primaryGrowthMarkLabel({ firstSpecies: true }, '草鱼')).toBe('首条草鱼');
    expect(primaryGrowthMarkLabel({ longest: true, heaviest: true }, '草鱼')).toBe('最长 · 最重');
    expect(primaryGrowthMarkLabel({ longest: true }, '草鱼')).toBe('最长');
    expect(primaryGrowthMarkLabel({}, '草鱼')).toBeNull();
  });
});

describe('matchSearch', () => {
  const entries = buildEntries(baseCatches, baseMemories);
  const marks = resolveGrowthMarks(entries);

  it('匹配鱼种', () => {
    expect(matchSearch(entries[0], '草鱼', marks)).toBe(true);
    expect(matchSearch(entries[0], '鲫鱼', marks)).toBe(false);
  });

  it('匹配地点与日期（9月23日 / 2026年9月 / 2026-09-23）', () => {
    expect(matchSearch(entries[0], '千岛湖', marks)).toBe(true);
    expect(matchSearch(entries[0], '9月23日', marks)).toBe(true);
    expect(matchSearch(entries[0], '2026年9月', marks)).toBe(true);
    expect(matchSearch(entries[0], '2026-09-23', marks)).toBe(true);
    expect(matchSearch(entries[0], '9月22日', marks)).toBe(false);
  });

  it('多关键词 AND + 可读 Growth Mark 文案', () => {
    expect(matchSearch(entries[0], '草鱼 千岛湖', marks)).toBe(true);
    expect(matchSearch(entries[0], '草鱼 钱塘江', marks)).toBe(false);
    // c = 首条草鱼 + 最长
    expect(matchSearch(entries[2], '首条草鱼', marks)).toBe(true);
    expect(matchSearch(entries[2], '最长', marks)).toBe(true);
  });

  it('大小写不敏感（拉丁字符）', () => {
    expect(matchSearch(entries[0], 'SEP', marks)).toBe(true);
    expect(matchSearch(entries[0], 'sep', marks)).toBe(true);
  });
});

describe('matchFilter 四维（同维 OR / 跨维 AND）', () => {
  const entries = buildEntries(baseCatches, baseMemories);
  const marks = resolveGrowthMarks(entries);
  const now = new Date('2026-09-30T12:00:00Z');

  const filterWith = (over: Partial<MyCatchesFilterState>): MyCatchesFilterState => ({
    ...EMPTY_FILTER,
    ...over,
  });

  it('默认 不限 全通过且不激活', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    entries.forEach((entry) => {
      expect(matchFilter(entry, EMPTY_FILTER, marks, now)).toBe(true);
    });
  });

  it('鱼种多选 OR', () => {
    const filter = filterWith({ species: ['grass', 'carp'] });
    expect(matchFilter(entries[0], filter, marks, now)).toBe(true); // 草鱼
    expect(matchFilter(entries[1], filter, marks, now)).toBe(false); // 鲫鱼
    expect(matchFilter(entries[3], filter, marks, now)).toBe(true); // 鲤鱼
  });

  it('时间：本月 / 今年', () => {
    const thisMonth = filterWith({ time: 'thisMonth' });
    expect(matchFilter(entries[0], thisMonth, marks, now)).toBe(true);
    expect(matchFilter(entries[2], thisMonth, marks, now)).toBe(false);
    const thisYear = filterWith({ time: 'thisYear' });
    entries.forEach((entry) => {
      expect(matchFilter(entry, thisYear, marks, now)).toBe(true);
    });
  });

  it('尺寸：长度与重量独立、均设为 AND、无值不命中', () => {
    // a: 42cm 1.2kg；d: 30cm 2.4kg
    const lengthOnly = filterWith({ lengthQuick: '40to60' });
    expect(matchFilter(entries[0], lengthOnly, marks, now)).toBe(true);
    expect(matchFilter(entries[3], lengthOnly, marks, now)).toBe(false);
    const both = filterWith({ lengthQuick: '40to60', weightQuick: 'gte3' });
    entries.forEach((entry) => {
      expect(matchFilter(entry, both, marks, now)).toBe(false);
    }); // 42cm 的 1.2kg 不满足 ≥3kg；2.4kg 的 30cm 不满足 40-60
    expect(isFilterActive(both)).toBe(true);
  });

  it('特殊记录：首条 / 最长 / 里程碑 按真实记录属性', () => {
    const first = filterWith({ special: ['first'] });
    expect(matchFilter(entries[2], first, marks, now)).toBe(true); // c 首条草鱼
    expect(matchFilter(entries[0], first, marks, now)).toBe(false);
    const longest = filterWith({ special: ['longest'] });
    expect(matchFilter(entries[2], longest, marks, now)).toBe(true); // c 同鱼种最长
  });
});

describe('resolveEmptyKind 优先级', () => {
  it('loading/error → 无空态；raw 0 → archive；query → search 先于 filter', () => {
    expect(
      resolveEmptyKind({
        loading: true,
        hasError: false,
        rawCount: 0,
        query: '',
        filterActive: false,
        resultCount: 0,
      }),
    ).toBeNull();
    expect(
      resolveEmptyKind({
        loading: false,
        hasError: false,
        rawCount: 0,
        query: '',
        filterActive: false,
        resultCount: 0,
      }),
    ).toBe('archive');
    expect(
      resolveEmptyKind({
        loading: false,
        hasError: false,
        rawCount: 5,
        query: '不存在',
        filterActive: true,
        resultCount: 0,
      }),
    ).toBe('search');
    expect(
      resolveEmptyKind({
        loading: false,
        hasError: false,
        rawCount: 5,
        query: '',
        filterActive: true,
        resultCount: 0,
      }),
    ).toBe('filter');
  });
});

describe('daySummary', () => {
  it('N = 可见记录数、M = 去重鱼种数', () => {
    const entries = buildEntries(baseCatches.slice(0, 2), baseMemories);
    expect(daySummary(entries)).toBe('千岛湖 · 2条鱼获 · 2种鱼');
  });
});
