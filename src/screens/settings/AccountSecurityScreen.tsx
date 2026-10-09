import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../../components/coreui/LakeContentBackdrop';
import { SettingsCard, SettingsRow } from '../../components/ui/SettingsList';
import { ScreenHeader } from '../../components';
import { haptics } from '../../utils/haptics';

type AccountSecurityNavigationProp = StackNavigationProp<RootStackParamList, 'AccountSecurity'>;

/**
 * 账号与安全 · Home Spec V1（FROZEN）：
 * 当前账号（只读）→ 修改密码 / 数据与隐私 → 退出当前账号。
 * 退出是低强调的登出动作，不是注销账号；本应用登出可安全终止会话，
 * V1 无需二次确认；登出后回到未认证入口（Empty Home），不说「注销成功」。
 */
export const AccountSecurityScreen: React.FC = () => {
  const navigation = useNavigation<AccountSecurityNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const { session, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    try {
      await logout();
      /* 登出后回到未认证入口（Empty Home 的「登录 ›」） */
      navigation.popTo('Home');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="账号与安全" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 当前账号：只读身份卡（不提供行内编辑/密码提示/内部 ID） */}
        <View style={styles.accountCard}>
          <Text style={styles.accountLabel}>当前账号</Text>
          <Text style={styles.accountValue} numberOfLines={1}>
            {session?.username ?? '—'}
          </Text>
        </View>

        {/* 安全导航：修改密码 / 数据与隐私 */}
        <SettingsCard style={styles.group}>
          <SettingsRow
            icon="key-outline"
            tint="blue"
            label="修改密码"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <SettingsRow
            icon="shield-outline"
            tint="teal"
            label="数据与隐私"
            onPress={() => navigation.navigate('DataPrivacy')}
          />
        </SettingsCard>

        {/* 退出当前账号：低强调危险文本行（非注销，非大主按钮） */}
        <SettingsCard style={styles.group}>
          <SettingsRow
            icon="log-out-outline"
            tint="red"
            label={loggingOut ? '正在退出…' : '退出当前账号'}
            danger
            disabled={loggingOut}
            onPress={() => {
              haptics.selection();
              void handleLogout();
            }}
          />
        </SettingsCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  } as ViewStyle,
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  accountCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.10)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  } as ViewStyle,
  accountLabel: {
    fontSize: fs(12),
    fontWeight: '500',
    color: coreColors.mistBlueGray,
    letterSpacing: 1,
  } as TextStyle,
  accountValue: {
    fontSize: fs(18),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
    marginTop: 6,
  } as TextStyle,
  group: {
    marginTop: spacing.lg,
  } as ViewStyle,
});
