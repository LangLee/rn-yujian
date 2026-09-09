import React from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import {
  EnvironmentId,
  environmentProfiles,
  ThemePreference,
} from '../../constants/environments';
import { palette } from '../../constants/colors';
import { radius, spacing, typeScale } from '../../constants/tokens';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { GlassCard } from '../../components/ui/GlassCard';
import { PressableScale } from '../../components/ui/PressableScale';
import { ScreenHeader } from '../../components';
import { haptics } from '../../utils/haptics';

type ThemeSettingsNavigationProp = StackNavigationProp<RootStackParamList, 'ThemeSettings'>;

const OPTIONS: { id: ThemePreference; label: string; hint: string }[] = [
  { id: 'auto', label: '自动跟随时间', hint: '清晨 · 白天 · 傍晚 · 夜晚' },
  { id: 'morning', label: '清晨', hint: '薄雾 · 冷暖交界 · 安静' },
  { id: 'day', label: '白天', hint: '通透 · 自然 · 可读性最高' },
  { id: 'sunset', label: '傍晚', hint: '金色低角度光 · 温暖' },
  { id: 'night', label: '夜晚', hint: '自然低照度 · 夜钓感' },
];

const SWATCH: Record<EnvironmentId, { top: string; bottom: string }> = {
  morning: { top: '#D8E8EA', bottom: '#9FC0BC' },
  day: { top: '#C9E4E6', bottom: '#74AFAE' },
  sunset: { top: '#EBD9BC', bottom: '#A3927C' },
  night: { top: '#0E2A34', bottom: '#0A2530' },
};

/**
 * 环境主题设置（设计文档 13.3）：
 * 自动跟随时间（默认） / 清晨 / 白天 / 傍晚 / 夜晚；
 * 用小预览卡表达环境，不做复杂参数；所有 Profile 共用一套组件和布局。
 */
export const ThemeSettingsScreen: React.FC = () => {
  const navigation = useNavigation<ThemeSettingsNavigationProp>();
  const { themeMode, setThemeMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader title="环境主题" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {OPTIONS.map((option) => {
          const active = themeMode === option.id;
          const swatch =
            option.id === 'auto' ? null : SWATCH[option.id as EnvironmentId];
          return (
            <PressableScale
              key={option.id}
              onPress={() => {
                setThemeMode(option.id);
                haptics.selection();
              }}
              scaleTo={0.99}
              style={styles.optionHit}
            >
              <GlassCard style={[styles.optionCard, active && styles.optionActive]}>
                <View style={styles.optionRow} pointerEvents="none">
                  <View style={styles.swatchWrap}>
                    {swatch ? (
                      <View style={[styles.swatch, { backgroundColor: swatch.bottom }]}>
                        <View style={[styles.swatchSky, { backgroundColor: swatch.top }]} />
                      </View>
                    ) : (
                      <View style={[styles.swatch, styles.swatchAuto]}>
                        <Icon name="time-outline" size={16} color={palette.waterTeal} />
                      </View>
                    )}
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                      {option.label}
                    </Text>
                    <Text style={styles.optionHint}>{option.hint}</Text>
                  </View>
                  {active ? (
                    <Icon name="checkmark-circle" size={20} color={palette.waterTeal} />
                  ) : null}
                </View>
              </GlassCard>
            </PressableScale>
          );
        })}
        <Text style={styles.note}>
          环境只改变水面、光线与文字对比，不改变任何页面结构。渔见在夜晚依然安静、克制。
        </Text>
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
  optionHit: {
    borderRadius: radius.m,
  } as ViewStyle,
  optionCard: {
    marginTop: spacing.md,
  } as ViewStyle,
  optionActive: {
    borderWidth: 1.5,
    borderColor: palette.waterTeal,
    backgroundColor: palette.softWater,
  } as ViewStyle,
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  } as ViewStyle,
  swatchWrap: {
    width: 52,
  } as ViewStyle,
  swatch: {
    width: 52,
    height: 40,
    borderRadius: radius.s,
    overflow: 'hidden',
  } as ViewStyle,
  swatchSky: {
    height: '55%',
    width: '100%',
  } as ViewStyle,
  swatchAuto: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  optionBody: {
    flex: 1,
  } as ViewStyle,
  optionLabel: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: '#173B4B',
  } as TextStyle,
  optionLabelActive: {
    color: palette.waterTeal,
  } as TextStyle,
  optionHint: {
    fontSize: typeScale.caption,
    color: '#6A7D86',
    marginTop: 2,
  } as TextStyle,
  note: {
    fontSize: typeScale.caption,
    color: '#6A7D86',
    lineHeight: 19,
    marginTop: spacing.xl,
    textAlign: 'center',
  } as TextStyle,
});
