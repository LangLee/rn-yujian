import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { PressableScale } from '../../../components/ui/PressableScale';
import { coreColors } from '../../../constants/coreUi';
import { fs } from '../../../constants/tokens';
import { MyCatchesFilterState, SizeRange } from '../../../utils/myCatchesTimeline';

/**
 * F3 · 自定义时间（单一日期范围）与 F4 · 自定义尺寸（长度 cm / 重量 kg 独立范围）。
 * 两者的独立高保真状态在设计中 MISSING：这里以应用内轻量表单承载，
 * 输入格式 YYYY.MM.DD；空范围不构成条件，长度与重量同时设置时 AND（Spec §3）。
 */

const parseDate = (text: string): number | null => {
  const match = text.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const parseNumber = (text: string): number | null => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
};

export const F3TimeSheet: React.FC<{
  visible: boolean;
  filter: MyCatchesFilterState;
  onClose: () => void;
  onConfirm: (range: { start: number; end: number } | null) => void;
}> = ({ visible, filter, onClose, onConfirm }) => {
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      const format = (ms: number) => {
        const date = new Date(ms);
        const pad = (v: number) => (v < 10 ? `0${v}` : `${v}`);
        return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
      };
      setStartText(filter.timeCustom ? format(filter.timeCustom.start) : '');
      setEndText(filter.timeCustom ? format(filter.timeCustom.end) : '');
    }
  }

  const start = parseDate(startText);
  const endMs = parseDate(endText);
  const end = endMs === null ? null : endMs + 24 * 60 * 60 * 1000 - 1; // 含结束当天
  const valid =
    (start === null && end === null) ||
    (start !== null && end !== null && start <= end);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="自定义时间">
      <Text style={styles.hint}>输入日期范围（格式 2026.01.31），留空表示不限</Text>
      <View style={styles.rangeRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>开始日期</Text>
          <TextInput
            style={styles.input}
            value={startText}
            onChangeText={setStartText}
            placeholder="2026.01.01"
            placeholderTextColor={coreColors.mistBlueGray}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <Text style={styles.dash}>—</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>结束日期</Text>
          <TextInput
            style={styles.input}
            value={endText}
            onChangeText={setEndText}
            placeholder="2026.01.31"
            placeholderTextColor={coreColors.mistBlueGray}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      {!valid ? <Text style={styles.error}>开始日期需早于结束日期</Text> : null}
      <PressableScale
        onPress={() => {
          if (!valid) return;
          onConfirm(start !== null && end !== null ? { start, end } : null);
        }}
        scaleTo={0.97}
        style={styles.confirmHit}
      >
        <Text style={[styles.confirmText, !valid && styles.confirmDisabled]}>完成</Text>
      </PressableScale>
    </BottomSheet>
  );
};

export const F4SizeSheet: React.FC<{
  visible: boolean;
  filter: MyCatchesFilterState;
  onClose: () => void;
  onConfirm: (
    sizeMode: 'length' | 'weight',
    lengthCustom: SizeRange | null,
    weightCustom: SizeRange | null,
    lengthQuick: MyCatchesFilterState['lengthQuick'],
    weightQuick: MyCatchesFilterState['weightQuick'],
  ) => void;
}> = ({ visible, filter, onClose, onConfirm }) => {
  const [lengthMin, setLengthMin] = useState('');
  const [lengthMax, setLengthMax] = useState('');
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setLengthMin(filter.lengthCustom?.min != null ? `${filter.lengthCustom.min}` : '');
      setLengthMax(filter.lengthCustom?.max != null ? `${filter.lengthCustom.max}` : '');
      setWeightMin(filter.weightCustom?.min != null ? `${filter.weightCustom.min}` : '');
      setWeightMax(filter.weightCustom?.max != null ? `${filter.weightCustom.max}` : '');
    }
  }

  const lenMin = parseNumber(lengthMin);
  const lenMax = parseNumber(lengthMax);
  const wMin = parseNumber(weightMin);
  const wMax = parseNumber(weightMax);
  const lenValid = (lenMin === null || lenMax === null || lenMin <= lenMax) &&
    (lenMin !== null || lenMax !== null);
  const wValid = (wMin === null || wMax === null || wMin <= wMax) &&
    (wMin !== null || wMax !== null);
  const valid = lenValid && wValid;

  const buildRange = (min: number | null, max: number | null): SizeRange | null =>
    min === null && max === null ? null : { min, max };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="自定义尺寸">
      <Text style={styles.hint}>长度单位 cm、重量单位 kg；留空表示不限；两项都设置时需同时满足</Text>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>长度（cm）</Text>
        <View style={styles.rangeRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>最小</Text>
            <TextInput
              style={styles.input}
              value={lengthMin}
              onChangeText={setLengthMin}
              placeholder="如 20"
              placeholderTextColor={coreColors.mistBlueGray}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.dash}>—</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>最大</Text>
            <TextInput
              style={styles.input}
              value={lengthMax}
              onChangeText={setLengthMax}
              placeholder="如 40"
              placeholderTextColor={coreColors.mistBlueGray}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>重量（kg）</Text>
        <View style={styles.rangeRow}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>最小</Text>
            <TextInput
              style={styles.input}
              value={weightMin}
              onChangeText={setWeightMin}
              placeholder="如 0.5"
              placeholderTextColor={coreColors.mistBlueGray}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.dash}>—</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>最大</Text>
            <TextInput
              style={styles.input}
              value={weightMax}
              onChangeText={setWeightMax}
              placeholder="如 3"
              placeholderTextColor={coreColors.mistBlueGray}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>
      {!valid ? <Text style={styles.error}>最小值不能大于最大值</Text> : null}
      <PressableScale
        onPress={() => {
          if (!valid) return;
          onConfirm(
            filter.sizeMode,
            buildRange(lenMin, lenMax),
            buildRange(wMin, wMax),
            lenMin !== null || lenMax !== null ? 'custom' : filter.lengthQuick === 'custom' ? 'all' : filter.lengthQuick,
            wMin !== null || wMax !== null ? 'custom' : filter.weightQuick === 'custom' ? 'all' : filter.weightQuick,
          );
        }}
        scaleTo={0.97}
        style={styles.confirmHit}
      >
        <Text style={[styles.confirmText, !valid && styles.confirmDisabled]}>完成</Text>
      </PressableScale>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  hint: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
    marginTop: 2,
    marginBottom: 10,
    lineHeight: 17,
  } as TextStyle,
  group: {
    marginBottom: 14,
  } as ViewStyle,
  groupTitle: {
    fontSize: fs(13),
    fontWeight: '600',
    color: coreColors.deepLakeBlue,
    marginBottom: 8,
  } as TextStyle,
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  } as ViewStyle,
  field: {
    flex: 1,
  } as ViewStyle,
  fieldLabel: {
    fontSize: fs(11),
    color: coreColors.mistBlueGray,
    marginBottom: 4,
  } as TextStyle,
  input: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(116,136,151,0.28)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 12,
    fontSize: fs(14),
    color: coreColors.deepLakeBlue,
    paddingVertical: 0,
  } as TextStyle,
  dash: {
    fontSize: fs(14),
    color: coreColors.mistBlueGray,
    paddingBottom: 11,
  } as TextStyle,
  error: {
    fontSize: fs(12),
    color: '#C25B4E',
    marginBottom: 4,
  } as TextStyle,
  confirmHit: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 10,
  } as ViewStyle,
  confirmText: {
    color: coreColors.deepLakeBlue,
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
  confirmDisabled: {
    color: 'rgba(116,136,151,0.45)',
  } as TextStyle,
});
