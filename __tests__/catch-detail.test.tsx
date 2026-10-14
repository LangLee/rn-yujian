/**
 * 鱼获详情页（FishRecordDetail V2 冻结稿）渲染测试：
 * Hero 底部叠字（鱼名 / 长度·重量·地点 / 编辑>）、关于这次鱼获、
 * 鱼获记忆（计数 + 无上传记忆空态 + 三操作 + 方格）、B 面 Flip 与生成模块、编辑工作台。
 */
import React from 'react';
import { Image, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/components/WaterBackdrop', () => ({ WaterBackdrop: () => null }));
jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));
// 隔离 authService → react-native-config 的原生依赖链；B 面生成端点桩化
jest.mock('../src/services/catchService', () => ({
  catchService: {
    // 与 apiClient.resolveMediaUrl 行为对齐：带协议的 URI（file:// 等）原样返回
    resolveUrl: (path?: string | null) => {
      if (!path) {
        return null;
      }
      return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
        ? path
        : `https://api.example.com${path.startsWith('/') ? path : `/${path}`}`;
    },
    createBsideJob: jest.fn(),
    bsideStatus: jest.fn(),
  },
}));
const mockSessionRef: { current: { accessToken: string } | null } = { current: null };
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSessionRef.current }),
}));
jest.mock('../src/contexts/CatchContext', () => ({
  useCatchArchive: () => ({ catches: [] }),
}));
jest.mock('../src/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ lengthUnit: 'cm', weightUnit: 'kg' }),
}));

import { catchService } from '../src/services/catchService';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { CatchDetailScreen } from '../src/screens/CatchDetailScreen';
import { RootStackParamList } from '../src/navigation/types';

const Stack = createStackNavigator<RootStackParamList>();

const HomeStub: React.FC = () => <View />;

const TestApp: React.FC<{ params?: Record<string, unknown> }> = ({ params }) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="CatchDetail" screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="CatchDetail"
            component={CatchDetailScreen}
            initialParams={
              params ?? {
                catchId: '',
                initialMemory: { lengthCm: 53, weightKg: 2.1, location: '浙江·千岛湖' },
              }
            }
          />
          <Stack.Screen name="Home" component={HomeStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  </SafeAreaProvider>
);

const remoteImageSources = () =>
  screen
    .UNSAFE_getAllByType(Image)
    .map((img) => img.props.source)
    .filter((source) => !Array.isArray(source));

describe('鱼获详情页（冻结稿）', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockSessionRef.current = null;
    jest.clearAllMocks();
  });

  test('Hero 底部叠字：鱼名 + 数据行 + 编辑胶囊；无上传记忆空态与三操作', async () => {
    render(<TestApp />);

    expect(await screen.findByText('鱼获详情')).toBeTruthy();
    // Hero 叠字：鱼名 + 「长度 · 重量 · 地点」单行数据（V2 无时间）
    expect(screen.getByText('草鱼')).toBeTruthy();
    expect(screen.getByText('53 cm · 2.1 kg · 浙江·千岛湖')).toBeTruthy();
    expect(screen.getByLabelText('编辑鱼获信息')).toBeTruthy();
    expect(screen.queryByText(/时间/)).toBeNull();

    // 关于这次鱼获：无故事时占位文案
    expect(screen.getByText('关于这次鱼获')).toBeTruthy();
    expect(screen.getByText('记录这一刻的感受…')).toBeTruthy();

    // 鱼获记忆：0 计数 + 冻结稿空态插画文案
    expect(screen.getByText('鱼获记忆')).toBeTruthy();
    expect(screen.getByText('0 张照片 · 0 段视频')).toBeTruthy();
    expect(screen.getByText('留下这次鱼获的画面')).toBeTruthy();
    expect(screen.getByText('照片和视频，会让这一刻更完整。')).toBeTruthy();

    // 三个记忆操作（一排等宽）
    expect(screen.getByText('添加照片/视频')).toBeTruthy();
    expect(screen.getByText('继续拍照')).toBeTruthy();
    expect(screen.getByText('录制视频')).toBeTruthy();

    // 未登录 / 非真实记录：不显示生成模块，也不显示 Flip
    expect(screen.queryByText('生成鱼获记忆')).toBeNull();
    expect(screen.queryByLabelText('翻面')).toBeNull();
  });

  test('鱼获记忆：视频格展示时长角标，计数行区分照片与视频', async () => {
    await AsyncStorage.setItem(
      '@yujian/catch_memory/',
      JSON.stringify({
        story: '石滩浅水边拍摄，微风。',
        lengthCm: 53,
        weightKg: 2.1,
        location: '浙江·千岛湖',
        media: [
          { id: 'p1', uri: 'file:///tmp/a.jpg', kind: 'photo', addedAt: '2026-09-03T10:00:00Z' },
          {
            id: 'v1',
            uri: 'file:///tmp/a.mp4',
            kind: 'video',
            durationSec: 75,
            addedAt: '2026-09-03T10:00:00Z',
          },
        ],
      }),
    );

    render(<TestApp />);

    expect(await screen.findByText('1 张照片 · 1 段视频')).toBeTruthy();
    expect(await screen.findByText('石滩浅水边拍摄，微风。')).toBeTruthy();
    expect(screen.getByText('1:15')).toBeTruthy();
    // 有媒体时不再显示空态插画文案
    expect(screen.queryByText('留下这次鱼获的画面')).toBeNull();
  });

  // 回归：记忆媒体的 file:// URI 曾被 resolveUrl 拼成「API域名/file://...」，
  // 查看器第二张起加载失败落白色占位卡
  test('媒体查看器：记忆媒体 file:// 原样进入 Image，不被拼接 API 域名', async () => {
    await AsyncStorage.setItem(
      '@yujian/catch_memory/',
      JSON.stringify({
        media: [
          { id: 'p1', uri: 'file:///tmp/a.jpg', kind: 'photo', addedAt: '2026-09-03T10:00:00Z' },
          { id: 'p2', uri: 'file:///tmp/b.jpg', kind: 'photo', addedAt: '2026-09-03T10:01:00Z' },
        ],
      }),
    );

    render(<TestApp />);
    expect(await screen.findByText('2 张照片 · 0 段视频')).toBeTruthy();

    // 打开第二张（此前白卡的首个位置）
    fireEvent.press(screen.getByLabelText('查看记忆照片 2'));
    expect(await screen.findByText('2 / 2')).toBeTruthy();

    const sources = remoteImageSources();
    // 查看器与方格各自渲染同一 file:// URI，均未被误拼
    expect(
      sources.filter((source) => source?.uri === 'file:///tmp/b.jpg').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      sources.some((source) => source?.uri?.includes('api.example.com/file://')),
    ).toBe(false);
  });

  test('Hero 照片经 resolveUrl 解析相对路径后渲染（原生 Image 不认相对路径）', async () => {
    render(
      <TestApp
        params={{
          catchId: 'catch_1',
          initialCatch: {
            id: 'catch_1',
            imageUrl: '/uploads/fish_01.jpg',
            speciesId: 'grass_carp',
            speciesName: '草鱼',
            confidence: 0.92,
            modelVersion: 'v1',
            capturedAt: '2026-09-03T18:20:00+08:00',
            createdAt: '2026-09-03T18:21:00+08:00',
          },
        }}
      />,
    );

    expect(await screen.findByText('草鱼')).toBeTruthy();
    expect(
      remoteImageSources().some(
        (source) => source?.uri === 'https://api.example.com/uploads/fish_01.jpg',
      ),
    ).toBe(true);
  });

  test('B 面 READY：Flip 图标可见并渲染生成资产；首次揭示不再重复', async () => {
    render(
      <TestApp
        params={{
          catchId: 'catch_b',
          initialCatch: {
            id: 'catch_b',
            imageUrl: '/uploads/fish_02.jpg',
            speciesId: 'grass_carp',
            speciesName: '草鱼',
            confidence: 0.92,
            modelVersion: 'v1',
            capturedAt: '2026-09-03T18:20:00+08:00',
            createdAt: '2026-09-03T18:21:00+08:00',
            bsideStatus: 'READY',
            bsideUri: '/bside/fish_02.png',
          },
        }}
      />,
    );

    // Flip 仅 READY 可见；B 面资产经 resolveUrl 后进入 Image source
    expect(await screen.findByLabelText('翻面')).toBeTruthy();
    expect(
      remoteImageSources().some(
        (source) => source?.uri === 'https://api.example.com/bside/fish_02.png',
      ),
    ).toBe(true);
    // READY 时不显示生成模块
    expect(screen.queryByText('生成鱼获记忆')).toBeNull();

    // 首次自动揭示完成后标记落盘（至多一次）
    await waitFor(
      async () => {
        const raw = await AsyncStorage.getItem('@yujian/catch_memory/catch_b');
        expect(raw && JSON.parse(raw).bsideFirstRevealDone).toBe(true);
      },
      { timeout: 4000 },
    );
  });

  // 生成入口暂时屏蔽（CatchDetailScreen MEMORY_GENERATION_ENABLED = false）：
  // 登录 + 真实记录下也不显示生成模块；恢复开关后需还原为原流程测试
  test('生成模块：入口暂时屏蔽，登录后也不显示', async () => {
    mockSessionRef.current = { accessToken: 'token' };

    render(
      <TestApp
        params={{
          catchId: 'catch_9',
          initialCatch: {
            id: 'catch_9',
            imageUrl: '/uploads/fish_09.jpg',
            speciesId: 'grass_carp',
            speciesName: '草鱼',
            confidence: 0.9,
            modelVersion: 'v1',
            capturedAt: '2026-09-03T18:20:00+08:00',
            createdAt: '2026-09-03T18:21:00+08:00',
          },
        }}
      />,
    );

    expect(await screen.findByText('草鱼')).toBeTruthy();
    expect(screen.queryByText('为这次相遇生成一份鱼获记忆')).toBeNull();
    expect(screen.queryByText('生成鱼获记忆')).toBeNull();
    expect(catchService.createBsideJob).not.toHaveBeenCalled();
  });

  test('编辑工作台：草稿回填、非法数值拦截保存、保存后数据行更新', async () => {
    render(<TestApp />);
    await screen.findByText('草鱼');

    // 编辑 > 进入整合编辑工作台
    fireEvent.press(screen.getByLabelText('编辑鱼获信息'));
    expect(await screen.findByText('编辑鱼获信息')).toBeTruthy();
    expect(screen.getByText('鱼种')).toBeTruthy();
    expect(screen.getByText('长度')).toBeTruthy();
    expect(screen.getByText('重量')).toBeTruthy();
    expect(screen.getByText('地点')).toBeTruthy();
    expect(screen.getByText('写下这次鱼获的故事')).toBeTruthy();
    expect(screen.getByText('取消')).toBeTruthy();
    expect(screen.getByText('保存修改')).toBeTruthy();

    // 草稿回填当前值
    expect(screen.getByDisplayValue('53')).toBeTruthy();
    expect(screen.getByDisplayValue('2.1')).toBeTruthy();

    // 非正数输入 → 保存被拦截，工作台不关闭
    fireEvent.changeText(screen.getByDisplayValue('53'), 'abc');
    fireEvent.press(screen.getByText('保存修改'));
    expect(await screen.findByText('编辑鱼获信息')).toBeTruthy();
    expect(screen.getByText('长度和重量需为正数，或留空')).toBeTruthy();

    // 修正后保存 → 关闭工作台，Hero 数据行更新
    fireEvent.changeText(screen.getByDisplayValue('abc'), '61');
    fireEvent.press(screen.getByText('保存修改'));
    await waitFor(() => {
      expect(screen.queryByText('编辑鱼获信息')).toBeNull();
    });
    expect(await screen.findByText('61 cm · 2.1 kg · 浙江·千岛湖')).toBeTruthy();
  });
});
