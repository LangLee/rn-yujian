import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCatchArchive } from '../../contexts/CatchContext';
import { font, fs, spacing } from '../../constants/tokens';
import { catchMemoryService, CatchMemoryData } from '../../services/catchMemoryService';
import {
  ShareRangeKey,
  ShareTemplateId,
  ShareWork,
} from '../../services/shareWorkService';
import {
  buildCustomRange,
  buildRange,
  buildShareSnapshot,
  CatchWithMemory,
  CUSTOM_RANGE_OPTIONS,
  CustomRangePreset,
  ShareRangeSpec,
} from '../../utils/growthInsights';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { PressableScale } from '../../components/ui/PressableScale';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RadioDot } from '../../components/ui/RadioDot';
import { ScreenHeader } from '../../components';
import { PosterCanvas, POSTER_ASPECT } from './PosterCanvas';

type CreateNavigationProp = StackNavigationProp;
type CreateRoute = RouteProp<
  {
    ShareCreate: {
      presetRange?: ShareRangeKey;
      presetTemplate?: ShareTemplateId;
      presetCatchId?: string;
    } | undefined;
  },
  'ShareCreate'
>;

const GOLD = '#C9A25E';
const GOLD_LIGHT = '#E7D2A2';
const GOLD_TEXT = '#9A7B3F';

const RANGE_TILE_LABELS: Record<ShareRangeKey, string> = {
  today: '今天',
  week: '本周',
  month: '本月',
  custom: '自定义',
};

const TEMPLATES: {
  id: ShareTemplateId;
  name: string;
  description: string;
  tags: string[];
}[] = [
  { id: 'score', name: '战绩卡', description: '展示这段时间的收获结果', tags: ['鱼获统计', 'TOP 排名', '精美海报'] },
  { id: 'story', name: '水边故事', description: '记录一次值得留下的经历', tags: ['图文记录', '情感分享', '自然之美'] },
];

const HERO_FISH_OPTIONS = ['自动选择最大鱼', '最近一条'];
const DISPLAY_OPTIONS = ['Top 3 鱼 + 其他鱼获统计', '仅 TOP 1', '仅统计数字'];
const LOCATION_OPTIONS = ['显示地点', '隐藏地点'];

/** 生成设置（分享模板选择高保真稿）：范围 → 模板 → 生成内容 → 隐私，单页整合。 */
export const ShareCreateScreen: React.FC = () => {
  const navigation = useNavigation<CreateNavigationProp>();
  const route = useRoute<CreateRoute>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const insets = useSafeAreaInsets();
  const accessToken = session?.accessToken ?? null;

  const [rangeKey, setRangeKey] = useState<ShareRangeKey>(route.params?.presetRange ?? 'week');
  const [customPreset, setCustomPreset] = useState<CustomRangePreset>('7d');
  const [templateId, setTemplateId] = useState<ShareTemplateId>(route.params?.presetTemplate ?? 'score');
  // 从鱼获详情进入时先锁定「这一天」，用户主动改范围后解锁
  const [presetConsumed, setPresetConsumed] = useState(false);
  const [heroFishIndex, setHeroFishIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [locationIndex, setLocationIndex] = useState(0);
  const [privateOnly, setPrivateOnly] = useState(true);
  const [customSheet, setCustomSheet] = useState(false);
  const [allTemplateSheet, setAllTemplateSheet] = useState(false);
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        catches.map(async (item) => [item.id, await catchMemoryService.load(item.id)] as const),
      );
      if (mounted) {
        setMemories(Object.fromEntries(entries));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [catches]);

  const items: CatchWithMemory[] = useMemo(
    () => catches.map((item) => ({ catch: item, memory: memories[item.id] ?? null })),
    [catches, memories],
  );

  // 从鱼获详情页进入：锁定为那条鱼获当天的范围
  const presetDayRange = useMemo<ShareRangeSpec | null>(() => {
    const catchId = route.params?.presetCatchId;
    if (!catchId) {
      return null;
    }
    const target = catches.find((item) => item.id === catchId);
    const date = target ? new Date(target.capturedAt) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return null;
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
    const dot = `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
    return { key: 'custom', start, end, label: '这一天', rangeLabel: dot };
  }, [route.params, catches]);

  const activeSpec = useMemo<ShareRangeSpec>(() => {
    if (presetDayRange && !presetConsumed) {
      return presetDayRange;
    }
    if (rangeKey === 'custom') {
      return buildCustomRange(customPreset);
    }
    return buildRange(rangeKey);
  }, [presetDayRange, presetConsumed, rangeKey, customPreset]);

  const snapshot = useMemo(() => buildShareSnapshot(items, activeSpec), [items, activeSpec]);

  const todaySnapshot = useMemo(
    () => buildShareSnapshot(items, buildRange('today')),
    [items],
  );
  const weekSnapshot = useMemo(
    () => buildShareSnapshot(items, buildRange('week')),
    [items],
  );
  const monthSnapshot = useMemo(
    () => buildShareSnapshot(items, buildRange('month')),
    [items],
  );
  const tileCounts: Record<Exclude<ShareRangeKey, 'custom'>, number> = {
    today: todaySnapshot.count,
    week: weekSnapshot.count,
    month: monthSnapshot.count,
  };

  const hasCatchInRange = snapshot.count > 0;
  const showLocation = locationIndex === 0;
  const includePhotos = true;

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  const composeWork = React.useCallback(
    (layoutIndex: number): ShareWork => {
      const title =
        templateId === 'story'
          ? '水边故事'
          : activeSpec.key === 'today'
            ? '今日战绩'
            : activeSpec.key === 'week'
              ? '本周战绩'
              : activeSpec.key === 'month'
                ? '本月战绩'
                : '我的战绩';
      const baseTop =
        displayIndex === 1 ? snapshot.top.slice(0, 1) : displayIndex === 2 ? [] : snapshot.top;
      const top = heroFishIndex === 1 ? reorderLatestFirst(snapshot.top).slice(0, baseTop.length) : baseTop;
      const others = displayIndex === 0 ? snapshot.others : [];
      return {
        id: `share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        templateId,
        layoutIndex,
        rangeKey: activeSpec.key,
        rangeLabel: activeSpec.rangeLabel,
        title,
        location: showLocation ? snapshot.location : null,
        count: snapshot.count,
        speciesCount: snapshot.speciesCount,
        top,
        others,
        biggest: snapshot.biggest,
        story: snapshot.story,
        photoUris: includePhotos ? snapshot.photoUris : [],
        visibility: privateOnly ? 'private' : 'public',
        shareMessage:
          `我的${activeSpec.label}鱼获：${snapshot.count} 条 / ${snapshot.speciesCount} 种鱼` +
          (snapshot.biggest?.weightKg
            ? `，最大 ${snapshot.biggest.name} ${snapshot.biggest.weightKg}kg`
            : '') +
          `\n${title} · 渔见 遇见更大的水域`,
      };
    },
    [templateId, activeSpec, snapshot, displayIndex, heroFishIndex, showLocation, privateOnly],
  );

  const goPreview = () => {
    navigation.navigate('SharePreview', { work: composeWork(0), mode: 'create' });
  };

  const previewWork = useMemo(() => composeWork(0), [composeWork]);

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader
        title="生成鱼获分享"
        subtitle="把这次收获整理成一张记忆"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 头部 */}
        <Text style={[styles.handNote, { color: textSecondary }]}>
          每一次出发，都是与自然相遇。
        </Text>

        {/* 选择鱼获范围 */}
        <SectionCard
          glass={profile.surface.glassStrong}
          glassBorder={profile.surface.glassBorder}
        >
          <View style={styles.sectionTitleRow}>
            <Icon name="fish-outline" size={17} color={textPrimary} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>选择鱼获范围</Text>
          </View>
          <View style={styles.rangeRow}>
            {(['today', 'week', 'month', 'custom'] as ShareRangeKey[]).map((key) => {
              const active = !presetConsumed && presetDayRange ? key === 'custom' : rangeKey === key;
              return (
                <PressableScale
                  key={key}
                  onPress={() => {
                    setPresetConsumed(true);
                    if (key === 'custom') {
                      setCustomSheet(true);
                    } else {
                      setRangeKey(key);
                    }
                  }}
                  scaleTo={0.95}
                  style={styles.rangeTileHit}
                >
                  <View
                    style={[
                      styles.rangeTile,
                      {
                        borderColor: active ? GOLD : 'rgba(23,59,75,0.14)',
                        backgroundColor: active ? 'rgba(201,162,94,0.12)' : 'rgba(255,255,255,0.5)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rangeTileLabel,
                        { color: active ? GOLD_TEXT : textPrimary },
                      ]}
                    >
                      {!presetConsumed && presetDayRange && key === 'custom'
                        ? '这一天'
                        : RANGE_TILE_LABELS[key]}
                    </Text>
                    {key === 'custom' ? (
                      <>
                        <Icon name="options-outline" size={16} color={active ? GOLD_TEXT : textSecondary} />
                        <Text style={[styles.rangeTileCount, { color: textSecondary }]}>自由选择</Text>
                      </>
                    ) : (
                      <>
                        <Icon
                          name="fish"
                          size={15}
                          color={active ? GOLD_TEXT : 'rgba(23,59,75,0.45)'}
                        />
                        <Text style={[styles.rangeTileCount, { color: textSecondary }]}>
                          {tileCounts[key]} 尾鱼获
                        </Text>
                      </>
                    )}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </SectionCard>

        {/* 选择模板 */}
        <View style={styles.templateHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name="sparkles" size={17} color={GOLD} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>选择模板</Text>
          </View>
          <PressableScale onPress={() => setAllTemplateSheet(true)} scaleTo={0.96}>
            <View style={styles.sectionLink}>
              <Text style={[styles.sectionLinkText, { color: textSecondary }]}>查看全部模板</Text>
              <Icon name="chevron-forward" size={14} color={textSecondary} />
            </View>
          </PressableScale>
        </View>

        {TEMPLATES.map((template) => {
          const active = templateId === template.id;
          return (
            <PressableScale
              key={template.id}
              onPress={() => setTemplateId(template.id)}
              scaleTo={0.985}
              style={styles.templateHit}
            >
              <View
                style={[
                  styles.templateCard,
                  {
                    backgroundColor: profile.surface.glassStrong,
                    borderColor: active ? GOLD : profile.surface.glassBorder,
                  },
                ]}
              >
                <View style={styles.templateInfo}>
                  <Text style={[styles.templateName, { color: textPrimary }]}>{template.name}</Text>
                  <Text style={[styles.templateDesc, { color: textSecondary }]}>
                    {template.description}
                  </Text>
                  <View style={styles.templateTags}>
                    {template.tags.map((tag) => (
                      <View key={tag} style={styles.templateTag}>
                        <Text style={[styles.templateTagText, { color: textSecondary }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.templatePreviewWrap}>
                  <TemplateThumb work={previewWork} templateId={template.id} />
                  <View
                    style={[
                      styles.checkBadge,
                      {
                        backgroundColor: active ? GOLD : 'rgba(255,255,255,0.9)',
                        borderColor: active ? GOLD : 'rgba(23,59,75,0.2)',
                      },
                    ]}
                  >
                    {active ? <Icon name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                </View>
              </View>
            </PressableScale>
          );
        })}

        {/* 生成内容 */}
        <View style={[styles.contentHeader, styles.contentHeaderGap]}>
          <View style={styles.sectionTitleRow}>
            <Icon name="settings-outline" size={17} color={textPrimary} />
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>生成内容</Text>
          </View>
        </View>
        <SectionCard glass={profile.surface.glassStrong} glassBorder={profile.surface.glassBorder}>
          <OptionRowWrap
            icon="fish-outline"
            label="代表鱼"
            value={HERO_FISH_OPTIONS[heroFishIndex]}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => setHeroFishIndex((value) => (value + 1) % HERO_FISH_OPTIONS.length)}
          />
          <RowDivider />
          <OptionRowWrap
            icon="stats-chart-outline"
            label="展示方式"
            value={DISPLAY_OPTIONS[displayIndex]}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => setDisplayIndex((value) => (value + 1) % DISPLAY_OPTIONS.length)}
          />
          <RowDivider />
          <OptionRowWrap
            icon="location-outline"
            label="地点显示"
            value={LOCATION_OPTIONS[locationIndex]}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => setLocationIndex((value) => (value + 1) % LOCATION_OPTIONS.length)}
          />
          <RowDivider />
          <View style={styles.optionRow}>
            <View style={styles.optionLeft}>
              <Icon name="lock-closed-outline" size={17} color={textPrimary} />
              <Text style={[styles.optionLabel, { color: textPrimary }]}>隐私设置</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={[styles.optionValue, { color: textSecondary }]}>
                {privateOnly ? '仅自己可见' : '公开可见'}
              </Text>
              <Switch
                value={privateOnly}
                onValueChange={setPrivateOnly}
                trackColor={{ false: 'rgba(23,59,75,0.18)', true: 'rgba(201,162,94,0.75)' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="rgba(23,59,75,0.18)"
              />
            </View>
          </View>
        </SectionCard>

        {/* 范围空提示 */}
        {!hasCatchInRange ? (
          <Text style={[styles.emptyHint, { color: textSecondary }]}>
            这个范围还没有鱼获记录，换个时间范围或先去记录一条吧。
          </Text>
        ) : null}

        {/* 生成预览 CTA */}
        <PressableScale
          onPress={hasCatchInRange ? goPreview : undefined}
          disabled={!hasCatchInRange}
          scaleTo={0.97}
          style={styles.ctaHit}
        >
          <View style={[styles.cta, !hasCatchInRange && styles.ctaDisabled]}>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgGradient id="createCtaBg" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={GOLD_LIGHT} />
                  <Stop offset="1" stopColor={GOLD} />
                </SvgGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#createCtaBg)" rx="27" />
            </Svg>
            <View style={styles.ctaRow} pointerEvents="none">
              <Text style={styles.ctaText}>生成预览</Text>
              <Icon name="arrow-forward" size={17} color="#FFFFFF" />
            </View>
          </View>
        </PressableScale>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.96} style={styles.laterHit}>
          <Text style={[styles.laterText, { color: textSecondary }]}>稍后再生成</Text>
        </PressableScale>

        {/* 底部品牌 */}
        <View style={styles.brandFooter}>
          <Icon name="fish-outline" size={15} color={textSecondary} />
          <Text style={[styles.brandText, { color: textSecondary }]}>渔见 · 遇见更大的水域</Text>
        </View>
      </ScrollView>

      {/* 自定义范围 */}
      <BottomSheet visible={customSheet} onClose={() => setCustomSheet(false)} title="自定义时间范围">
        {CUSTOM_RANGE_OPTIONS.map((option) => (
          <PressableScale
            key={option.key}
            onPress={() => {
              setPresetConsumed(true);
              setCustomPreset(option.key);
              setRangeKey('custom');
              setCustomSheet(false);
            }}
            scaleTo={0.99}
          >
            <View style={styles.sheetRow}>
              <Text
                style={[
                  styles.sheetRowText,
                  { color: rangeKey === 'custom' && customPreset === option.key ? GOLD_TEXT : textPrimary },
                ]}
              >
                {option.label}
              </Text>
              <RadioDot
                selected={rangeKey === 'custom' && customPreset === option.key}
                color={GOLD}
                idleColor={textSecondary}
              />
            </View>
          </PressableScale>
        ))}
      </BottomSheet>

      {/* 全部模板 */}
      <BottomSheet
        visible={allTemplateSheet}
        onClose={() => setAllTemplateSheet(false)}
        title="选择模板"
      >
        {TEMPLATES.map((template) => (
          <PressableScale
            key={template.id}
            onPress={() => {
              setTemplateId(template.id);
              setAllTemplateSheet(false);
            }}
            scaleTo={0.99}
          >
            <View style={styles.sheetRow}>
              <View style={styles.sheetTemplateInfo}>
                <Text
                  style={[
                    styles.sheetRowText,
                    { color: templateId === template.id ? GOLD_TEXT : textPrimary },
                  ]}
                >
                  {template.name}
                </Text>
                <Text style={[styles.sheetTemplateDesc, { color: textSecondary }]}>
                  {template.description} · {template.tags.join(' / ')}
                </Text>
              </View>
              <RadioDot
                selected={templateId === template.id}
                color={GOLD}
                idleColor={textSecondary}
              />
            </View>
          </PressableScale>
        ))}
      </BottomSheet>
    </View>
  );
};

/** 「代表鱼：最近一条」时把最近记录的鱼种排到最前。 */
function reorderLatestFirst(
  top: ReturnType<typeof buildShareSnapshot>['top'],
): ReturnType<typeof buildShareSnapshot>['top'] {
  return [...top].reverse();
}

/** 模板缩略图：按模板 ID 渲染迷你海报（transformOrigin 缩放，所见即所得）。 */
const TemplateThumb: React.FC<{ work: ShareWork; templateId: ShareTemplateId }> = ({
  work,
  templateId,
}) => {
  const BASE_W = 190;
  const THUMB_W = 128;
  const scale = THUMB_W / BASE_W;
  const thumbWork = useMemo<ShareWork>(() => ({ ...work, templateId, layoutIndex: 0 }), [work, templateId]);
  return (
    <View
      style={{
        width: THUMB_W,
        height: BASE_W * POSTER_ASPECT * scale,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: BASE_W,
          height: BASE_W * POSTER_ASPECT,
          transform: [{ scale }],
          transformOrigin: 'top left',
        }}
      >
        <PosterCanvas work={thumbWork} width={BASE_W} />
      </View>
    </View>
  );
};

const SectionCard: React.FC<{
  glass: string;
  glassBorder: string;
  children: React.ReactNode;
}> = ({ glass, glassBorder, children }) => (
  <View style={[styles.sectionCard, { backgroundColor: glass, borderColor: glassBorder }]}>
    {children}
  </View>
);

const OptionRowWrap: React.FC<{
  icon: string;
  label: string;
  value: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}> = ({ icon, label, value, textPrimary, textSecondary, onPress }) => (
  <PressableScale onPress={onPress} scaleTo={0.99}>
    <View style={styles.optionRow}>
      <View style={styles.optionLeft}>
        <Icon name={icon} size={17} color={textPrimary} />
        <Text style={[styles.optionLabel, { color: textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.optionRight}>
        <Text style={[styles.optionValue, { color: textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
        <Icon name="chevron-forward" size={14} color={textSecondary} />
      </View>
    </View>
  </PressableScale>
);

const RowDivider: React.FC = () => (
  <View style={styles.rowDivider} />
);

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
  handNote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: fs(12),
    textAlign: 'right',
    marginTop: spacing.xs,
    opacity: 0.8,
    transform: [{ rotate: '-1.5deg' }],
  } as TextStyle,
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.lg,
  } as ViewStyle,
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: font.serif,
    fontSize: fs(18),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
  } as ViewStyle,
  rangeTileHit: {
    flex: 1,
  } as ViewStyle,
  rangeTile: {
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 3,
  } as ViewStyle,
  rangeTileLabel: {
    fontSize: fs(15),
    fontWeight: '700',
  } as TextStyle,
  rangeTileCount: {
    fontSize: fs(10.5),
  } as TextStyle,
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  } as ViewStyle,
  sectionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  } as ViewStyle,
  sectionLinkText: {
    fontSize: fs(13),
  } as TextStyle,
  templateHit: {
    borderRadius: 18,
    marginTop: spacing.md,
  } as ViewStyle,
  templateCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
  } as ViewStyle,
  templateInfo: {
    flex: 1,
  } as ViewStyle,
  templateName: {
    fontFamily: font.serif,
    fontSize: fs(21),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  templateDesc: {
    fontSize: fs(12.5),
    lineHeight: 18,
    marginTop: 6,
  } as TextStyle,
  templateTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  } as ViewStyle,
  templateTag: {
    borderRadius: 9,
    backgroundColor: 'rgba(23,59,75,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(23,59,75,0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
  } as ViewStyle,
  templateTagText: {
    fontSize: fs(10.5),
  } as TextStyle,
  templatePreviewWrap: {
    width: 128,
  } as ViewStyle,
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  contentHeaderGap: {
    marginTop: spacing.xl,
    marginBottom: 0,
  } as ViewStyle,
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 2,
  } as ViewStyle,
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  optionLabel: {
    fontSize: fs(14.5),
    fontWeight: '600',
  } as TextStyle,
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  } as ViewStyle,
  optionValue: {
    fontSize: fs(13),
  } as TextStyle,
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(23,59,75,0.1)',
  } as ViewStyle,
  emptyHint: {
    fontSize: fs(12.5),
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    lineHeight: 19,
  } as TextStyle,
  ctaHit: {
    marginTop: spacing.xl,
    borderRadius: 27,
  } as ViewStyle,
  cta: {
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    shadowColor: '#8A6A2F',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  } as ViewStyle,
  ctaDisabled: {
    opacity: 0.45,
  } as ViewStyle,
  ctaRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  } as ViewStyle,
  ctaText: {
    color: '#FFFFFF',
    fontSize: fs(16),
    fontWeight: '700',
    letterSpacing: 3,
  } as TextStyle,
  laterHit: {
    alignItems: 'center',
    marginTop: spacing.lg,
    borderRadius: 18,
  } as ViewStyle,
  laterText: {
    fontSize: fs(13.5),
    textDecorationLine: 'underline',
    letterSpacing: 2,
  } as TextStyle,
  brandFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.xxl,
  } as ViewStyle,
  brandText: {
    fontFamily: font.serif,
    fontSize: fs(12),
    letterSpacing: 2,
  } as TextStyle,
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 4,
  } as ViewStyle,
  sheetRowText: {
    fontSize: fs(15),
    fontWeight: '600',
  } as TextStyle,
  sheetTemplateInfo: {
    flex: 1,
    paddingRight: spacing.md,
  } as ViewStyle,
  sheetTemplateDesc: {
    fontSize: fs(12),
    marginTop: 3,
  } as TextStyle,
});
