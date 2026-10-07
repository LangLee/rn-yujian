import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageStyle,
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
import { launchImageLibrary } from 'react-native-image-picker';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { Gender, usePreferences } from '../contexts/PreferencesContext';
import { countDistinctDays } from '../utils/formatters';
import { font, fs, radius, spacing } from '../constants/tokens';
import { haptics } from '../utils/haptics';
import { MorningLakeScene } from '../components/coreui';
import { PressableScale } from '../components/ui/PressableScale';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenHeader } from '../components';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Profile'>;

const GOLD = '#D6A541';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'secret', label: '保密' },
];

const GENDER_LABEL: Record<Gender, string> = {
  male: '男',
  female: '女',
  secret: '保密',
};

/**
 * 我的（设计文档 13.1 + 高保真参考稿）：
 * 居中标题 → 个人大卡（头像 / 昵称 / 性别 / 签名 + 嵌套统计胶囊）→ 分组菜单卡
 * （行右侧显示当前值，隐私行下带金点注释）。只解决必要偏好和隐私。
 * 背景与主页同一个清晨湖畔世界（MorningLakeScene），因此页面表面色固定用
 * morning Profile 的 Token，不随环境主题变化。
 */
export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const {
    nickname: localNickname,
    setNickname,
    avatar,
    setAvatar,
    gender,
    setGender,
    signature,
    setSignature,
    lengthUnit,
    weightUnit,
    privacy,
  } = usePreferences();
  const insets = useSafeAreaInsets();
  const [profileSheet, setProfileSheet] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');
  const [genderDraft, setGenderDraft] = useState<Gender>('secret');
  const [signatureDraft, setSignatureDraft] = useState('');

  /* Core Visual System V1：表面 Token 已冻结为清晨湖世界（不再随环境主题切换） */
  const surface = profile.surface;
  const sheetTextPrimary = profile.surface.textPrimary;
  const sheetTextSecondary = profile.surface.textSecondary;

  const litSpecies = useMemo(
    () => new Set(catches.map((item) => item.speciesId).filter(Boolean)).size,
    [catches],
  );

  const displayName = localNickname || session?.nickname || session?.username || '钓友';
  const textPrimary = surface.textPrimary;
  const textSecondary = surface.textSecondary;

  const unitsLabel = `${lengthUnit} / ${weightUnit}`;
  const shareLevelLabel =
    privacy.shareLocationLevel === 'precise'
      ? '精准位置'
      : privacy.shareLocationLevel === 'city'
        ? '城市 / 地区'
        : privacy.shareLocationLevel === 'none'
          ? '不显示地点'
          : '水域/区县级';

  /* 打开资料面板时以当前值初始化草稿，保存时一次性提交 */
  useEffect(() => {
    if (profileSheet) {
      setNicknameDraft(localNickname || session?.nickname || session?.username || '');
      setAvatarDraft(avatar);
      setGenderDraft(gender);
      setSignatureDraft(signature);
    }
  }, [profileSheet, localNickname, session?.nickname, session?.username, avatar, gender, signature]);

  /* 头像：从相册选择，压缩为小图后转 data URL 本地保存 */
  const pickAvatar = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 320,
        maxHeight: 320,
        includeBase64: true,
      },
      (response) => {
        const asset = response.assets?.[0];
        if (asset?.base64) {
          setAvatarDraft(`data:${asset.type ?? 'image/jpeg'};base64,${asset.base64}`);
          haptics.selection();
        }
      },
    );
  };

  const saveProfile = () => {
    setNickname(nicknameDraft.trim());
    setAvatar(avatarDraft);
    setGender(genderDraft);
    setSignature(signatureDraft.trim());
    setProfileSheet(false);
    haptics.confirm();
  };

  return (
    <View style={styles.screen}>
      <MorningLakeScene level="hero" />
      {/* 标题栏：左返回主页 + 居中标题（清晨湖畔固定深色文字） */}
      <ScreenHeader
        title="我的"
        onBack={() => navigation.goBack()}
        titleColor={textPrimary}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.md, paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 个人大卡：身份 + 嵌套统计胶囊 */}
        <View
          style={[
            styles.identityCard,
            { backgroundColor: surface.glassStrong, borderColor: surface.glassBorder },
          ]}
        >
          <PressableScale onPress={() => setProfileSheet(true)} scaleTo={0.99}>
            <View style={styles.identityRow} pointerEvents="none">
              <View style={[styles.avatar, { borderColor: '#FFFFFF' }]}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarText, { color: INK }]}>
                    {displayName.slice(0, 1).toUpperCase()}
                  </Text>
                )}
                {/* 相机角标：提示头像可更换 */}
                <View style={styles.avatarBadge}>
                  <Icon name="camera" size={10} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.identityBody}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: textPrimary }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {gender !== 'secret' && (
                    <View
                      style={[
                        styles.genderChip,
                        { backgroundColor: gender === 'male' ? '#4A7FD4' : '#D66D9E' },
                      ]}
                    >
                      <Icon name={gender} size={10} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={[styles.signature, { color: textSecondary }]} numberOfLines={1}>
                  {signature || '拍照收藏每次渔获'}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={textSecondary} />
            </View>
          </PressableScale>

          {/* 嵌套统计胶囊（渔获 / 已点亮鱼种 / 记录天数） */}
          <View
            style={[
              styles.statsPill,
              { backgroundColor: surface.glass, borderColor: surface.glassBorder },
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
            <View style={[styles.statDivider, { backgroundColor: surface.glassBorder }]} />
            <PressableScale onPress={() => navigation.navigate('Guide')} scaleTo={0.97} style={styles.statHit}>
              <View style={styles.statCell} pointerEvents="none">
                <View style={styles.statValueRow}>
                  <Text style={[styles.statValue, { color: textPrimary }]}>{litSpecies}</Text>
                  <Icon name="sparkles-outline" size={14} color={GOLD} />
                </View>
                <Text style={[styles.statLabel, { color: textSecondary }]}>已点亮鱼种</Text>
              </View>
            </PressableScale>
            <View style={[styles.statDivider, { backgroundColor: surface.glassBorder }]} />
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
        <MenuCard glass={surface.glass} border={surface.glassBorder}>
          <MenuRow
            icon="person-outline"
            label="个人资料"
            value={`${GENDER_LABEL[gender]}${signature ? ' · 已设签名' : ''}`}
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
        <MenuCard glass={surface.glass} border={surface.glassBorder}>
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
        <MenuCard glass={surface.glass} border={surface.glassBorder}>
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

      {/* 个人资料：头像 / 昵称 / 性别 / 签名（Sheet 本身随环境主题适配色彩） */}
      <BottomSheet visible={profileSheet} onClose={() => setProfileSheet(false)} title="个人资料">
        {/* 头像 */}
        <PressableScale onPress={pickAvatar} scaleTo={0.96} style={styles.avatarPickRow}>
          <View style={[styles.avatarPickFrame, { borderColor: surface.glassBorder }]}>
            {avatarDraft ? (
              <Image source={{ uri: avatarDraft }} style={styles.avatarPickImage} />
            ) : (
              <Text style={[styles.avatarText, { color: INK }]}>
                {(nicknameDraft.trim() || displayName).slice(0, 1).toUpperCase()}
              </Text>
            )}
            <View style={styles.avatarBadge}>
              <Icon name="camera" size={9} color="#FFFFFF" />
            </View>
          </View>
          <Text style={[styles.avatarPickHint, { color: sheetTextSecondary }]}>
            {avatarDraft ? '点击更换头像' : '点击设置头像'}
          </Text>
        </PressableScale>

        {/* 昵称 */}
        <Text style={[styles.sheetLabel, { color: sheetTextSecondary }]}>昵称</Text>
        <TextInput
          style={[
            styles.sheetInput,
            {
              color: sheetTextPrimary,
              backgroundColor: profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(23,59,75,0.04)',
            },
          ]}
          value={nicknameDraft}
          onChangeText={setNicknameDraft}
          placeholder={displayName}
          placeholderTextColor={sheetTextSecondary}
          maxLength={16}
        />

        {/* 性别 */}
        <Text style={[styles.sheetLabel, { color: sheetTextSecondary, marginTop: spacing.md }]}>
          性别
        </Text>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map((option) => {
            const selected = genderDraft === option.value;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setGenderDraft(option.value)}
                scaleTo={0.95}
                style={styles.genderHit}
              >
                <View
                  style={[
                    styles.genderOption,
                    {
                      borderColor: selected ? profile.surface.accent : surface.glassBorder,
                      backgroundColor: selected
                        ? profile.surface.accent
                        : profile.isDark
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(23,59,75,0.04)',
                    },
                  ]}
                  pointerEvents="none"
                >
                  {option.value !== 'secret' && (
                    <Icon
                      name={option.value}
                      size={13}
                      color={selected ? '#FFFFFF' : sheetTextSecondary}
                    />
                  )}
                  <Text
                    style={[
                      styles.genderOptionText,
                      { color: selected ? '#FFFFFF' : sheetTextSecondary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        {/* 个性签名 */}
        <Text style={[styles.sheetLabel, { color: sheetTextSecondary, marginTop: spacing.md }]}>
          个性签名
        </Text>
        <TextInput
          style={[
            styles.sheetInput,
            {
              color: sheetTextPrimary,
              backgroundColor: profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(23,59,75,0.04)',
            },
          ]}
          value={signatureDraft}
          onChangeText={setSignatureDraft}
          placeholder="一句话介绍自己（可选）"
          placeholderTextColor={sheetTextSecondary}
          maxLength={30}
        />
        <PrimaryButton label="保存" onPress={saveProfile} style={styles.sheetButton} />
      </BottomSheet>
    </View>
  );
};

const INK = '#0B2D4B';

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
      {value ? (
        <Text style={[styles.menuValue, { color: textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
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
    overflow: 'hidden',
  } as ViewStyle,
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  } as ImageStyle,
  avatarText: {
    fontFamily: font.serif,
    fontSize: fs(30),
    fontWeight: '700',
  } as TextStyle,
  avatarBadge: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3E6E75',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  } as ViewStyle,
  identityBody: {
    flex: 1,
  } as ViewStyle,
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  } as ViewStyle,
  name: {
    flexShrink: 1,
    fontFamily: font.serif,
    fontSize: fs(24),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  genderChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  signature: {
    fontSize: fs(14),
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
    fontSize: fs(22),
    fontWeight: '600',
    lineHeight: 25,
  } as TextStyle,
  statLabel: {
    fontSize: fs(12),
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
    fontSize: fs(15),
    fontWeight: '500',
  } as TextStyle,
  menuValue: {
    fontSize: fs(14),
    maxWidth: 150,
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
    fontSize: fs(11),
    lineHeight: 16,
    opacity: 0.85,
  } as TextStyle,
  avatarPickRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  } as ViewStyle,
  avatarPickFrame: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    backgroundColor: '#DDEBE9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  avatarPickImage: {
    width: '100%',
    height: '100%',
    borderRadius: 39,
  } as ImageStyle,
  avatarPickHint: {
    fontSize: fs(12),
    marginTop: spacing.sm,
  } as TextStyle,
  sheetLabel: {
    fontSize: fs(13),
    marginBottom: spacing.sm,
  } as TextStyle,
  sheetInput: {
    height: 46,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    fontSize: fs(15),
  } as ViewStyle,
  genderRow: {
    flexDirection: 'row',
    gap: spacing.md,
  } as ViewStyle,
  genderHit: {
    flex: 1,
  } as ViewStyle,
  genderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: radius.s,
    borderWidth: 1,
  } as ViewStyle,
  genderOptionText: {
    fontSize: fs(14),
    fontWeight: '500',
  } as TextStyle,
  sheetButton: {
    marginTop: spacing.lg,
  } as ViewStyle,
});
