import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { countDistinctDays } from '../utils/formatters';
import { environmentProfiles } from '../constants/environments';
import { font, radius, spacing } from '../constants/tokens';
import { haptics } from '../utils/haptics';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { PressableScale } from '../components/ui/PressableScale';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'>;

const GOLD = '#C9A96A';

/**
 * 我的（设计文档 13.1 + 高保真参考稿）：
 * 居中标题 → 个人大卡（头像 / 昵称 / 签名 + 嵌套统计胶囊）→ 分组菜单卡
 * （行右侧显示当前值，隐私行下带金点注释）。只解决必要偏好和隐私。
 */
export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { profile, themeMode } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const { nickname: localNickname, setNickname, lengthUnit, weightUnit, privacy } = usePreferences();
  const insets = useSafeAreaInsets();
  const [profileSheet, setProfileSheet] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');

  const litSpecies = useMemo(
    () => new Set(catches.map((item) => item.speciesId).filter(Boolean)).size,
    [catches],
  );

  const displayName = localNickname || session?.nickname || session?.username || '钓友';
  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  const themeLabel =
    themeMode === 'auto' ? '自动跟随时间' : environmentProfiles[themeMode].label;
  const unitsLabel = `${lengthUnit} / ${weightUnit}`;
  const shareLevelLabel =
    privacy.shareLocationLevel === 'precise'
      ? '精准位置'
      : privacy.shareLocationLevel === 'city'
        ? '城市 / 地区'
        : privacy.shareLocationLevel === 'none'
          ? '不显示地点'
          : '水域/区县级';

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 居中标题 */}
        <Text style={[styles.pageTitle, { color: textPrimary }]}>我的</Text>

        {/* 个人大卡：身份 + 嵌套统计胶囊 */}
        <View
          style={[
            styles.identityCard,
            { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
          ]}
        >
          <PressableScale onPress={() => setProfileSheet(true)} scaleTo={0.99}>
            <View style={styles.identityRow} pointerEvents="none">
              <View style={[styles.avatar, { borderColor: '#FFFFFF' }]}>
                <Text style={[styles.avatarText, { color: INK }]}>
                  {displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.identityBody}>
                <Text style={[styles.name, { color: textPrimary }]}>{displayName}</Text>
                <Text style={[styles.signature, { color: textSecondary }]}>拍照收藏每次渔获</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={textSecondary} />
            </View>
          </PressableScale>

          {/* 嵌套统计胶囊（渔获 / 已点亮鱼种 / 记录天数） */}
          <View
            style={[
              styles.statsPill,
              { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder },
            ]}
          >
            <PressableScale onPress={() => navigation.navigate('MyCatches')} scaleTo={0.97} style={styles.statHit}>
              <View style={styles.statCell} pointerEvents="none">
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, { color: textPrimary }]}>{catches.length}</Text>
                  <Icon name="fish-outline" size={14} color={GOLD} />
                </View>
                <Text style={[styles.statLabel, { color: textSecondary }]}>渔获</Text>
              </View>
            </PressableScale>
            <View style={[styles.statDivider, { backgroundColor: profile.surface.glassBorder }]} />
            <PressableScale onPress={() => navigation.navigate('Guide')} scaleTo={0.97} style={styles.statHit}>
              <View style={styles.statCell} pointerEvents="none">
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, { color: textPrimary }]}>{litSpecies}</Text>
                  <Icon name="sparkles-outline" size={14} color={GOLD} />
                </View>
                <Text style={[styles.statLabel, { color: textSecondary }]}>已点亮鱼种</Text>
              </View>
            </PressableScale>
            <View style={[styles.statDivider, { backgroundColor: profile.surface.glassBorder }]} />
            <PressableScale onPress={() => navigation.navigate('Calendar')} scaleTo={0.97} style={styles.statHit}>
              <View style={styles.statCell} pointerEvents="none">
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, { color: textPrimary }]}>
                    {countDistinctDays(catches)}
                  </Text>
                  <Icon name="calendar-outline" size={14} color={GOLD} />
                </View>
                <Text style={[styles.statLabel, { color: textSecondary }]}>记录天数</Text>
              </View>
            </PressableScale>
            <Icon name="chevron-forward" size={15} color={textSecondary} />
          </View>
        </View>

        {/* 分组一：资料与隐私 */}
        <MenuCard glass={profile.surface.glass} border={profile.surface.glassBorder}>
          <MenuRow
            icon="person-outline"
            label="个人资料"
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => setProfileSheet(true)}
          />
          <MenuRow
            icon="location-outline"
            label="隐私与定位"
            value={shareLevelLabel}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('PrivacySettings')}
          />
          <NoteRow
            text="精确记录仅用于私密渔获；分享位置默认水域/区县级；分享时不含照片GPS信息"
            color={textSecondary}
          />
          <MenuRow
            icon="share-social-outline"
            label="分享与公开"
            value="仅自己可见"
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('PrivacySettings')}
          />
          <NoteRow text="新渔获默认仅自己可见；故事文字非公开默认不被他人看到" color={textSecondary} />
        </MenuCard>

        {/* 分组二：偏好 */}
        <MenuCard glass={profile.surface.glass} border={profile.surface.glassBorder}>
          <MenuRow
            icon="leaf-outline"
            label="环境主题"
            value={themeLabel}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('ThemeSettings')}
          />
          <MenuRow
            icon="resize-outline"
            label="单位与偏好"
            value={unitsLabel}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('UnitsSettings')}
          />
        </MenuCard>

        {/* 分组三：账号 */}
        <MenuCard glass={profile.surface.glass} border={profile.surface.glassBorder}>
          <MenuRow
            icon="shield-checkmark-outline"
            label="账号与安全"
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('AccountSecurity')}
          />
          <MenuRow
            icon="information-circle-outline"
            label="关于渔见"
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => navigation.navigate('About')}
          />
        </MenuCard>
      </ScrollView>

      {/* 个人资料：昵称编辑 */}
      <BottomSheet visible={profileSheet} onClose={() => setProfileSheet(false)} title="个人资料">
        <Text style={[styles.sheetLabel, { color: textSecondary }]}>昵称</Text>
        <TextInput
          style={[
            styles.sheetInput,
            {
              color: textPrimary,
              backgroundColor: profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(23,59,75,0.04)',
            },
          ]}
          value={nicknameDraft}
          onChangeText={setNicknameDraft}
          placeholder={displayName}
          placeholderTextColor={textSecondary}
          maxLength={16}
        />
        <PrimaryButton
          label="保存"
          onPress={() => {
            setNickname(nicknameDraft.trim());
            setProfileSheet(false);
            haptics.confirm();
          }}
          style={styles.sheetButton}
        />
      </BottomSheet>
    </View>
  );
};

const INK = '#1F4A56';

const MenuCard: React.FC<{
  glass: string;
  border: string;
  children: React.ReactNode;
}> = ({ glass, border, children }) => (
  <View
    style={[styles.menuCard, { backgroundColor: glass, borderColor: border }]}
  >
    {children}
  </View>
);

const MenuRow: React.FC<{
  icon: string;
  label: string;
  value?: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}> = ({ icon, label, value, textPrimary, textSecondary, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.99}>
    <View style={styles.menuRow} pointerEvents="none">
      <Icon name={icon} size={19} color="#3E6E75" />
      <Text style={[styles.menuLabel, { color: textPrimary }]}>{label}</Text>
      {value ? <Text style={[styles.menuValue, { color: textSecondary }]}>{value}</Text> : null}
      <Icon name="chevron-forward" size={16} color={textSecondary} />
    </View>
  </PressableScale>
);

const NoteRow: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <View style={styles.noteRow}>
    <View style={styles.goldBullet} />
    <Text style={[styles.noteText, { color }]}>{text}</Text>
  </View>
);

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
  pageTitle: {
    textAlign: 'center',
    fontFamily: font.serif,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 6,
    marginVertical: spacing.md,
  } as TextStyle,
  identityCard: {
    borderRadius: radius.l + 2,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.md,
  } as ViewStyle,
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  } as ViewStyle,
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    backgroundColor: '#DDEBE9',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  avatarText: {
    fontFamily: font.serif,
    fontSize: 30,
    fontWeight: '700',
  } as TextStyle,
  identityBody: {
    flex: 1,
  } as ViewStyle,
  name: {
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  signature: {
    fontSize: 14,
    marginTop: 4,
  } as TextStyle,
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.l,
    borderWidth: 1,
    marginTop: spacing.lg,
    paddingVertical: 13,
    paddingLeft: 4,
    paddingRight: 10,
  } as ViewStyle,
  statHit: {
    flex: 1,
  } as ViewStyle,
  statCell: {
    alignItems: 'center',
  } as ViewStyle,
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
  } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 25,
  } as TextStyle,
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,
  statDivider: {
    width: 1,
    height: 30,
    opacity: 0.7,
  } as ViewStyle,
  menuCard: {
    borderRadius: radius.l + 2,
    borderWidth: 1,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
  } as ViewStyle,
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(23,59,75,0.08)',
  } as ViewStyle,
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  } as TextStyle,
  menuValue: {
    fontSize: 14,
  } as TextStyle,
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingLeft: 31,
    paddingRight: 4,
    paddingVertical: 7,
  } as ViewStyle,
  goldBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GOLD,
    marginTop: 6,
  } as ViewStyle,
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.85,
  } as TextStyle,
  sheetLabel: {
    fontSize: 13,
    marginBottom: spacing.sm,
  } as TextStyle,
  sheetInput: {
    height: 46,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  } as ViewStyle,
  sheetButton: {
    marginTop: spacing.lg,
  } as ViewStyle,
});
