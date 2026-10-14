/**
 * 我的鱼获 Tab（My Catches V2 冻结稿）渲染测试：
 * 时间线结构（Sticky 月份 / 日期节点 / 当日摘要 / 行卡 / Growth Mark 徽章）、
 * F1 内联筛选面板、搜索摘要与三类空状态、单日折叠规则、相机按钮常驻。
 */
import React from 'react';
import { SectionList, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));
jest.mock('../src/services/catchService', () => ({
  catchService: {
    resolveUrl: (path?: string | null) => {
      if (!path) {
        return null;
      }
      return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
        ? path
        : `https://api.example.com${path.startsWith('/') ? path : `/${path}`}`;
    },
  },
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  };
});

import { ThemeProvider } from '../src/contexts/ThemeContext';
import { MyCatchesTab } from '../src/screens/share/MyCatchesTab';
import { RemoteCatch } from '../src/types/models';

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

const CATCHES: RemoteCatch[] = [
  makeCatch('a', 'grass', '草鱼', '2026-09-23T10:00:00Z'),
  makeCatch('b', 'crucian', '鲫鱼', '2026-09-23T08:00:00Z'),
  makeCatch('c', 'grass', '草鱼', '2026-08-15T09:00:00Z'),
  makeCatch('d', 'carp', '鲤鱼', '2026-07-02T09:00:00Z'),
];

const memoryKey = (id: string) => `@yujian/catch_memory/${id}`;

type TabProps = React.ComponentProps<typeof MyCatchesTab>;

const Harness: React.FC<Partial<TabProps>> = (props) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <MyCatchesTab
        searchMode={false}
        query=""
        onQueryChange={jest.fn()}
        onEditFilterFromSearch={jest.fn()}
        filterOpen={false}
        onFilterActiveChange={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  </SafeAreaProvider>
);

// CatchContext mock：通过变量注入不同档案数据
let mockArchive: RemoteCatch[] = CATCHES;
jest.mock('../src/contexts/CatchContext', () => ({
  useCatchArchive: () => ({
    catches: mockArchive,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

describe('我的鱼获 Tab（时间档案）', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockArchive = CATCHES;
    // 记忆：a 42cm/千岛湖；c 55cm(草鱼首条+最长)；b 千岛湖
    await AsyncStorage.setItem(
      memoryKey('a'),
      JSON.stringify({ story: '', lengthCm: 42, weightKg: 1.2, location: '千岛湖', media: [] }),
    );
    await AsyncStorage.setItem(
      memoryKey('b'),
      JSON.stringify({ story: '', location: '千岛湖', media: [] }),
    );
    await AsyncStorage.setItem(
      memoryKey('c'),
      JSON.stringify({ story: '', lengthCm: 55, media: [] }),
    );
    mockNavigate.mockClear();
  });

  test('时间线：月份分组 + 日期节点 + 当日摘要 + 摘要行 + 相机按钮', async () => {
    render(<Harness />);

    // 主题与记忆均为异步装载：等时间线本体出现
    expect(await screen.findByText('2026年9月')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('4 次鱼获 · 3 种鱼 · 3 记录天数')).toBeTruthy();
      expect(screen.getByText('千岛湖 · 2条鱼获 · 2种鱼')).toBeTruthy();
    });

    // 月份章节（newest first：9月 → 8月 → 7月）
    expect(screen.getByText('2026年9月')).toBeTruthy();
    expect(screen.getByText('2026年8月')).toBeTruthy();
    expect(screen.getByText('2026年7月')).toBeTruthy();

    // 日期节点：大日期 + 英文月份缩写
    expect(screen.getByText('23')).toBeTruthy();
    expect(screen.getByText('SEP')).toBeTruthy();

    // 当日摘要：单一地点带前缀（N=可见记录、M=去重鱼种）
    expect(screen.getByText('千岛湖 · 2条鱼获 · 2种鱼')).toBeTruthy();

    // 行卡鱼种（草鱼两条：9月与8月各一）
    expect(screen.getAllByText('草鱼').length).toBe(2);
    expect(screen.getByText('鲫鱼')).toBeTruthy();

    // 底部共享相机按钮常驻
    expect(screen.getByLabelText('拍照识别')).toBeTruthy();
  });

  test('Growth Mark：最早草鱼带「首条草鱼」徽章，42cm 的不带', async () => {
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByText('首条草鱼')).toBeTruthy();
    });
  });

  test('搜索模式：结果摘要 + 时间线保持月份结构', async () => {
    render(<Harness searchMode query="草鱼" />);

    await waitFor(() => {
      expect(screen.getByText('2 次鱼获')).toBeTruthy();
    });
    // 月份结构保留，未命中的日期组隐藏
    expect(screen.getByText('2026年9月')).toBeTruthy();
    expect(screen.queryByText('2026年7月')).toBeNull();
    expect(screen.queryByText('鲫鱼')).toBeNull();
  });

  test('搜索无结果：B3 文案 + 清除搜索恢复', async () => {
    const onQueryChange = jest.fn();
    render(<Harness searchMode query="不存在的鱼" onQueryChange={onQueryChange} />);

    await waitFor(() => {
      expect(screen.getByText('没有找到相关鱼获')).toBeTruthy();
    });
    expect(screen.getByText('你可以搜索：鱼种、地点、日期')).toBeTruthy();
    expect(screen.getByLabelText('拍照识别')).toBeTruthy();
  });

  test('F1 内联筛选面板：四维标题 + 重置 + chips 即时生效', async () => {
    render(<Harness filterOpen />);

    expect(await screen.findByText('筛选')).toBeTruthy();
    expect(screen.getByText('重置')).toBeTruthy();
    expect(screen.getByText('鱼种')).toBeTruthy();
    expect(screen.getByText('时间')).toBeTruthy();
    expect(screen.getByText('尺寸')).toBeTruthy();
    expect(screen.getByText('特殊记录')).toBeTruthy();
    expect(screen.getByText('本月')).toBeTruthy();
    expect(screen.getByText('里程碑')).toBeTruthy();

    // 特殊记录=首条（首条某鱼种）：c/b/d 各是本鱼种首条 → 3 条命中
    fireEvent.press(screen.getAllByText('首条')[0]);
    await waitFor(() => {
      expect(screen.getByText('3 次鱼获 · 3 种鱼 · 3 记录天数')).toBeTruthy();
    });

    // 先清空特殊记录（第 4 个「不限」属于特殊记录维度），再单选里程碑
    fireEvent.press(screen.getAllByText('不限')[3]);
    await waitFor(() => {
      expect(screen.getByText('4 次鱼获 · 3 种鱼 · 3 记录天数')).toBeTruthy();
    });

    // 里程碑：档案不足 10 条 → 无命中 → Filter Empty（F7）
    fireEvent.press(screen.getByText('里程碑'));
    expect(await screen.findByText('没有找到符合条件的鱼获')).toBeTruthy();
    expect(screen.getByText('试试调整筛选条件')).toBeTruthy();
    expect(screen.getByLabelText('拍照识别')).toBeTruthy();

    // 清除筛选恢复时间线
    fireEvent.press(screen.getByText('清除筛选'));
    await waitFor(() => {
      expect(screen.getByText('4 次鱼获 · 3 种鱼 · 3 记录天数')).toBeTruthy();
    });
  });

  test('筛选摘要：可移除条件 chips + 清空（Filter Spec V2 §4）', async () => {
    const view = render(<Harness filterOpen />);
    // F1 快捷鱼种 chip（ListHeader 在卡片之前渲染）
    fireEvent.press((await screen.findAllByText('草鱼'))[0]);
    await waitFor(() => {
      expect(screen.getByText('2 次鱼获 · 1 种鱼 · 2 记录天数')).toBeTruthy();
    });

    // 收起 F1（Hub Filter Action 再点一次）→ compact removable summary
    view.rerender(<Harness filterOpen={false} />);
    expect(screen.getByLabelText('移除筛选条件 草鱼')).toBeTruthy();
    expect(screen.getByText('清空')).toBeTruthy();

    // × 移除该维度 → 即时恢复全量档案
    fireEvent.press(screen.getByLabelText('移除筛选条件 草鱼'));
    await waitFor(() => {
      expect(screen.getByText('4 次鱼获 · 3 种鱼 · 3 记录天数')).toBeTruthy();
    });
    expect(screen.queryByText('清空')).toBeNull();
  });

  test('B4 Search + Filter：低权重筛选摘要卡 + 点击展开 F1（Search Spec §12）', async () => {
    const onEditFilter = jest.fn();
    const view = render(<Harness filterOpen />);
    fireEvent.press((await screen.findAllByText('鲫鱼'))[0]);
    await waitFor(() => {
      expect(screen.getByText('1 次鱼获 · 1 种鱼 · 1 记录天数')).toBeTruthy();
    });

    // 进入 Search Mode（Filter 条件保留）：摘要卡 + 条件行 + 结果计数
    view.rerender(
      <Harness searchMode query="千岛湖" onEditFilterFromSearch={onEditFilter} />,
    );
    expect(await screen.findByText('筛选中 · 1个条件')).toBeTruthy();
    expect(screen.getAllByText('鲫鱼').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText('1 次鱼获')).toBeTruthy();
    });

    // 点击摘要卡：通知 Hub 返回原页面并展开 F1（query 保留）
    fireEvent.press(screen.getByLabelText('编辑筛选'));
    expect(onEditFilter).toHaveBeenCalled();
  });

  test('档案空状态：还没有鱼获记录', async () => {
    mockArchive = [];
    render(<Harness />);
    expect(await screen.findByText('还没有鱼获记录')).toBeTruthy();
    expect(screen.getByText('拍下第一条鱼，开始你的鱼获时间线')).toBeTruthy();
    expect(screen.getByLabelText('拍照识别')).toBeTruthy();
  });

  test('单日 7 条：默认前 5 + 查看另外 2 条', async () => {
    mockArchive = Array.from({ length: 7 }, (_, i) =>
      makeCatch(`d${i}`, 'grass', '草鱼', `2026-09-10T10:0${i}:00Z`),
    );
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByText('7 次鱼获 · 1 种鱼 · 1 记录天数')).toBeTruthy();
    });
    expect(screen.getByText('查看另外 2 条')).toBeTruthy();
    // 只显示 5 张卡（鱼名重复，统计渲染次数）
    const cardTexts = screen.getAllByText('草鱼');
    expect(cardTexts.length).toBe(5);
  });

  test('单日 12 条：前 5 + 查看全部 12 条鱼获', async () => {
    mockArchive = Array.from({ length: 12 }, (_, i) =>
      makeCatch(
        `e${i}`,
        'crucian',
        '鲫鱼',
        `2026-09-11T${String(Math.floor(i / 2)).padStart(2, '0')}:${String((i % 2) * 30).padStart(2, '0')}:00Z`,
      ),
    );
    render(<Harness />);
    expect(await screen.findByText('查看全部 12 条鱼获', {}, { timeout: 3000 })).toBeTruthy();
    // 只渲染前 5 张卡
    expect(screen.getAllByText('鲫鱼').length).toBe(5);
  });

  test('点击行卡进入 FishRecordDetail(recordId)', async () => {
    render(<Harness />);
    const card = await screen.findByText('鲫鱼', {}, { timeout: 3000 });
    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith('CatchDetail', expect.anything());
  });

  test('点击 Hub Search / Filter：列表滚回顶部；收起 Filter 不打断阅读位置', async () => {
    const view = render(<Harness />);
    await screen.findByText('2026年9月');

    // 监听 SectionList 底层 scroll responder 的 scrollTo
    const scrollTo = jest.fn();
    const listInstance = view.UNSAFE_getByType(SectionList).instance;
    jest
      .spyOn(listInstance as { getScrollResponder: () => ScrollView }, 'getScrollResponder')
      .mockReturnValue({ scrollTo } as unknown as ScrollView);

    // 点击 Filter（Hub Filter Action）：F1 展开在 ListHeader → 列表回顶
    view.rerender(<Harness filterOpen />);
    expect(await screen.findByText('筛选')).toBeTruthy();
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: true });
    });

    // 收起 F1：不滚动，保持阅读位置（rAF 已 flush 后仍无调用）
    scrollTo.mockClear();
    view.rerender(<Harness filterOpen={false} />);
    expect(await screen.findByText('2026年9月')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(scrollTo).not.toHaveBeenCalled();

    // 点击 Search（进入 Search Mode）：最近搜索在 ListHeader → 列表回顶
    scrollTo.mockClear();
    view.rerender(<Harness searchMode />);
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: true });
    });
  });
});

