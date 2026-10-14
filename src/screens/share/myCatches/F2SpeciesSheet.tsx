import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { AppIcon } from '../../../components/icons/AppIcon';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { PressableScale } from '../../../components/ui/PressableScale';
import { coreColors } from '../../../constants/coreUi';
import { fs } from '../../../constants/tokens';
import type { SpeciesOption } from './F1FilterPanel';

/**
 * F2 · 鱼种多选（species_picker_v1 / MULTI_SELECT）。
 * 多选视觉未冻结（PARTIAL）：以应用内轻量列表 + 搜索 + 勾选承载，
 * 选择在浏览过程中保持，确认后回到 F1（同维 OR）。
 */
export const F2SpeciesSheet: React.FC<{
  visible: boolean;
  options: SpeciesOption[];
  selected: string[];
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
}> = ({ visible, options, selected, onClose, onConfirm }) => {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);

  // 每次打开时以当前选择为草稿，浏览过程中保持
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setDraft(selected);
      setQuery('');
    }
  }

  const results = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return options;
    return options.filter((item) => item.name.includes(keyword));
  }, [options, query]);

  const toggle = (key: string) => {
    setDraft((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        // F2 返回 F1 时保留已选（Spec §3：选择在浏览过程中保持，返回恢复 F1）
        onConfirm(draft);
      }}
      title="选择鱼种"
    >
      <View style={styles.searchWrap}>
        <AppIcon name="search" size={16} color={coreColors.mistBlueGray} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索鱼种"
          placeholderTextColor={coreColors.mistBlueGray}
        />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {results.map((item) => {
          const checked = draft.includes(item.key);
          return (
            <PressableScale key={item.key} onPress={() => toggle(item.key)} scaleTo={0.99}>
              <View style={styles.row}>
                <Text style={[styles.rowText, checked && styles.rowTextChecked]}>{item.name}</Text>
                <View style={[styles.box, checked && styles.boxChecked]}>
                  {checked ? (
                    <AppIcon name="check" size={14} color="#FFFFFF" />
                  ) : null}
                </View>
              </View>
            </PressableScale>
          );
        })}
        {results.length === 0 ? (
          <Text style={styles.emptyText}>没有匹配的鱼种</Text>
        ) : null}
      </ScrollView>
      <PressableScale onPress={() => onConfirm(draft)} scaleTo={0.97} style={styles.confirmHit}>
        <Text style={styles.confirmText}>
          {draft.length > 0 ? `完成 · 已选 ${draft.length} 种` : '完成'}
        </Text>
      </PressableScale>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(233,240,243,0.8)',
    paddingHorizontal: 12,
    marginTop: 4,
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: fs(14),
    paddingVertical: 0,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  list: {
    maxHeight: 340,
    marginTop: 6,
  } as ViewStyle,
  listContent: {
    paddingBottom: 8,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 6,
  } as ViewStyle,
  rowText: {
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  rowTextChecked: {
    fontWeight: '600',
  } as TextStyle,
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(116,136,151,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  boxChecked: {
    backgroundColor: coreColors.morningGold,
    borderColor: coreColors.morningGold,
  } as ViewStyle,
  emptyText: {
    textAlign: 'center',
    color: coreColors.mistBlueGray,
    fontSize: fs(13),
    paddingVertical: 20,
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
});
