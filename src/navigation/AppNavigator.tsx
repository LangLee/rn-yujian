import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
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
import { CatchDayScreen } from '../screens/share/myCatches/CatchDayScreen';
import { ShareCreateScreen } from '../screens/share/ShareCreateScreen';
import { SharePreviewScreen } from '../screens/share/SharePreviewScreen';
import { AnnualReviewScreen } from '../screens/share/AnnualReviewScreen';
import { FishGuideHomeScreen } from '../screens/FishGuideHomeScreen';
import { RecordCalendarScreen } from '../screens/RecordCalendarScreen';
import { SpeciesPickerScreen } from '../screens/SpeciesPickerScreen';
import { LocationPickerScreen } from '../screens/LocationPickerScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { PrivacySettingsScreen } from '../screens/settings/PrivacySettingsScreen';
import { UnitsSettingsScreen } from '../screens/settings/UnitsSettingsScreen';
import { AccountSecurityScreen } from '../screens/settings/AccountSecurityScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';
import { RootStackParamList } from './types';

const Stack = createStackNavigator<RootStackParamList>();

/**
 * 根导航（设计文档 02 信息架构与导航 + Core UI V1 手册 4.1）：
 * 不使用传统底部 Tab —— 首页沉浸式结构承载全部长期入口：
 * 统计摘要 → 鱼鉴 / 我的渔获 / 记录日历；底部中央相机 → P02；右上角 → 我的。
 *
 * Login/Guest 不决定 Empty/Normal：未登录也直接进入 Home（Empty Home V2
 * 是品牌与环境基线，右上角提供「登录 ›」入口），登录/注册作为可推入的
 * 普通页面存在；登录成功后返回 Home，由 session 变化驱动界面刷新。
 */
export const AppNavigator: React.FC = () => {
  const { initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={palette.waterTeal} />
      </View>
    );
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
      {/* 登录/注册：未登录时从 Empty Home「登录 ›」/相机入口推入；登录成功后返回 */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Identify" component={IdentifyScreen} />
      {/* 识别流程（P03/P04/失败页）改用不透明滑动转场：全局的淡入淡出在中段是半透明的，
          原生 ScreenStack 在页面 attach/detach 变更时的合成抖动会从半透明窗口透出
          栈底的主页内容；滑动转场进出全程不透明，不给透底留窗口。
          注意：不能改用 detachPreviousScreen: false 保持下层页面挂载——本应用
          IdentifyScreen 挂载时 reset()、Recognizing 冻结照片等生命周期都依赖
          “被覆盖页面卸载重挂”的默认语义 */}
      <Stack.Screen
        name="Recognizing"
        component={RecognizingScreen}
        options={{ cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }}
      />
      <Stack.Screen
        name="Result"
        component={RecognitionResultScreen}
        options={{ cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }}
      />
      <Stack.Screen
        name="RecognitionIssue"
        component={RecognitionIssueScreen}
        options={{ cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS }}
      />
      {/* ScreenHeader 自带 insets.top 安全区 padding，再包 withSafeAreaTop 会双倍顶部间距 */}
      <Stack.Screen name="Species" component={FishSpeciesDetailScreen} />
      <Stack.Screen name="CatchDetail" component={CatchDetailScreen} />
      <Stack.Screen name="MyCatches" component={CatchHubScreen} />
      {/* 当天鱼获详情：My Catches 时间线单日 >10 条「查看全部」进入 */}
      <Stack.Screen name="CatchDay" component={CatchDayScreen} />
      <Stack.Screen name="ShareCreate" component={ShareCreateScreen} />
      <Stack.Screen name="SharePreview" component={SharePreviewScreen} />
      <Stack.Screen name="AnnualReview" component={AnnualReviewScreen} />
      <Stack.Screen name="Guide" component={FishGuideHomeScreen} />
      <Stack.Screen name="Calendar" component={RecordCalendarScreen} />
      <Stack.Screen name="SpeciesPicker" component={SpeciesPickerScreen} />
      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
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
