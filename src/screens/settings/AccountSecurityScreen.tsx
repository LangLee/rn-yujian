import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { palette } from '../../constants/colors';
import { radius, spacing, typeScale } from '../../constants/tokens';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { GlassCard } from '../../components/ui/GlassCard';
import { PressableScale } from '../../components/ui/PressableScale';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components';
import { haptics } from '../../utils/haptics';

type AccountSecurityNavigationProp = StackNavigationProp<RootStackParamList, 'AccountSecurity'>;

/**
 * 账号与安全（设计文档 13.5 精简版）：
 * V1 只保留 登录账号 / 修改密码 / 退出登录 / 注销账号；
 * 不默认加入登录设备、数据恢复中心等尚未存在的能力。
 * 注销文案写「按隐私政策处理」，不承诺即时永久删除。
 */
export const AccountSecurityScreen: React.FC = () => {
  const navigation = useNavigation<AccountSecurityNavigationProp>();
  const { profile } = useTheme();
  const { session, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [logoutSheet, setLogoutSheet] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [passwordSheet, setPasswordSheet] = useState(false);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader title="账号与安全" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard noPadding style={styles.group}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: textSecondary }]}>登录账号</Text>
            <Text style={[styles.infoValue, { color: textPrimary }]}>
              {session?.username ?? '—'}
            </Text>
          </View>
          <PressableScale onPress={() => setPasswordSheet(true)} scaleTo={0.99}>
            <View style={[styles.actionRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]} pointerEvents="none">
              <Text style={[styles.actionLabel, { color: textPrimary }]}>修改密码</Text>
              <Icon name="chevron-forward" size={16} color={textSecondary} />
            </View>
          </PressableScale>
        </GlassCard>

        <GlassCard noPadding style={styles.group}>
          <PressableScale onPress={() => setLogoutSheet(true)} scaleTo={0.99}>
            <View style={styles.actionRow} pointerEvents="none">
              <Text style={[styles.actionLabel, { color: textPrimary }]}>退出登录</Text>
              <Icon name="chevron-forward" size={16} color={textSecondary} />
            </View>
          </PressableScale>
          <PressableScale onPress={() => setDeleteSheet(true)} scaleTo={0.99}>
            <View style={[styles.actionRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]} pointerEvents="none">
              <Text style={[styles.actionLabel, { color: palette.qualityInvalid }]}>注销账号</Text>
              <Icon name="chevron-forward" size={16} color={textSecondary} />
            </View>
          </PressableScale>
        </GlassCard>

        <Text style={[styles.note, { color: textSecondary }]}>
          登录设备管理、数据恢复中心等能力会在后端支持后开放。
        </Text>
      </ScrollView>

      {/* 退出登录确认 */}
      <BottomSheet visible={logoutSheet} onClose={() => setLogoutSheet(false)} title="退出登录？">
        <Text style={[styles.sheetText, { color: textSecondary }]}>
          已保存的鱼获和记忆都会留在你的账号里，下次登录还在。
        </Text>
        <PrimaryButton
          label="退出登录"
          onPress={() => {
            setLogoutSheet(false);
            haptics.confirm();
            logout();
          }}
          style={styles.sheetButton}
        />
        <PrimaryButton label="再想想" variant="ghost" onPress={() => setLogoutSheet(false)} style={styles.sheetButton} />
      </BottomSheet>

      {/* 修改密码（待后端能力） */}
      <BottomSheet visible={passwordSheet} onClose={() => setPasswordSheet(false)} title="修改密码">
        <Text style={[styles.sheetText, { color: textSecondary }]}>
          密码找回与修改需要后端账号能力支持，当前版本暂未开放，马上就来。
        </Text>
        <PrimaryButton label="知道了" onPress={() => setPasswordSheet(false)} style={styles.sheetButton} />
      </BottomSheet>

      {/* 注销确认（危险操作最终确认 S3，17.17） */}
      <BottomSheet visible={deleteSheet} onClose={() => setDeleteSheet(false)} title="注销账号？">
        <Text style={[styles.sheetText, { color: textSecondary }]}>
          注销后，你的账号与个人数据将按《隐私政策》处理。这是一步不可恢复的操作，请谨慎决定。
        </Text>
        <PrimaryButton
          label="确认注销"
          variant="danger"
          onPress={() => {
            setDeleteSheet(false);
            haptics.critical();
            logout();
          }}
          style={styles.sheetButton}
        />
        <PrimaryButton label="先保留" variant="ghost" onPress={() => setDeleteSheet(false)} style={styles.sheetButton} />
      </BottomSheet>
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
  group: {
    marginTop: spacing.lg,
    overflow: 'hidden',
  } as ViewStyle,
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
  } as ViewStyle,
  infoLabel: {
    fontSize: typeScale.meta,
  } as TextStyle,
  infoValue: {
    fontSize: typeScale.body,
    fontWeight: '600',
  } as TextStyle,
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  rowBorder: {} as ViewStyle,
  actionLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
  } as TextStyle,
  note: {
    fontSize: typeScale.caption,
    lineHeight: 19,
    marginTop: spacing.xl,
    textAlign: 'center',
  } as TextStyle,
  sheetText: {
    fontSize: typeScale.meta,
    lineHeight: 21,
    marginBottom: spacing.lg,
  } as TextStyle,
  sheetButton: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
