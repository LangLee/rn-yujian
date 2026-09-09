/**
 * 鱼获详情页（千岛湖高保真稿）渲染冒烟测试：
 * 鱼名 + 金色规线卡、三列数据（长度/重量/地点）、时间行、记忆 chips 与视频格。
 */
import React from 'react';
import { Image, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { render, screen, act } from '@testing-library/react-native';
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
// 隔离 authService → react-native-config 的原生依赖链
jest.mock('../src/services/catchService', () => ({
  catchService: {
    resolveUrl: (path?: string | null) =>
      path ? `https://api.example.com${path.startsWith('/') ? path : `/${path}`}` : null,
  },
}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ session: null }),
}));
jest.mock('../src/contexts/CatchContext', () => ({
  useCatchArchive: () => ({ catches: [] }),
}));
jest.mock('../src/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ lengthUnit: 'cm', weightUnit: 'kg' }),
}));

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

describe('鱼获详情页', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('渲染鱼名卡：三列数据 + 时间行（数值式时间戳）', async () => {
    render(<TestApp />);

    expect(await screen.findByText('鱼获详情')).toBeTruthy();
    expect(screen.getByText('草鱼')).toBeTruthy();

    // 三列数据：长度 / 重量 / 地点
    expect(screen.getByText('53')).toBeTruthy();
    expect(screen.getByText('cm')).toBeTruthy();
    expect(screen.getByText('2.1')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText('浙江·千岛湖')).toBeTruthy();
    expect(screen.getByText('长度')).toBeTruthy();
    expect(screen.getByText('重量')).toBeTruthy();
    expect(screen.getByText('地点')).toBeTruthy();

    // 时间行：2026.09.08 15:26 形式
    expect(screen.getByText('时间')).toBeTruthy();
    expect(screen.getByText(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/)).toBeTruthy();

    // 记忆操作 chips
    expect(screen.getByText('添加照片 / 视频')).toBeTruthy();
    expect(screen.getByText('继续拍照')).toBeTruthy();
    expect(screen.getByText('录制视频')).toBeTruthy();
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
    const sources = screen
      .UNSAFE_getAllByType(Image)
      .map((img) => img.props.source)
      .filter((source) => !Array.isArray(source));
    expect(
      sources.some((source) => source?.uri === 'https://api.example.com/uploads/fish_01.jpg'),
    ).toBe(true);
  });
});
