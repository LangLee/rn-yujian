import React from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import {
  usePreferences,
  RecordPrecision,
  ShareLocationLevel,
} from '../../contexts/PreferencesContext';
import { font, radius, spacing } from '../../constants/tokens';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { PressableScale } from '../../components/ui/PressableScale';
import { RadioDot } from '../../components/ui/RadioDot';
import { ScreenHeader } from '../../components';
import { haptics } from '../../utils/haptics';

type PrivacyNavigationProp = StackNavigationProp<RootStackParamList, 'PrivacySettings'>;

const GOLD = '#C9A96A';

const RECORD_OPTIONS: { id: RecordPrecision; label: string }[] = [
  { id: 'precise', label: '精准位置' },
  { id: 'waterbody_county', label: '水域 / 区县' },
  { id: 'none', label: '不记录位置' },
];

const SHARE_OPTIONS: { id: ShareLocationLevel; label: string }[] = [
  { id: 'none', label: '不显示' },
  { id: 'city', label: '城市 / 地区' },
  { id: 'waterbody_county', label: '水域 / 区县' },
  { id: 'precise', label: '精准位置' },
];

/**
 * 隐私与定位（设计文档 13.2 + 高保真参考稿）：
 * 定位权限卡（跳系统设置）→ 鱼获位置记录精度（金色单选）→
 * 分享时默认显示位置 → 分享照片移除 GPS / 手动修改地点（金色开关）→ 提示卡。
 * 渔见可以帮用户精准记录钓点，但绝不默认帮用户精准公开钓点。
 */
export const PrivacySettingsScreen: React.FC = () => {
  const navigation = useNavigation<PrivacyNavigationProp>();
  const { profile } = useTheme();
  const { privacy, setPrivacy } = usePreferences();
  const insets = useSafeAreaInsets();

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader title="隐私与定位" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 定位权限（跳系统设置） */}
        <PressableScale onPress={() => Linking.openSettings()} scaleTo={0.99} style={styles.cardHit}>
          <View
            style={[
              styles.permCard,
              { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
            ]}
          >
            <View style={[styles.permIconWrap, { backgroundColor: profile.surface.accentSoft }]}>
              <Icon name="location-outline" size={20} color="#3E6E75" />
            </View>
            <View style={styles.permBody}>
              <Text style={[styles.permTitle, { color: textPrimary }]}>定位权限</Text>
              <Text style={[styles.permDesc, { color: textSecondary }]} numberOfLines={2}>
                用于记录鱼获发生的位置，可在系统设置中关闭
              </Text>
            </View>
            <View style={styles.permAction}>
              <Text style={[styles.permActionText, { color: textPrimary }]}>已允许</Text>
              <Icon name="chevron-forward" size={14} color={textSecondary} />
            </View>
          </View>
        </PressableScale>

        {/* 鱼获位置记录精度 */}
        <RadioGroup
          title="鱼获位置记录"
          description="设置你自己的鱼获记录默认保存到什么精度"
          options={RECORD_OPTIONS}
          selected={privacy.recordPrecision}
          onSelect={(id) => {
            setPrivacy({ recordPrecision: id as RecordPrecision });
            haptics.selection();
          }}
          glass={profile.surface.glass}
          border={profile.surface.glassBorder}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />

        {/* 分享时默认显示位置 */}
        <RadioGroup
          title="分享时默认显示位置"
          description="精准记录仅用于你的私人鱼获；分享时默认不会公开具体钓点。"
          options={SHARE_OPTIONS}
          selected={privacy.shareLocationLevel}
          onSelect={(id) => {
            setPrivacy({ shareLocationLevel: id as ShareLocationLevel });
            haptics.selection();
          }}
          glass={profile.surface.glass}
          border={profile.surface.glassBorder}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />

        {/* 分享照片移除 GPS */}
        <SwitchCard
          title="分享照片时移除位置信息"
          description="分享照片前自动移除 GPS / EXIF 位置信息"
          value={privacy.stripPhotoGps}
          onChange={(value) => setPrivacy({ stripPhotoGps: value })}
          glass={profile.surface.glass}
          border={profile.surface.glassBorder}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />

        {/* 手动修改地点 */}
        <SwitchCard
          title="保存鱼获时允许手动修改地点"
          description="定位不准确或补录旧照片时，可手动修改地点"
          value={privacy.manualLocationEdit}
          onChange={(value) => setPrivacy({ manualLocationEdit: value })}
          glass={profile.surface.glass}
          border={profile.surface.glassBorder}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />

        {/* 提示卡 */}
        <View style={[styles.tipCard, { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder }]}>
          <Icon name="leaf-outline" size={16} color="#6FA08A" />
          <Text style={[styles.tipText, { color: textSecondary }]}>
            你可以随时在单次分享时再次调整显示位置级别。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const RadioGroup: React.FC<{
  title: string;
  description: string;
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  glass: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
}> = ({ title, description, options, selected, onSelect, glass, border, textPrimary, textSecondary }) => (
  <View style={[styles.groupCard, { backgroundColor: glass, borderColor: border }]}>
    <View style={styles.groupTitleRow}>
      <View style={styles.goldBullet} />
      <Text style={[styles.groupTitle, { color: textPrimary }]}>{title}</Text>
    </View>
    <Text style={[styles.groupDesc, { color: textSecondary }]}>{description}</Text>
    {options.map((option, index) => {
      const active = selected === option.id;
      return (
        <PressableScale
          key={option.id}
          onPress={() => onSelect(option.id)}
          scaleTo={0.99}
          style={styles.radioHit}
        >
          <View
            style={[
              styles.radioRow,
              index > 0 && styles.radioRowBorder,
              { borderColor: border },
            ]}
            pointerEvents="none"
          >
            <RadioDot selected={active} color={GOLD} idleColor={textSecondary} />
            <Text style={[styles.radioLabel, { color: active ? GOLD : textPrimary }]}>
              {option.label}
            </Text>
          </View>
        </PressableScale>
      );
    })}
  </View>
);

const SwitchCard: React.FC<{
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  glass: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
}> = ({ title, description, value, onChange, glass, border, textPrimary, textSecondary }) => (
  <View style={[styles.switchCard, { backgroundColor: glass, borderColor: border }]}>
    <View style={styles.switchBody}>
      <Text style={[styles.switchTitle, { color: textPrimary }]}>{title}</Text>
      <Text style={[styles.switchDesc, { color: textSecondary }]}>{description}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: 'rgba(23,59,75,0.18)', true: GOLD }}
      thumbColor="#FFFFFF"
      ios_backgroundColor="rgba(23,59,75,0.18)"
    />
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
  cardHit: {
    borderRadius: radius.m + 2,
  } as ViewStyle,
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  permIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  permBody: {
    flex: 1,
  } as ViewStyle,
  permTitle: {
    fontFamily: font.serif,
    fontSize: 17,
    fontWeight: '700',
  } as TextStyle,
  permDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  } as TextStyle,
  permAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  permActionText: {
    fontSize: 13,
  } as TextStyle,
  groupCard: {
    marginTop: spacing.lg,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  goldBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  } as ViewStyle,
  groupTitle: {
    fontFamily: font.serif,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  groupDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 4,
  } as TextStyle,
  radioHit: {
    borderRadius: radius.s,
  } as ViewStyle,
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  radioRowBorder: {} as ViewStyle,
  radioLabel: {
    fontSize: 15,
    fontWeight: '500',
  } as TextStyle,
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  switchBody: {
    flex: 1,
  } as ViewStyle,
  switchTitle: {
    fontFamily: font.serif,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  } as TextStyle,
  switchDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  } as TextStyle,
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    borderRadius: radius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  } as ViewStyle,
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  } as TextStyle,
});
