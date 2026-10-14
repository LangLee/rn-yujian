import React from 'react';
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
import { coreColors } from '../../constants/coreUi';
import { font, fs, spacing } from '../../constants/tokens';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../../components/coreui/LakeContentBackdrop';
import { SettingsCard, SettingsRow } from '../../components/ui/SettingsList';
import { ScreenHeader } from '../../components';
import { appVersion } from '../../constants/appInfo';

type AboutNavigationProp = StackNavigationProp<RootStackParamList, 'About'>;

/**
 * 关于渔见 · Page Spec V1（FROZEN，组件组合式）：
 * 品牌卡（渔见 / 标语「拍照收藏每次渔获」 / 运行时版本号）为主层级，
 * 法律卡（用户协议 / 隐私政策 → 共用法律文档壳）为功能次级导航。
 * 不做营销页/教程/更新日志；版本号运行时派生，不硬编码假版本。
 */
export const AboutScreen: React.FC = () => {
  const navigation = useNavigation<AboutNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="关于渔见" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 品牌卡：名称 / 标语 / 版本 */}
        <View style={styles.brandCard}>
          <Text style={styles.brandName}>渔见</Text>
          <Text style={styles.tagline}>拍照收藏每次渔获</Text>
          <Text style={styles.version}>Version {appVersion}</Text>
        </View>

        {/* 法律卡：共用法律文档壳 */}
        <SettingsCard style={styles.legalCard}>
          <SettingsRow
            icon="note"
            tint="slate"
            label="用户协议"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'agreement' })}
          />
          <SettingsRow
            icon="lock"
            tint="teal"
            label="隐私政策"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
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
  brandCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.10)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  } as ViewStyle,
  brandName: {
    fontFamily: font.serif,
    fontSize: fs(32),
    fontWeight: '700',
    letterSpacing: 6,
    color: coreColors.deepLakeBlue,
    marginLeft: 6, // 抵消 letterSpacing 右偏
  } as TextStyle,
  tagline: {
    fontSize: fs(13),
    letterSpacing: 3,
    color: coreColors.mistBlueGray,
    marginTop: spacing.md,
    marginLeft: 3,
  } as TextStyle,
  version: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    opacity: 0.8,
    marginTop: spacing.sm,
  } as TextStyle,
  legalCard: {
    marginTop: spacing.xl,
  } as ViewStyle,
});
