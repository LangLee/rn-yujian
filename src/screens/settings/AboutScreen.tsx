import React from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { palette } from '../../constants/colors';
import { radius, spacing, typeScale } from '../../constants/tokens';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { GlassCard } from '../../components/ui/GlassCard';
import { PressableScale } from '../../components/ui/PressableScale';
import { FishGlyph } from '../../components/ui/FishGlyph';

type AboutNavigationProp = StackNavigationProp<RootStackParamList, 'About'>;

/** 关于渔见：产品核心 + 版本信息（不做营销页）。 */
export const AboutScreen: React.FC = () => {
  const navigation = useNavigation<AboutNavigationProp>();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.94} style={styles.backHit}>
          <View style={styles.backCircle}>
            <Icon name="chevron-back" size={22} color={textPrimary} />
          </View>
        </PressableScale>
        <Text style={[styles.title, { color: textPrimary }]}>关于渔见</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <View style={[styles.brandBadge, { backgroundColor: profile.surface.accentSoft }]}>
            <FishGlyph size={30} color={profile.surface.accent} />
          </View>
          <Text style={[styles.brandName, { color: textPrimary }]}>渔见</Text>
          <Text style={[styles.brandSlogan, { color: textSecondary }]}>拍照收藏每次渔获</Text>
          <Text style={[styles.version, { color: textSecondary }]}>Android V1</Text>
        </View>

        <GlassCard style={styles.coreCard}>
          <Text style={[styles.coreTitle, { color: textPrimary }]}>我们在做的事</Text>
          <Text style={[styles.coreText, { color: textSecondary }]}>
            拍照收藏每次渔获。AI 负责安静地理解鱼获，你看到的是「真实鱼获 → 记忆 → 收藏 →
            回看 → 分享」。
          </Text>
          <Text style={[styles.coreText, { color: textSecondary }]}>
            一次鱼获不是一张照片，而是一段可以持续补充、长期回看、再次分享的记忆。
          </Text>
        </GlassCard>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  } as ViewStyle,
  backHit: {
    borderRadius: 20,
  } as ViewStyle,
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typeScale.h2,
    fontWeight: '700',
  } as TextStyle,
  headerSide: {
    width: 40,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  brandBlock: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  } as ViewStyle,
  brandBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  brandName: {
    fontSize: typeScale.display,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: spacing.lg,
  } as TextStyle,
  brandSlogan: {
    fontSize: typeScale.meta,
    marginTop: spacing.xs,
  } as TextStyle,
  version: {
    fontSize: typeScale.caption,
    marginTop: spacing.sm,
    opacity: 0.7,
  } as TextStyle,
  coreCard: {
    marginTop: spacing.xxl,
  } as ViewStyle,
  coreTitle: {
    fontSize: typeScale.body,
    fontWeight: '700',
    marginBottom: spacing.md,
  } as TextStyle,
  coreText: {
    fontSize: typeScale.meta,
    lineHeight: 22,
    marginBottom: spacing.md,
  } as TextStyle,
});
