import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AppIcon } from '../../../components/icons/AppIcon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { coreColors } from '../../../constants/coreUi';
import { fs } from '../../../constants/tokens';
import {
  MyCatchesFilterState,
  SizeQuickKey,
  TimeQuickKey,
  activeConditionCount,
} from '../../../utils/myCatchesTimeline';
import { F2SpeciesSheet } from './F2SpeciesSheet';
import { F3TimeSheet, F4SizeSheet } from './F3F4CustomSheets';

/**
 * F1 · 顶部内联筛选面板（F1_Filter_Panel_Spec_V2）。
 *
 * 五个维度各占一行：标题固定在左，chips 横向滚动不换行（鱼种 → 时间 → 长度 → 重量 → 特殊记录）。
 * 去掉「不限」chip：未选中即不限，再次点击已选 chip 取消该条件；「更多 / 自定义 ›」进二级面板。
 * Chip 点击即时生效（无 应用/完成 CTA）；「重置」无条件时降权且位置不跳动。
 */

export interface SpeciesOption {
  key: string;
  name: string;
}

/** 二级面板类型：F2 鱼种多选 / F3 自定义时间 / F4 自定义尺寸 */
type SubSheet = 'species' | 'time' | 'size' | null;

interface F1FilterPanelProps {
  filter: MyCatchesFilterState;
  speciesOptions: SpeciesOption[];
  /** F1 快捷鱼种（按档案频次取前 3） */
  quickSpecies: SpeciesOption[];
  onChange: (next: MyCatchesFilterState) => void;
  onReset: () => void;
}

/** 面板左右内边距；chips 滚动区向右出血到面板边缘，让被截断的 chip 暗示可横向滚动 */
const PANEL_PADDING_H = 16;
/** 标题列宽：容纳「特殊记录」四字与「长度 cm」带单位标题 */
const TITLE_WIDTH = 66;

const TIME_CHIPS: { key: Exclude<TimeQuickKey, 'all' | 'custom'>; label: string }[] = [
  { key: 'thisMonth', label: '本月' },
  { key: 'last3Months', label: '近3个月' },
  { key: 'thisYear', label: '今年' },
];

/* 单位移到标题（长度 cm / 重量 kg），chip 只留区间，一行放得下更多 */
const LENGTH_CHIPS: { key: SizeQuickKey; label: string }[] = [
  { key: 'lt20', label: '<20' },
  { key: '20to40', label: '20-40' },
  { key: '40to60', label: '40-60' },
  { key: 'gte60', label: '≥60' },
];

const WEIGHT_CHIPS: { key: SizeQuickKey; label: string }[] = [
  { key: 'lt05', label: '<0.5' },
  { key: '05to1', label: '0.5-1' },
  { key: '1to3', label: '1-3' },
  { key: 'gte3', label: '≥3' },
];

const SPECIAL_CHIPS: { key: 'first' | 'longest' | 'heaviest' | 'milestone'; label: string }[] = [
  { key: 'first', label: '首条' },
  { key: 'longest', label: '最长' },
  { key: 'heaviest', label: '最重' },
  { key: 'milestone', label: '里程碑' },
];

export const F1FilterPanel: React.FC<F1FilterPanelProps> = ({
  filter,
  speciesOptions,
  quickSpecies,
  onChange,
  onReset,
}) => {
  const [subSheet, setSubSheet] = useState<SubSheet>(null);

  const hasCondition = activeConditionCount(filter) > 0;
  /* 仅通过 F2 选中、不在快捷列表里的鱼种：由「更多」chip 承担选中态 */
  const hiddenSpeciesSelected = filter.species.some(
    (key) => !quickSpecies.some((item) => item.key === key),
  );

  const toggleSpecies = (key: string) => {
    const set = new Set(filter.species);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    onChange({ ...filter, species: Array.from(set) });
  };

  const toggleSpecial = (key: (typeof SPECIAL_CHIPS)[number]['key']) => {
    const set = new Set(filter.special);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    onChange({ ...filter, special: Array.from(set) });
  };

  /* 单选维度：再点已选 chip 即取消；选快捷区间时清掉同维自定义范围，避免两者 AND 叠加 */
  const toggleTime = (key: TimeQuickKey) =>
    onChange({ ...filter, time: filter.time === key ? 'all' : key, timeCustom: null });

  const toggleLength = (key: SizeQuickKey) =>
    onChange({
      ...filter,
      lengthQuick: filter.lengthQuick === key ? 'all' : key,
      lengthCustom: null,
    });

  const toggleWeight = (key: SizeQuickKey) =>
    onChange({
      ...filter,
      weightQuick: filter.weightQuick === key ? 'all' : key,
      weightCustom: null,
    });

  const openSizeSheet = (sizeMode: 'length' | 'weight') => {
    if (filter.sizeMode !== sizeMode) {
      onChange({ ...filter, sizeMode });
    }
    setSubSheet('size');
  };

  return (
    <View style={styles.panel}>
      {/* 标题行：筛选 | 重置（位置固定不跳动） */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>筛选</Text>
        <PressableScale
          onPress={hasCondition ? onReset : undefined}
          disabled={!hasCondition}
          scaleTo={0.94}
          style={styles.resetHit}
        >
          <Text style={[styles.resetText, !hasCondition && styles.resetDisabled]}>重置</Text>
        </PressableScale>
      </View>

      {/* 1 · 鱼种（多选 OR；「更多 ›」进 F2） */}
      <DimensionRow title="鱼种">
        {quickSpecies.map((item) => (
          <Chip
            key={item.key}
            label={item.name}
            selected={filter.species.includes(item.key)}
            onPress={() => toggleSpecies(item.key)}
          />
        ))}
        <Chip
          label="更多"
          arrow
          selected={hiddenSpeciesSelected}
          onPress={() => setSubSheet('species')}
        />
      </DimensionRow>

      {/* 2 · 时间（单选；「自定义 ›」进 F3） */}
      <DimensionRow title="时间">
        {TIME_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.time === item.key}
            onPress={() => toggleTime(item.key)}
          />
        ))}
        <Chip
          label="自定义"
          arrow
          selected={filter.time === 'custom'}
          onPress={() => setSubSheet('time')}
        />
      </DimensionRow>

      {/* 3 · 长度（cm，单选；与重量各自独立、均设置时 AND） */}
      <DimensionRow title="长度" unit="cm">
        {LENGTH_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.lengthQuick === item.key}
            onPress={() => toggleLength(item.key)}
          />
        ))}
        <Chip
          label="自定义"
          arrow
          selected={filter.lengthQuick === 'custom'}
          onPress={() => openSizeSheet('length')}
        />
      </DimensionRow>

      {/* 4 · 重量（kg，单选） */}
      <DimensionRow title="重量" unit="kg">
        {WEIGHT_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.weightQuick === item.key}
            onPress={() => toggleWeight(item.key)}
          />
        ))}
        <Chip
          label="自定义"
          arrow
          selected={filter.weightQuick === 'custom'}
          onPress={() => openSizeSheet('weight')}
        />
      </DimensionRow>

      {/* 5 · 特殊记录（多选 OR；F1 不复制 Growth Mark 徽章视觉） */}
      <DimensionRow title="特殊记录">
        {SPECIAL_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.special.includes(item.key)}
            onPress={() => toggleSpecial(item.key)}
          />
        ))}
      </DimensionRow>

      {/* 二级面板 */}
      <F2SpeciesSheet
        visible={subSheet === 'species'}
        options={speciesOptions}
        selected={filter.species}
        onClose={() => setSubSheet(null)}
        onConfirm={(keys) => {
          onChange({ ...filter, species: keys });
          setSubSheet(null);
        }}
      />
      <F3TimeSheet
        visible={subSheet === 'time'}
        filter={filter}
        onClose={() => setSubSheet(null)}
        onConfirm={(range) => {
          onChange({
            ...filter,
            time: range ? 'custom' : 'all',
            timeCustom: range,
          });
          setSubSheet(null);
        }}
      />
      <F4SizeSheet
        visible={subSheet === 'size'}
        filter={filter}
        onClose={() => setSubSheet(null)}
        onConfirm={(sizeMode, lengthCustom, weightCustom, lengthQuick, weightQuick) => {
          onChange({
            ...filter,
            sizeMode,
            lengthCustom,
            weightCustom,
            lengthQuick,
            weightQuick,
          });
          setSubSheet(null);
        }}
      />
    </View>
  );
};

/** 维度行：左侧固定宽标题（可带单位），右侧 chips 单行横向滚动，不换行 */
const DimensionRow: React.FC<{
  title: string;
  unit?: string;
  children: React.ReactNode;
}> = ({ title, unit, children }) => (
  <View style={styles.row}>
    <View style={styles.titleCell}>
      <Text style={styles.title}>{title}</Text>
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  </View>
);

const Chip: React.FC<{
  label: string;
  selected?: boolean;
  onPress: () => void;
  arrow?: boolean;
}> = ({ label, selected = false, onPress, arrow }) => (
  <PressableScale onPress={onPress} scaleTo={0.95} style={styles.chipHit}>
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {arrow ? (
        <AppIcon
          name="chevron_right"
          size={12}
          color={selected ? '#2E6E71' : coreColors.mistBlueGray}
        />
      ) : null}
    </View>
  </PressableScale>
);

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: PANEL_PADDING_H,
    paddingTop: 10,
    paddingBottom: 8,
  } as ViewStyle,
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  } as ViewStyle,
  headerTitle: {
    color: coreColors.deepLakeBlue,
    fontSize: fs(16),
    fontWeight: '600',
  } as TextStyle,
  resetHit: {
    paddingVertical: 6,
    paddingLeft: 12,
  } as ViewStyle,
  resetText: {
    color: coreColors.lakeBlue,
    fontSize: fs(14),
  } as TextStyle,
  resetDisabled: {
    color: 'rgba(116,136,151,0.45)',
  } as TextStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    marginTop: 2,
  } as ViewStyle,
  titleCell: {
    width: TITLE_WIDTH,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingRight: 6,
  } as ViewStyle,
  title: {
    color: coreColors.deepLakeBlue,
    fontSize: fs(13),
    fontWeight: '600',
  } as TextStyle,
  unit: {
    color: coreColors.mistBlueGray,
    fontSize: fs(11),
  } as TextStyle,
  chipScroll: {
    flex: 1,
    marginRight: -PANEL_PADDING_H,
  } as ViewStyle,
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: PANEL_PADDING_H,
  } as ViewStyle,
  chipHit: {
    minHeight: 40,
    justifyContent: 'center',
  } as ViewStyle,
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(233,240,243,0.72)',
    /* 常驻 1dp 边框（未选中透明）：选中态不改变尺寸，行内相邻 chip 不位移 */
    borderWidth: 1,
    borderColor: 'transparent',
  } as ViewStyle,
  chipSelected: {
    backgroundColor: 'rgba(77,158,161,0.16)',
    borderColor: 'rgba(77,158,161,0.45)',
  } as ViewStyle,
  chipText: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
  chipTextSelected: {
    color: '#2E6E71',
    fontWeight: '600',
  } as TextStyle,
});
