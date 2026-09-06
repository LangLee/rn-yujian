import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList, SpeciesPickerRouteProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { FishGuideItem } from '../types/models';
import { fishKnowledgeService, localGuideItems, mergeGuideItems } from '../services/fishKnowledgeService';
import { catchMemoryService } from '../services/catchMemoryService';
import { palette } from '../constants/colors';
import { radius, spacing, typeScale } from '../constants/tokens';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { RemoteImage } from '../components/RemoteImage';
import { GlassCard } from '../components/ui/GlassCard';
import { PressableScale } from '../components/ui/PressableScale';
import { FishGlyph } from '../components/ui/FishGlyph';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type SpeciesPickerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SpeciesPicker'>;

/**
 * 鱼种搜索 / 选择器（设计文档 11）：
 * 纠错场景追求快速选中 —— 结果行只保留 鱼图 + 中文鱼名 + 必要别名 + Chevron；
 * 拉丁学名、生态标签等知识信息不进入纠错选择器。
 * 最近选择 + 常见鱼种帮助快速回填。
 */
export const SpeciesPickerScreen: React.FC = () => {
  const navigation = useNavigation<SpeciesPickerScreenNavigationProp>();
  const route = useRoute<SpeciesPickerRouteProp>();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [browseAll, setBrowseAll] = useState(false);
  const [remote, setRemote] = useState<FishGuideItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<{ key: string; name: string }[]>([]);

  // 页面卸载时收口未完成的选择请求（如 Android 返回键直接退出）
  useEffect(
    () => () => {
      speciesPickerHub.complete(null);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setRecent(await catchMemoryService.loadRecentSpecies());
      try {
        const items = await fishKnowledgeService.listSpecies();
        if (mounted) {
          setRemote(items);
        }
      } catch {
        // 离线时使用本地鱼种
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const all: FishGuideItem[] = useMemo(
    () => (remote ? mergeGuideItems(remote) : localGuideItems()),
    [remote],
  );

  const results = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }
    return all.filter(
      (item) =>
        item.nameCn.includes(keyword) ||
        (item.aliases ?? []).some((alias) => alias.includes(keyword)) ||
        item.id.includes(keyword.toLowerCase()),
    );
  }, [all, query]);

  const commonSpecies = useMemo(
    () => all.filter((item) => item.discovered).slice(0, 6),
    [all],
  );

  const complete = (key: string, name: string) => {
    haptics.selection();
    void catchMemoryService.rememberSpecies(key, name);
    speciesPickerHub.complete({ key, name });
    navigation.goBack();
  };

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const title = route.params?.title ?? '选择鱼种';
  const searching = query.trim().length > 0;
  const showingAll = browseAll && !searching;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <PressableScale
          onPress={() => {
            speciesPickerHub.complete(null);
            navigation.goBack();
          }}
          scaleTo={0.94}
          style={styles.backHit}
        >
          <View style={styles.backCircle}>
            <Icon name="chevron-back" size={22} color={textPrimary} />
          </View>
        </PressableScale>
        <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchWrap, { backgroundColor: profile.surface.glassStrong }]}>
          <Icon name="search-outline" size={17} color={textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder="搜索鱼种名称或别名"
            placeholderTextColor={textSecondary}
            autoFocus
            returnKeyType="search"
          />
          {searching ? (
            <PressableScale onPress={() => setQuery('')} scaleTo={0.9}>
              <Icon name="close-circle" size={17} color={textSecondary} />
            </PressableScale>
          ) : null}
        </View>

        {loading && all.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={profile.surface.accent} />
          </View>
        ) : searching ? (
          results.length > 0 ? (
            <View style={styles.listGap}>
              {results.map((item) => (
                <SpeciesRow
                  key={item.id}
                  item={item}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  onPress={() => complete(item.id, item.nameCn)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noResult}>
              <Text style={[styles.noResultTitle, { color: textPrimary }]}>没有找到这个鱼种</Text>
              <Text style={[styles.noResultText, { color: textSecondary }]}>
                可以试试其他名称，或清空搜索浏览全部鱼种。
              </Text>
              <PressableScale
                onPress={() => {
                  setQuery('');
                  setBrowseAll(true);
                }}
                scaleTo={0.97}
                style={styles.browseHit}
              >
                <Text style={[styles.browseText, { color: profile.surface.accent }]}>
                  浏览全部鱼种
                </Text>
              </PressableScale>
            </View>
          )
        ) : showingAll ? (
          <View style={styles.listGap}>
            {all.map((item) => (
              <SpeciesRow
                key={item.id}
                item={item}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                onPress={() => complete(item.id, item.nameCn)}
              />
            ))}
          </View>
        ) : (
          <>
            {recent.length > 0 ? (
              <>
                <SectionLabel text="最近选择" color={textSecondary} />
                <View style={styles.listGap}>
                  {recent.slice(0, 4).map((item) => (
                    <PressableScale
                      key={item.key}
                      onPress={() => complete(item.key, item.name)}
                      scaleTo={0.99}
                    >
                      <GlassCard style={styles.simpleRow}>
                        <FishGlyph size={18} color={profile.surface.accent} />
                        <Text style={[styles.simpleName, { color: textPrimary }]}>{item.name}</Text>
                        <Icon name="chevron-forward" size={16} color={textSecondary} />
                      </GlassCard>
                    </PressableScale>
                  ))}
                </View>
              </>
            ) : null}
            <SectionLabel text="常见鱼种" color={textSecondary} />
            <View style={styles.listGap}>
              {commonSpecies.map((item) => (
                <SpeciesRow
                  key={item.id}
                  item={item}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  onPress={() => complete(item.id, item.nameCn)}
                />
              ))}
            </View>
            <PressableScale
              onPress={() => setBrowseAll(true)}
              scaleTo={0.97}
              style={styles.browseHit}
            >
              <Text style={[styles.browseText, { color: profile.surface.accent }]}>
                查看全部 {all.length} 种鱼
              </Text>
            </PressableScale>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const SectionLabel: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <Text style={[styles.sectionLabel, { color }]}>{text}</Text>
);

const SpeciesRow: React.FC<{
  item: FishGuideItem;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}> = ({ item, textPrimary, textSecondary, onPress }) => {
  const imageUrl = fishKnowledgeService.resolveAssetUrl(item.coverImage);
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={styles.rowHit}>
      <GlassCard style={styles.speciesRow}>
        {imageUrl ? (
          <RemoteImage url={imageUrl} style={styles.speciesImage} resizeMode="cover" />
        ) : (
          <View style={[styles.speciesImage, styles.speciesImageFallback]}>
            <FishGlyph size={20} color={palette.waterTeal} />
          </View>
        )}
        <View style={styles.speciesBody}>
          <Text style={[styles.speciesName, { color: textPrimary }]}>{item.nameCn}</Text>
          {(item.aliases ?? []).length > 0 ? (
            <Text style={[styles.speciesAliases, { color: textSecondary }]} numberOfLines={1}>
              {(item.aliases ?? []).slice(0, 2).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={16} color={textSecondary} />
      </GlassCard>
    </PressableScale>
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.s,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: typeScale.body,
    paddingVertical: 0,
  } as TextStyle,
  loadingWrap: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  } as ViewStyle,
  listGap: {
    gap: spacing.md,
  } as ViewStyle,
  sectionLabel: {
    fontSize: typeScale.meta,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  } as TextStyle,
  rowHit: {
    borderRadius: radius.m,
  } as ViewStyle,
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  } as ViewStyle,
  speciesImage: {
    width: 48,
    height: 48,
    borderRadius: radius.s,
  } as ViewStyle,
  speciesImageFallback: {
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  speciesBody: {
    flex: 1,
  } as ViewStyle,
  speciesName: {
    fontSize: typeScale.body,
    fontWeight: '600',
  } as TextStyle,
  speciesAliases: {
    fontSize: typeScale.caption,
    marginTop: 2,
  } as TextStyle,
  simpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  } as ViewStyle,
  simpleName: {
    flex: 1,
    fontSize: typeScale.body,
    fontWeight: '600',
  } as TextStyle,
  noResult: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  } as ViewStyle,
  noResultTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
  } as TextStyle,
  noResultText: {
    fontSize: typeScale.meta,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  } as TextStyle,
  browseHit: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  } as ViewStyle,
  browseText: {
    fontSize: typeScale.meta,
    fontWeight: '600',
  } as TextStyle,
});
