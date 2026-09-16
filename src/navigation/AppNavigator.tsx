import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { palette } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { IdentifyScreen } from '../screens/IdentifyScreen';
import { RecognizingScreen } from '../screens/RecognizingScreen';
import { RecognitionResultScreen } from '../screens/RecognitionResultScreen';
import { RecognitionIssueScreen } from '../screens/RecognitionIssueScreen';
import { FishSpeciesDetailScreen } from '../screens/FishSpeciesDetailScreen';
import { CatchDetailScreen } from '../screens/CatchDetailScreen';
import { CatchHubScreen } from '../screens/share/CatchHubScreen';
import { ShareCreateScreen } from '../screens/share/ShareCreateScreen';
import { SharePreviewScreen } from '../screens/share/SharePreviewScreen';
import { AnnualReviewScreen } from '../screens/share/AnnualReviewScreen';
import { FishGuideHomeScreen } from '../screens/FishGuideHomeScreen';
import { RecordCalendarScreen } from '../screens/RecordCalendarScreen';
import { SpeciesPickerScreen } from '../screens/SpeciesPickerScreen';
import { LocationPickerScreen } from '../screens/LocationPickerScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ThemeSettingsScreen } from '../screens/settings/ThemeSettingsScreen';
import { PrivacySettingsScreen } from '../screens/settings/PrivacySettingsScreen';
import { UnitsSettingsScreen } from '../screens/settings/UnitsSettingsScreen';
import { AccountSecurityScreen } from '../screens/settings/AccountSecurityScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';
import { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

/**
 * 根导航（设计文档 02 信息架构与导航）：
 * 不使用传统底部 Tab —— 首页沉浸式结构承载全部长期入口：
 * 统计摘要 → 鱼鉴 / 我的渔获 / 记录日历；底部中央相机 → P02；右上角 → 我的。
 */

/** 认证路由栈（登录/注册独立全屏展示）。 */
const AuthStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

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
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // 轻位移 + Fade 页面转场（17.18）
        transitionSpec: {
          open: { animation: 'timing', config: { duration: 280 } },
          close: { animation: 'timing', config: { duration: 240 } },
        },
        cardStyleInterpolator: ({ current, next, layouts }) => {
          const translate = current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width * 0.08, 0],
          });
          const opacity = current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
          const nextOpacity = next
            ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] })
            : undefined;
          return {
            cardStyle: { opacity, transform: [{ translateX: translate }] },
            overlayStyle: nextOpacity ? { opacity: 1 } : undefined,
          };
        },
        cardOverlayEnabled: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Identify" component={IdentifyScreen} />
      <Stack.Screen name="Recognizing" component={RecognizingScreen} />
      <Stack.Screen name="Result" component={RecognitionResultScreen} />
      <Stack.Screen name="RecognitionIssue" component={RecognitionIssueScreen} />
      {/* ScreenHeader 自带 insets.top 安全区 padding，再包 withSafeAreaTop 会双倍顶部间距 */}
      <Stack.Screen name="Species" component={FishSpeciesDetailScreen} />
      <Stack.Screen name="CatchDetail" component={CatchDetailScreen} />
      <Stack.Screen name="MyCatches" component={CatchHubScreen} />
      <Stack.Screen name="ShareCreate" component={ShareCreateScreen} />
      <Stack.Screen name="SharePreview" component={SharePreviewScreen} />
      <Stack.Screen name="AnnualReview" component={AnnualReviewScreen} />
      <Stack.Screen name="Guide" component={FishGuideHomeScreen} />
      <Stack.Screen name="Calendar" component={RecordCalendarScreen} />
      <Stack.Screen name="SpeciesPicker" component={SpeciesPickerScreen} />
      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen name="UnitsSettings" component={UnitsSettingsScreen} />
      <Stack.Screen name="AccountSecurity" component={AccountSecurityScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
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
