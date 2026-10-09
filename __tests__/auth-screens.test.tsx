/**
 * 登录 / 注册 V2 冒烟与背景层回归：
 * - 页面渲染冻结文案层级（标题/副标题/字段/CTA）；
 * - 背景层（Morning_Lake_Master_V1 湖景 + 草丛）必须存在于页面中；
 * - 回归：KAV/ScrollView 等普通流容器不得携带不透明背景色，
 *   否则会作为绝对定位背景层的后渲染兄弟节点整屏盖住湖景
 *   （AuthV2Shell 曾出现的「登录页看不到背景图」缺陷）。
 */
import React from 'react';
import { Image, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
  };
});

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    initializing: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    applyProfile: jest.fn(),
  }),
}));

import { ThemeProvider } from '../src/contexts/ThemeContext';
import { PreferencesProvider } from '../src/contexts/PreferencesContext';
import { LoginScreen } from '../src/screens/LoginScreen';
import { RegisterScreen } from '../src/screens/RegisterScreen';

const TestApp: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <PreferencesProvider>{children}</PreferencesProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

/** ThemeProvider 异步加载完成后才挂载子树：断言背景层/容器前先等待首个文本 */
function assertTransparent(element: { props: { style?: unknown } }): void {
  const style = element.props.style as Record<string, unknown> | undefined;
  const hasBg = Array.isArray(style)
    ? (style.flat() as Record<string, unknown>[]).some((s) => s && 'backgroundColor' in s)
    : Boolean(style && 'backgroundColor' in style);
  expect(hasBg).toBeFalsy();
}

describe('登录页 Login V2.1', () => {
  test('渲染冻结内容层级，且背景湖景存在', async () => {
    const view = render(
      <TestApp>
        <LoginScreen />
      </TestApp>,
    );

    expect(await screen.findByText('欢迎回来')).toBeTruthy();
    expect(screen.getByText('继续记录你的每一次渔获')).toBeTruthy();
    expect(screen.getByText('忘记密码？')).toBeTruthy();
    expect(screen.getByText('登录')).toBeTruthy();
    expect(screen.getByText('创建账号')).toBeTruthy();

    /* 背景湖景 Image 必须存在（Morning_Lake_Master_V1 / BG_CONTENT） */
    expect(view.UNSAFE_queryAllByType(Image).length).toBeGreaterThanOrEqual(1);
  });

  test('回归：KAV / ScrollView 不得携带背景色盖住绝对定位背景层', async () => {
    const view = render(
      <TestApp>
        <LoginScreen />
      </TestApp>,
    );
    await screen.findByText('欢迎回来');
    assertTransparent(view.UNSAFE_getByType(KeyboardAvoidingView));
    assertTransparent(view.UNSAFE_getByType(ScrollView));
  });
});

describe('注册页 Register V2', () => {
  test('渲染冻结字段（账号/密码/昵称），且背景湖景存在', async () => {
    const view = render(
      <TestApp>
        <RegisterScreen />
      </TestApp>,
    );

    expect(await screen.findByText('创建账号')).toBeTruthy();
    expect(screen.getByText('用一个账号，留住你的钓鱼轨迹')).toBeTruthy();
    expect(screen.getByText('昵称')).toBeTruthy();
    expect(screen.getByText('3–32 位字母、数字、_ 或 -')).toBeTruthy();
    expect(screen.getByText('至少 6 位')).toBeTruthy();
    expect(screen.getByText('注册并登录')).toBeTruthy();
    expect(screen.getByText('去登录')).toBeTruthy();

    expect(view.UNSAFE_queryAllByType(Image).length).toBeGreaterThanOrEqual(1);
    assertTransparent(view.UNSAFE_getByType(KeyboardAvoidingView));
  });
});
