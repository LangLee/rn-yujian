import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YujianBottomNav } from '../components/YujianBottomNav';
import { palette } from '../constants/colors';
import { HomeScreen } from '../screens/HomeScreen';
import { FishGuideHomeScreen } from '../screens/FishGuideHomeScreen';
import { MyScreen } from '../screens/MyScreen';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** 顶部安全区包装（底部由 YujianBottomNav 自行处理）。 */
const withSafeArea = <P extends object>(Component: React.ComponentType<P>): React.FC<P> => {
  const Wrapped: React.FC<P> = (props) => (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: palette.warmBackground }}
    >
      <Component {...props} />
    </SafeAreaView>
  );
  Wrapped.displayName = `WithSafeArea(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
};

/** 识鱼 tab 占位：点击底部栏识鱼按钮直接跳全屏页，此 tab 不展示内容。 */
const IdentifyTabPlaceholder: React.FC = () => <View style={{ flex: 1, backgroundColor: palette.warmBackground }} />;

/** 主界面 Tabs：首页 · 识鱼 · 图鉴 · 我的（对应原 bottomItems）。 */
export const MainTabNavigator: React.FC = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: { display: 'none' },
    }}
    tabBar={(props) => <YujianBottomNav {...props} />}
  >
    <Tab.Screen name="Home" component={withSafeArea(HomeScreen)} />
    <Tab.Screen name="Identify" component={IdentifyTabPlaceholder} />
    <Tab.Screen name="Guide" component={withSafeArea(FishGuideHomeScreen)} />
    <Tab.Screen name="My" component={withSafeArea(MyScreen)} />
  </Tab.Navigator>
);
