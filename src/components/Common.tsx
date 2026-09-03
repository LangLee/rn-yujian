import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  TextStyle,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { palette } from '../constants/colors';

interface YujianTopBarProps {
  title: string;
  subtitle?: string | null;
  onBack?: (() => void) | null;
  action?: React.ReactNode;
}

/** 顶栏（对应原 Common.kt YujianTopBar：返回按钮 + 标题 + 副标题）。 */
export const YujianTopBar: React.FC<YujianTopBarProps> = ({ title, subtitle, onBack, action }) => (
  <View style={styles.bar}>
    {onBack ? (
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          pressed && { opacity: 0.6 },
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="返回"
      >
        <Icon name="chevron-back" size={22} color={palette.deepInk} />
      </Pressable>
    ) : null}
    <View style={styles.titleBlock}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {action}
  </View>
);

interface TagChipProps {
  text: string;
  emphasized?: boolean;
  style?: ViewStyle;
}

/** 标签（对应原 Common.kt TagChip）。 */
export const TagChip: React.FC<TagChipProps> = ({ text, emphasized = false, style }) => (
  <View
    style={[
      styles.chip,
      { backgroundColor: emphasized ? palette.softWater : palette.cardWhite },
      style,
    ]}
  >
    <Text style={emphasized ? styles.chipTextEmphasized : styles.chipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingHorizontal: 12,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.cardWhite,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: palette.deepInk,
    fontSize: 22,
    fontWeight: '700',
  } as TextStyle,
  subtitle: {
    color: palette.mutedInk,
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,
  chip: {
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: palette.deepInk,
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  chipTextEmphasized: {
    color: palette.waterTeal,
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,
});
