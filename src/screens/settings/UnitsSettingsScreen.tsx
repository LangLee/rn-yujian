import React from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import { palette } from '../../constants/colors';
import { radius, spacing, typeScale } from '../../constants/tokens';
import {
  LENGTH_UNIT_LABEL,
  LengthUnit,
  WEIGHT_UNIT_LABEL,
  WeightUnit,
} from '../../utils/formatters';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { GlassCard } from '../../components/ui/GlassCard';
import { PressableScale } from '../../components/ui/PressableScale';
import { haptics } from '../../utils/haptics';

type UnitsNavigationProp = StackNavigationProp<RootStackParamList, 'UnitsSettings'>;

const LENGTH_OPTIONS: LengthUnit[] = ['cm', 'inch'];
const WEIGHT_OPTIONS: WeightUnit[] = ['kg', 'jin', 'lb'];

/**
 * 单位与偏好（设计文档 13.4）：长度 cm / inch；重量 kg / 斤 / lb。
 * 中国区默认 cm + kg，用户可切换。
 */
export const UnitsSettingsScreen: React.FC = () => {
  const navigation = useNavigation<UnitsNavigationProp>();
  const { profile } = useTheme();
  const { lengthUnit, weightUnit, setLengthUnit, setWeightUnit } = usePreferences();
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
        <Text style={[styles.title, { color: textPrimary }]}>单位与偏好</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard noPadding style={styles.group}>
          {LENGTH_OPTIONS.map((unit, index) => (
            <OptionRow
              key={unit}
              label={LENGTH_UNIT_LABEL[unit]}
              active={lengthUnit === unit}
              first={index === 0}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              accent={profile.surface.accent}
              border={profile.surface.glassBorder}
              onPress={() => {
                setLengthUnit(unit);
                haptics.selection();
              }}
            />
          ))}
        </GlassCard>

        <GlassCard noPadding style={styles.group}>
          {WEIGHT_OPTIONS.map((unit, index) => (
            <OptionRow
              key={unit}
              label={WEIGHT_UNIT_LABEL[unit]}
              active={weightUnit === unit}
              first={index === 0}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              accent={profile.surface.accent}
              border={profile.surface.glassBorder}
              onPress={() => {
                setWeightUnit(unit);
                haptics.selection();
              }}
            />
          ))}
        </GlassCard>

        <Text style={[styles.note, { color: textSecondary }]}>
          长度默认使用厘米，重量默认使用千克，切换单位只影响展示。
        </Text>
      </ScrollView>
    </View>
  );
};

const OptionRow: React.FC<{
  label: string;
  active: boolean;
  first: boolean;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  border: string;
  onPress: () => void;
}> = ({ label, active, first, textPrimary, accent, border, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.99}>
    <View
      style={[
        styles.row,
        !first && styles.rowBorder,
        { borderColor: border },
        active && styles.rowActive,
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.rowLabel, { color: active ? accent : textPrimary }]}>{label}</Text>
      {active ? <Icon name="checkmark" size={18} color={accent} /> : null}
    </View>
  </PressableScale>
);

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
  group: {
    marginTop: spacing.lg,
    overflow: 'hidden',
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  rowBorder: {} as ViewStyle,
  rowActive: {
    backgroundColor: palette.softWater,
  } as ViewStyle,
  rowLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
  } as TextStyle,
  note: {
    fontSize: typeScale.caption,
    lineHeight: 19,
    marginTop: spacing.xl,
    textAlign: 'center',
  } as TextStyle,
});
