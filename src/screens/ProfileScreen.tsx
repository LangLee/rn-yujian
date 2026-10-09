import React, { useMemo } from 'react';
import {
  Pressable,
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
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { countDistinctDays } from '../utils/formatters';
import { coreColors } from '../constants/coreUi';
import { font, fs, spacing } from '../constants/tokens';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../components/coreui/LakeContentBackdrop';
import { ProfileAvatar } from '../components/ui/ProfileAvatar';
import { SettingsCard, SettingsRow } from '../components/ui/SettingsList';
import { ScreenHeader } from '../components';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'>;

/**
 * 我的 · Page Spec V2（FROZEN）：
 * 身份卡（头像/昵称/账号身份）为主、三项钓鱼统计为支撑语境、
 * 三行设置导航（编辑个人资料 / 账号与安全 / 关于渔见）为功能层。
 * 身份卡本身不是第二个编辑资料入口；不加徽章/等级/连击等游戏化语义；
 * 头像缺失/加载失败回退 Shared Default Profile Avatar V1。
 */
export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const { avatar: localAvatar } = usePreferences();

  /* 统计为运行时派生；零值合法显示 0；加载失败也不移除账号导航 */
  const speciesCount = useMemo(
    () => new Set(catches.map((item) => item.speciesId).filter(Boolean)).size,
    [catches],
  );
  const catchCount = catches.length;
  const recordDays = useMemo(() => countDistinctDays(catches), [catches]);

  /* 昵称非空用昵称，否则用户名；长昵称安全截断 */
  const displayName = session?.nickname?.trim() || session?.username || '钓友';
  const avatarUrl = session?.avatarUrl || localAvatar || null;

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="我的" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 身份卡：头像 → 昵称 → 账号身份（唯一主层级；不可点击进入编辑），
            卡内下方嵌套钓鱼统计（冻结稿构图） */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <ProfileAvatar size={72} avatarUrl={avatarUrl} />
            <View style={styles.identityBody}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {session?.username ? (
                <Text style={styles.accountLine} numberOfLines={1}>
                  账号 {session.username}
                </Text>
              ) : null}
            </View>
          </View>

          {/* 钓鱼统计：鱼种 → 鱼鉴；鱼获 → 我的鱼获；记录天数 → 信息型 */}
          <View style={styles.statsRow}>
            <StatCell
              value={speciesCount}
              label="鱼种"
              onPress={() => navigation.navigate('Guide')}
            />
            <View style={styles.statDivider} />
            <StatCell
              value={catchCount}
              label="鱼获"
              onPress={() => navigation.navigate('MyCatches')}
            />
            <View style={styles.statDivider} />
            <StatCell value={recordDays} label="记录天数" />
          </View>
        </View>

        {/* 设置导航：冻结顺序 编辑个人资料 / 账号与安全 / 关于渔见 */}
        <SettingsCard style={styles.menuCard}>
          <SettingsRow
            icon="person-circle-outline"
            tint="teal"
            label="编辑个人资料"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            tint="blue"
            label="账号与安全"
            onPress={() => navigation.navigate('AccountSecurity')}
          />
          <SettingsRow
            icon="information-circle-outline"
            tint="amber"
            label="关于渔见"
            onPress={() => navigation.navigate('About')}
          />
        </SettingsCard>
      </ScrollView>
    </View>
  );
};

/** 统计单元：数字（衬线 UI L 档）+ 标签；信息型统计不可点击 */
const StatCell: React.FC<{
  value: number;
  label: string;
  onPress?: () => void;
}> = ({ value, label, onPress }) => {
  const body = (
    <View style={styles.statCell} pointerEvents="none">
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  if (!onPress) {
    return <View style={styles.statHit}>{body}</View>;
  }
  return (
    <Pressable
      style={styles.statHit}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
    >
      {body}
    </Pressable>
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
  identityCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.10)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    padding: spacing.lg,
    marginTop: spacing.sm,
  } as ViewStyle,
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  } as ViewStyle,
  identityBody: {
    flex: 1,
  } as ViewStyle,
  name: {
    fontFamily: font.serif,
    fontSize: fs(24),
    lineHeight: fs(32),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
    letterSpacing: 1,
  } as TextStyle,
  accountLine: {
    fontSize: fs(13),
    color: coreColors.mistBlueGray,
    marginTop: 4,
  } as TextStyle,
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(11,45,75,0.08)',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  } as ViewStyle,
  statHit: {
    flex: 1,
    alignItems: 'center',
    minHeight: 44,
  } as ViewStyle,
  statCell: {
    alignItems: 'center',
  } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: fs(24),
    lineHeight: fs(30),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  statLabel: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    marginTop: 3,
  } as TextStyle,
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: 'rgba(11,45,75,0.10)',
  } as ViewStyle,
  menuCard: {
    marginTop: spacing.xl,
  } as ViewStyle,
});
