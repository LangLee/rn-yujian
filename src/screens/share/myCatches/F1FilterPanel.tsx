import React, { useState } from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
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
 * F1 · 顶部内联筛选面板（F1_Filter_Panel_Spec_V1，FROZEN）。
 *
 * 四维固定顺序：鱼种 → 时间 → 尺寸 → 特殊记录；地点不进入 V1。
 * Chip 点击即时生效（无 应用/完成 CTA）；「重置」无条件时降权且位置不跳动。
 * 视觉：Mist 轻 Surface、圆角 ~24、chip 高 ~36（触控 ≥44）；默认低对比 Mist Gray、
 * 选中轻 Lake Teal Surface + Deep Teal 文字。
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
  /** F1 顶部快捷鱼种（设计稿：草鱼/鲫鱼/鲤鱼，按档案频次取前 3） */
  quickSpecies: SpeciesOption[];
  onChange: (next: MyCatchesFilterState) => void;
  onReset: () => void;
}

const TIME_CHIPS: { key: TimeQuickKey; label: string }[] = [
  { key: 'all', label: '不限' },
  { key: 'thisMonth', label: '本月' },
  { key: 'last3Months', label: '近3个月' },
  { key: 'thisYear', label: '今年' },
];

const LENGTH_CHIPS: { key: SizeQuickKey; label: string }[] = [
  { key: 'all', label: '不限' },
  { key: 'lt20', label: '<20 cm' },
  { key: '20to40', label: '20-40 cm' },
  { key: '40to60', label: '40-60 cm' },
  { key: 'gte60', label: '≥60 cm' },
];

const WEIGHT_CHIPS: { key: SizeQuickKey; label: string }[] = [
  { key: 'all', label: '不限' },
  { key: 'lt05', label: '<0.5 kg' },
  { key: '05to1', label: '0.5-1 kg' },
  { key: '1to3', label: '1-3 kg' },
  { key: 'gte3', label: '≥3 kg' },
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

  const speciesSelected = filter.species.length > 0;
  const hasCondition = activeConditionCount(filter) > 0;

  const toggleSpecies = (key: string) => {
    const set = new Set(filter.species);
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    onChange({ ...filter, species: Array.from(set) });
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
      <Dimension
        title="鱼种"
        extra={speciesSelected ? <View style={styles.dimDot} /> : null}
      >
        <Chip
          label="不限"
          selected={!speciesSelected}
          onPress={() => onChange({ ...filter, species: [] })}
        />
        {quickSpecies.map((item) => (
          <Chip
            key={item.key}
            label={item.name}
            selected={filter.species.includes(item.key)}
            onPress={() => toggleSpecies(item.key)}
          />
        ))}
        <Chip label="更多" arrow onPress={() => setSubSheet('species')} />
      </Dimension>

      {/* 2 · 时间（单选；「自定义 ›」进 F3） */}
      <Dimension title="时间" extra={filter.time === 'custom' ? <View style={styles.dimDot} /> : null}>
        {TIME_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.time === item.key}
            onPress={() => onChange({ ...filter, time: item.key, timeCustom: item.key === 'all' ? null : filter.timeCustom })}
          />
        ))}
        <Chip
          label="自定义"
          arrow
          selected={filter.time === 'custom'}
          onPress={() => setSubSheet('time')}
        />
      </Dimension>

      {/* 3 · 尺寸（长度/重量切换视图；两指标均设为 AND，切换不丢条件） */}
      <Dimension
        title="尺寸"
        extra={
          (filter.lengthQuick !== 'all' || filter.lengthCustom || filter.weightQuick !== 'all' || filter.weightCustom) ? (
            <View style={styles.dimDot} />
          ) : null
        }
        right={
          <View style={styles.sizeToggle}>
            {(['length', 'weight'] as const).map((mode) => {
              const active = filter.sizeMode === mode;
              return (
                <PressableScale
                  key={mode}
                  onPress={() => onChange({ ...filter, sizeMode: mode })}
                  scaleTo={0.95}
                >
                  <View style={[styles.sizeToggleItem, active && styles.sizeToggleActive]}>
                    <Text style={[styles.sizeToggleText, active && styles.sizeToggleTextActive]}>
                      {mode === 'length' ? '长度' : '重量'}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        }
      >
        {filter.sizeMode === 'length' ? (
          <>
            {LENGTH_CHIPS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                selected={filter.lengthQuick === item.key}
                onPress={() => onChange({ ...filter, lengthQuick: item.key })}
              />
            ))}
            <Chip
              label="自定义"
              arrow
              selected={filter.lengthQuick === 'custom'}
              onPress={() => setSubSheet('size')}
            />
          </>
        ) : (
          <>
            {WEIGHT_CHIPS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                selected={filter.weightQuick === item.key}
                onPress={() => onChange({ ...filter, weightQuick: item.key })}
              />
            ))}
            <Chip
              label="自定义"
              arrow
              selected={filter.weightQuick === 'custom'}
              onPress={() => setSubSheet('size')}
            />
          </>
        )}
      </Dimension>

      {/* 4 · 特殊记录（多选 OR，固定第 4 项；F1 不复制 Growth Mark 徽章视觉） */}
      <Dimension title="特殊记录" extra={filter.special.length > 0 ? <View style={styles.dimDot} /> : null}>
        <Chip
          label="不限"
          selected={filter.special.length === 0}
          onPress={() => onChange({ ...filter, special: [] })}
        />
        {SPECIAL_CHIPS.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={filter.special.includes(item.key)}
            onPress={() => {
              const set = new Set(filter.special);
              if (set.has(item.key)) {
                set.delete(item.key);
              } else {
                set.add(item.key);
              }
              onChange({ ...filter, special: Array.from(set) });
            }}
          />
        ))}
      </Dimension>

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

/** 维度行：标题 + 右侧附属控件 + chips 换行布局 */
const Dimension: React.FC<{
  title: string;
  right?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, right, extra, children }) => (
  <View style={styles.dimension}>
    <View style={styles.dimensionHeader}>
      <View style={styles.dimensionTitleRow}>
        <Text style={styles.dimensionTitle}>{title}</Text>
        {extra}
      </View>
      {right}
    </View>
    <View style={styles.chipWrap}>{children}</View>
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
      {arrow ? <Icon name="chevron-forward" size={12} color={coreColors.mistBlueGray} /> : null}
    </View>
  </PressableScale>
);

const styles = StyleSheet.create({
  panel: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
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
  dimension: {
    marginTop: 22,
  } as ViewStyle,
  dimensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  } as ViewStyle,
  dimensionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  dimensionTitle: {
    color: coreColors.deepLakeBlue,
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
  dimDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: coreColors.morningGold,
  } as ViewStyle,
  sizeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(233,240,243,0.9)',
    borderRadius: 14,
    padding: 2,
  } as ViewStyle,
  sizeToggleItem: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
  } as ViewStyle,
  sizeToggleActive: {
    backgroundColor: '#FFFFFF',
  } as ViewStyle,
  sizeToggleText: {
    fontSize: fs(12),
    color: coreColors.lakeBlue,
  } as TextStyle,
  sizeToggleTextActive: {
    color: coreColors.deepLakeBlue,
    fontWeight: '600',
  } as TextStyle,
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  } as ViewStyle,
  chipHit: {
    minHeight: 44,
    justifyContent: 'center',
  } as ViewStyle,
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(233,240,243,0.72)',
  } as ViewStyle,
  chipSelected: {
    backgroundColor: 'rgba(77,158,161,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(77,158,161,0.45)',
  } as ViewStyle,
  chipText: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
  } as TextStyle,
  chipTextSelected: {
    color: '#2E6E71',
    fontWeight: '600',
  } as TextStyle,
});
