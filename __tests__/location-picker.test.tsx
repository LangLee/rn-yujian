/**
 * 地图选点页 UI（全屏地图版）：
 * - 左上角圆形关闭按钮，右上角搜索图标按钮
 * - 搜索条默认隐藏，点击搜索图标展开；再点收起
 * - 右侧放大 / 缩小 / 回到当前位置图标按钮
 * 注：ThemeProvider 初次挂载异步加载主题，需用 findBy* 异步查询。
 */
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../src/services/locationService', () => ({
  // 逆地理走真实 fetch 会发网请求，测试里直接给 null（页面退化为坐标展示）
  reverseGeocode: jest.fn(async () => null),
  searchPlaces: jest.fn(async () => []),
  formatCoordLabel: (lat: number, lon: number) =>
    `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
  buildConcreteAddress: () => null,
}));

jest.mock('../src/utils/haptics', () => ({
  haptics: { selection: jest.fn(), confirm: jest.fn(), critical: jest.fn(), cancel: jest.fn() },
  hapticForLevel: jest.fn(),
}));

import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { LocationPickerScreen } from '../src/screens/LocationPickerScreen';
import { RootStackParamList } from '../src/navigation/types';

const Stack = createStackNavigator<RootStackParamList>();
const HomeStub: React.FC = () => <View testID="home-stub" />;

const TestApp: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="LocationPicker" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeStub} />
            <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

describe('地图选点页（全屏地图 UI）', () => {
  test('顶部为圆形关闭 + 搜索图标按钮，无搜索条、无返回顶栏', async () => {
    render(<TestApp />);

    expect(await screen.findByLabelText('关闭地图选点')).toBeTruthy();
    expect(await screen.findByLabelText('搜索地点')).toBeTruthy();
    expect(screen.queryByPlaceholderText('搜索湖泊、水库、钓场…')).toBeNull();
    // 右侧操作列
    expect(screen.getByLabelText('放大地图')).toBeTruthy();
    expect(screen.getByLabelText('缩小地图')).toBeTruthy();
    expect(screen.getByLabelText('回到当前位置')).toBeTruthy();
  });

  test('点击搜索图标展开搜索条，再点收起', async () => {
    render(<TestApp />);

    fireEvent.press(await screen.findByLabelText('搜索地点'));
    expect(screen.getByPlaceholderText('搜索湖泊、水库、钓场…')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('收起搜索'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('搜索湖泊、水库、钓场…')).toBeNull();
    });
  });

  test('编码不可用时底部浮卡退化为坐标展示，确认按钮可用', async () => {
    render(<TestApp />);

    expect(await screen.findByText(/°[NS] /)).toBeTruthy();
    expect(screen.getByText('使用这个位置')).toBeTruthy();
  });
});
