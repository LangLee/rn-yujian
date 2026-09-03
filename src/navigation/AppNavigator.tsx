import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { palette } from '../constants/colors';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { IdentifyScreen } from '../screens/IdentifyScreen';
import { RecognizingScreen } from '../screens/RecognizingScreen';
import { RecognitionResultScreen } from '../screens/RecognitionResultScreen';
import { RecognitionIssueScreen } from '../screens/RecognitionIssueScreen';
import { FishSpeciesDetailScreen } from '../screens/FishSpeciesDetailScreen';
import { ShareCenterScreen } from '../screens/ShareCenterScreen';
import { CatchDetailScreen } from '../screens/CatchDetailScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

/** 顶部安全区包装（原 app 由 Scaffold insets 处理）。 */
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

/** 全屏安全区包装（用于登录/注册等独立路由页面）。 */
const withFullScreenSafeArea = <P extends object>(Component: React.ComponentType<P>): React.FC<P> => {
  const Wrapped: React.FC<P> = (props) => (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={{ flex: 1}}
    >
      <Component {...props} />
    </SafeAreaView>
  );
  Wrapped.displayName = `WithFullScreenSafeArea(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
};

/** 认证路由栈（登录/注册独立全屏展示）。 */
const AuthStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={withFullScreenSafeArea(LoginScreen)} />
    <Stack.Screen name="Register" component={withFullScreenSafeArea(RegisterScreen)} />
  </Stack.Navigator>
);

/**
 * 根导航（对应原 YujianApp.kt NavHost）：
 * 未登录 -> AuthStack（Login/Register 独立全屏路由）；已登录 -> Main + 全屏流程页。
 * 流程页（Identify/Recognizing/Result 等）在 Stack 顶层，天然不显示底部栏，
 * 与原 app bottomVisibleRoutes = {home, guide, my} 的行为一致。
 */
export const AppNavigator: React.FC = () => {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={palette.waterTeal} />
      </View>
    );
  }

  if (!session) {
    return <AuthStack />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen name="Identify" component={withSafeArea(IdentifyScreen)} />
      <Stack.Screen name="Recognizing" component={withSafeArea(RecognizingScreen)} />
      <Stack.Screen name="Result" component={withSafeArea(RecognitionResultScreen)} />
      <Stack.Screen name="RecognitionIssue" component={withSafeArea(RecognitionIssueScreen)} />
      <Stack.Screen name="Species" component={withSafeArea(FishSpeciesDetailScreen)} />
      <Stack.Screen name="Share" component={withSafeArea(ShareCenterScreen)} />
      <Stack.Screen name="CatchDetail" component={withSafeArea(CatchDetailScreen)} />
    </Stack.Navigator>
  );
};

const styles = {
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.warmBackground,
  } as const,
};

export default AppNavigator;
