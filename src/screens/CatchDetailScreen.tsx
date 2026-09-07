import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ImageStyle,
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
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { StackNavigationProp, CatchDetailRouteProp, RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { RemoteCatch } from '../types/models';
import { catchMemoryService, CatchMemoryData, CatchMemoryMedia } from '../services/catchMemoryService';
import { catchService } from '../services/catchService';
import { demoCatch } from '../constants/demoData';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/ui/EmptyState';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import { formatCaptureFull, formatLength, formatWeight } from '../utils/formatters';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type CatchDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CatchDetail'>;

const GOLD = '#C9A96A';
const INK = '#1F4A56';
const UNKNOWN = '未知鱼种';

/** 3 列媒体格宽：屏宽 - 页边距 - 卡片内边距 - 两列间隙（8.4：3 列、约 3:4 竖向格）。 */
const GRID_CELL_WIDTH =
  (Dimensions.get('window').width - spacing.page * 2 - 32 - spacing.sm * 2) / 3;

/**
 * 鱼获详情 / 鱼获记忆（设计文档 08 + 高保真参考稿）：
 * 基础信息面板（展示/原位编辑一体：鱼种行、两列长度重量、地点、日期时间，金图标）；
 * 关于这次鱼获（标题行右侧铅笔 + 麦克风）；鱼获记忆（计数行 + 胶囊操作 chips + 3 列 Grid）。
 */
export const CatchDetailScreen: React.FC = () => {
  const navigation = useNavigation<CatchDetailScreenNavigationProp>();
  const route = useRoute<CatchDetailRouteProp>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const { catches } = useCatchArchive();
  const { lengthUnit, weightUnit } = usePreferences();
  const insets = useSafeAreaInsets();

  const catchId = route.params?.catchId ?? '';
  const initialCatch = route.params?.initialCatch;
  const initialMemory = route.params?.initialMemory;

  const remoteCatch: RemoteCatch | null = useMemo(() => {
    const fromList = catches.find((item) => item.id === catchId);
    if (fromList) {
      return fromList;
    }
    if (initialCatch && initialCatch.id === catchId) {
      return initialCatch;
    }
    if (!catchId) {
      return {
        id: demoCatch.id,
        imageUrl: '',
        speciesId: demoCatch.speciesKey,
        speciesName: demoCatch.speciesName,
        confidence: demoCatch.confidence / 100,
        modelVersion: '',
        capturedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  }, [catchId, catches, initialCatch]);

  const [memory, setMemory] = useState<CatchMemoryData | null>(null);
  const [loadingMemory, setLoadingMemory] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingMemory(true);
    (async () => {
      const data = await catchMemoryService.load(catchId);
      if (!mounted) {
        return;
      }
      if (
        initialMemory &&
        (initialMemory.lengthCm ?? initialMemory.weightKg ?? initialMemory.location)
      ) {
        data.lengthCm = data.lengthCm ?? initialMemory.lengthCm ?? null;
        data.weightKg = data.weightKg ?? initialMemory.weightKg ?? null;
        data.location = data.location ?? initialMemory.location ?? null;
        await catchMemoryService.save(catchId, data);
      }
      setMemory(data);
      setLoadingMemory(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchId]);

  const persistMemory = useCallback(
    async (next: CatchMemoryData) => {
      setMemory(next);
      await catchMemoryService.save(catchId, next);
    },
    [catchId],
  );

  // 原位编辑态（8.2：在原卡内进入 edit state，不新开表单页）
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({
    speciesKey: '',
    speciesName: '',
    lengthCm: '',
    weightKg: '',
    location: '',
  });
  const [speciesOverride, setSpeciesOverride] = useState<{ key: string; name: string } | null>(
    null,
  );
  const [pickingSpecies, setPickingSpecies] = useState(false);

  const startEdit = () => {
    if (!remoteCatch || !memory) {
      return;
    }
    setEditDraft({
      speciesKey: remoteCatch.speciesId,
      speciesName: remoteCatch.speciesName,
      lengthCm: memory.lengthCm != null ? String(memory.lengthCm) : '',
      weightKg: memory.weightKg != null ? String(memory.weightKg) : '',
      location: memory.location ?? '',
    });
    setEditing(true);
    haptics.selection();
  };

  const pickSpeciesForEdit = useCallback(async () => {
    if (pickingSpecies) {
      return;
    }
    setPickingSpecies(true);
    navigation.navigate('SpeciesPicker', { title: '修改鱼种' });
    const picked = await speciesPickerHub.requestPick();
    setPickingSpecies(false);
    if (picked) {
      setEditDraft((draft) => ({ ...draft, speciesKey: picked.key, speciesName: picked.name }));
      haptics.selection();
    }
  }, [navigation, pickingSpecies]);

  const saveEdit = async () => {
    if (!remoteCatch || !memory) {
      return;
    }
    const lengthCm = Number(editDraft.lengthCm) > 0 ? Number(editDraft.lengthCm) : null;
    const weightKg = Number(editDraft.weightKg) > 0 ? Number(editDraft.weightKg) : null;
    const location = editDraft.location.trim() || null;
    await persistMemory({ ...memory, lengthCm, weightKg, location });
    if (
      editDraft.speciesKey &&
      editDraft.speciesKey !== 'unknown' &&
      editDraft.speciesKey !== remoteCatch.speciesId
    ) {
      setSpeciesOverride({ key: editDraft.speciesKey, name: editDraft.speciesName });
    }
    setEditing(false);
    haptics.confirm();
  };

  // 关于这次鱼获（8.3）
  const [storyEditing, setStoryEditing] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [voiceHint, setVoiceHint] = useState(false);

  const startStoryEdit = () => {
    setStoryDraft(memory?.story ?? '');
    setStoryEditing(true);
    setVoiceHint(false);
  };

  const saveStory = async () => {
    if (memory) {
      await persistMemory({ ...memory, story: storyDraft.trim() });
    }
    setStoryEditing(false);
    setVoiceHint(false);
  };

  // 鱼获记忆媒体（8.4）
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  const mediaList = useMemo(() => {
    const items: { uri: string; authToken: string | null }[] = [];
    const remoteUrl = catchService.resolveUrl(remoteCatch?.imageUrl);
    if (remoteUrl) {
      items.push({ uri: remoteUrl, authToken: session?.accessToken ?? null });
    }
    (memory?.media ?? []).forEach((item) => items.push({ uri: item.uri, authToken: null }));
    return items;
  }, [remoteCatch, memory, session]);

  const addMediaFromLibrary = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.9, selectionLimit: 9 }, (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.length || !memory) {
        return;
      }
      const additions: CatchMemoryMedia[] = response.assets
        .map((asset, index) => ({ index, uri: toFileUri(asset.uri ?? null) }))
        .filter((entry): entry is { index: number; uri: string } => Boolean(entry.uri))
        .map((entry, order) => ({
          id: `m_${Date.now()}_${order}`,
          uri: entry.uri,
          kind: 'photo' as const,
          addedAt: new Date().toISOString(),
        }));
      if (additions.length === 0) {
        return;
      }
      void persistMemory({ ...memory, media: [...memory.media, ...additions] });
    });
  };

  const addMediaFromCamera = () => {
    launchCamera({ mediaType: 'photo', quality: 0.9 }, (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.[0]?.uri || !memory) {
        return;
      }
      const additionUri = toFileUri(response.assets[0].uri ?? null);
      if (!additionUri) {
        return;
      }
      const addition: CatchMemoryMedia = {
        id: `m_${Date.now()}`,
        uri: additionUri,
        kind: 'photo',
        addedAt: new Date().toISOString(),
      };
      void persistMemory({ ...memory, media: [...memory.media, addition] });
    });
  };

  const removeMedia = (index: number) => {
    if (!memory) {
      return;
    }
    const memoryIndex = index - (remoteCatch?.imageUrl ? 1 : 0);
    if (memoryIndex < 0) {
      return;
    }
    const next = memory.media.filter((_, i) => i !== memoryIndex);
    void persistMemory({ ...memory, media: next });
  };

  if (!remoteCatch) {
    return (
      <View style={styles.screen}>
        <WaterBackdrop />
        <View style={[styles.wrap, { paddingTop: insets.top + spacing.xl }]}>
          <EmptyState
            title="没有找到这条鱼获"
            description="它可能已经不在你的收藏里了"
            actionLabel="回到我的渔获"
            onAction={() => navigation.navigate('MyCatches')}
          />
        </View>
      </View>
    );
  }

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const displaySpeciesName = speciesOverride?.name || remoteCatch.speciesName || UNKNOWN;
  const displaySpeciesKey = speciesOverride?.key || remoteCatch.speciesId;
  const lengthLabel = formatLength(memory?.lengthCm ?? null, lengthUnit);
  const weightLabel = formatWeight(memory?.weightKg ?? null, weightUnit);
  const locationLabel = memory?.location?.trim() || null;
  const whenLabel = formatCaptureFull(remoteCatch.capturedAt);
  const photoCount = mediaList.length;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      {/* 顶部导航：Back + 标题 + 鱼鉴 / 分享 */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.92} style={styles.edgeHit}>
          <Icon name="chevron-back" size={24} color={textPrimary} />
        </PressableScale>
        <Text style={[styles.topTitle, { color: textPrimary }]}>鱼获详情</Text>
        <View style={styles.topActions}>
          {displaySpeciesKey && displaySpeciesKey !== 'unknown' ? (
            <PressableScale
              onPress={() => navigation.navigate('Species', { key: displaySpeciesKey })}
              scaleTo={0.92}
              style={styles.edgeHit}
            >
              <Icon name="book-outline" size={21} color={textPrimary} />
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => navigation.navigate('ShareCreate', { presetCatchId: remoteCatch.id })}
            scaleTo={0.92}
            style={styles.edgeHit}
          >
            <Icon name="share-social-outline" size={21} color={textPrimary} />
          </PressableScale>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 照片 Hero */}
        <PressableScale onPress={() => setViewer({ open: true, index: 0 })} scaleTo={0.99}>
          <View style={[styles.heroCard, { borderColor: profile.surface.glassBorder }]}>
            {remoteCatch.imageUrl ? (
              <Image
                source={{ uri: remoteCatch.imageUrl }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <Text style={[styles.heroPlaceholderText, { color: textSecondary }]}>
                  这条鱼获还没有照片
                </Text>
              </View>
            )}
          </View>
        </PressableScale>

        {/* 基础信息面板（展示 / 原位编辑一体） */}
        <View
          style={[
            styles.panel,
            { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
          ]}
        >
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: textPrimary }]}>基础信息</Text>
            {!editing ? (
              <PressableScale onPress={startEdit} scaleTo={0.92}>
                <Icon name="create-outline" size={19} color={textSecondary} />
              </PressableScale>
            ) : null}
          </View>

          {editing ? (
            <View>
              {/* 鱼种 */}
              <PressableScale onPress={pickSpeciesForEdit} scaleTo={0.99}>
                <View style={[styles.infoRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]} pointerEvents="none">
                  <Icon name="fish-outline" size={16} color={GOLD} />
                  <Text style={[styles.infoLabel, { color: textSecondary }]}>鱼种</Text>
                  <Text style={[styles.infoValueSerif, { color: textPrimary }]} numberOfLines={1}>
                    {editDraft.speciesName || '选择鱼种'}
                  </Text>
                  <Icon name="chevron-forward" size={15} color={textSecondary} />
                </View>
              </PressableScale>
              {/* 长度 / 重量 两列 */}
              <View style={[styles.measureRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]}>
                <View style={styles.measureCell}>
                  <View style={styles.measureLabelRow}>
                    <Icon name="resize-outline" size={14} color={GOLD} />
                    <Text style={[styles.infoLabel, { color: textSecondary }]}>长度</Text>
                  </View>
                  <View style={styles.measureValueRow}>
                    <TextInput
                      style={[styles.measureInput, { color: textPrimary }]}
                      value={editDraft.lengthCm}
                      onChangeText={(value) => setEditDraft((d) => ({ ...d, lengthCm: value }))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={textSecondary}
                    />
                    <Text style={[styles.measureUnit, { color: textSecondary }]}>cm</Text>
                  </View>
                </View>
                <View style={[styles.measureDivider, { backgroundColor: profile.surface.glassBorder }]} />
                <View style={styles.measureCell}>
                  <View style={styles.measureLabelRow}>
                    <Icon name="scale-outline" size={14} color={GOLD} />
                    <Text style={[styles.infoLabel, { color: textSecondary }]}>重量</Text>
                  </View>
                  <View style={styles.measureValueRow}>
                    <TextInput
                      style={[styles.measureInput, { color: textPrimary }]}
                      value={editDraft.weightKg}
                      onChangeText={(value) => setEditDraft((d) => ({ ...d, weightKg: value }))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={textSecondary}
                    />
                    <Text style={[styles.measureUnit, { color: textSecondary }]}>kg</Text>
                  </View>
                </View>
              </View>
              {/* 地点 */}
              <View style={[styles.infoRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="location-outline" size={16} color={GOLD} />
                <Text style={[styles.infoLabel, { color: textSecondary }]}>地点</Text>
                <TextInput
                  style={[styles.inlineInput, { color: textPrimary }]}
                  value={editDraft.location}
                  onChangeText={(value) => setEditDraft((d) => ({ ...d, location: value }))}
                  placeholder="可空"
                  placeholderTextColor={textSecondary}
                  maxLength={30}
                />
              </View>
              {/* 日期时间 */}
              <View style={[styles.infoRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="time-outline" size={16} color={GOLD} />
                <Text style={[styles.infoLabel, { color: textSecondary }]}>日期时间</Text>
                <Text style={[styles.infoValue, { color: textPrimary }]}>{whenLabel}</Text>
              </View>
              {/* 取消 / 保存（保存为深青实底，参考稿） */}
              <View style={styles.editActions}>
                <PrimaryButton label="取消" variant="ghost" onPress={() => setEditing(false)} style={styles.editAction} />
                <PrimaryButton label="保存" onPress={saveEdit} variant="primary" style={styles.editAction} />
              </View>
            </View>
          ) : (
            <View>
              <PressableScale onPress={startEdit} scaleTo={0.99}>
                <View style={[styles.infoRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]} pointerEvents="none">
                  <Icon name="fish-outline" size={16} color={GOLD} />
                  <Text style={[styles.infoLabel, { color: textSecondary }]}>鱼种</Text>
                  <Text style={[styles.infoValueSerif, { color: textPrimary }]} numberOfLines={1}>
                    {displaySpeciesName}
                  </Text>
                  <Icon name="chevron-forward" size={15} color={textSecondary} />
                </View>
              </PressableScale>
              <View style={[styles.measureRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]}>
                <View style={styles.measureCell}>
                  <View style={styles.measureLabelRow}>
                    <Icon name="resize-outline" size={14} color={GOLD} />
                    <Text style={[styles.infoLabel, { color: textSecondary }]}>长度</Text>
                  </View>
                  <Text style={[styles.measureValue, { color: textPrimary }]}>
                    {lengthLabel ?? '—'}
                  </Text>
                </View>
                <View style={[styles.measureDivider, { backgroundColor: profile.surface.glassBorder }]} />
                <View style={styles.measureCell}>
                  <View style={styles.measureLabelRow}>
                    <Icon name="scale-outline" size={14} color={GOLD} />
                    <Text style={[styles.infoLabel, { color: textSecondary }]}>重量</Text>
                  </View>
                  <Text style={[styles.measureValue, { color: textPrimary }]}>
                    {weightLabel ?? '—'}
                  </Text>
                </View>
              </View>
              <PressableScale onPress={startEdit} scaleTo={0.99}>
                <View style={[styles.infoRow, styles.rowBorder, { borderColor: profile.surface.glassBorder }]} pointerEvents="none">
                  <Icon name="location-outline" size={16} color={GOLD} />
                  <Text style={[styles.infoLabel, { color: textSecondary }]}>地点</Text>
                  <Text style={[styles.infoValueSerif, { color: textPrimary }]} numberOfLines={1}>
                    {locationLabel ?? '未记录'}
                  </Text>
                  <Icon name="chevron-forward" size={15} color={textSecondary} />
                </View>
              </PressableScale>
              <View style={[styles.infoRow, styles.rowBorderLast, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="time-outline" size={16} color={GOLD} />
                <Text style={[styles.infoLabel, { color: textSecondary }]}>日期时间</Text>
                <Text style={[styles.infoValue, { color: textPrimary }] } numberOfLines={1}>
                  {whenLabel}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* 关于这次鱼获 */}
        <View
          style={[
            styles.panel,
            { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
          ]}
        >
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: textPrimary }]}>关于这次鱼获</Text>
            {!storyEditing ? (
              <View style={styles.panelHeadActions}>
                <PressableScale onPress={startStoryEdit} scaleTo={0.92} style={styles.headIconHit}>
                  <Icon name="pencil-outline" size={18} color={textSecondary} />
                </PressableScale>
                <PressableScale onPress={() => setVoiceHint(true)} scaleTo={0.92} style={styles.headIconHit}>
                  <Icon name="mic-outline" size={18} color={textSecondary} />
                </PressableScale>
              </View>
            ) : null}
          </View>
          {storyEditing ? (
            <View>
              <TextInput
                style={[styles.storyInput, { color: textPrimary }]}
                value={storyDraft}
                onChangeText={setStoryDraft}
                placeholder="写下这次鱼获的故事……"
                placeholderTextColor={textSecondary}
                multiline
                autoFocus
                maxLength={2000}
              />
              {voiceHint ? (
                <Text style={[styles.voiceHint, { color: textSecondary }]}>
                  语音转文字马上就来，先写下文字吧
                </Text>
              ) : null}
              <View style={styles.editActions}>
                <PrimaryButton
                  label="取消"
                  variant="ghost"
                  onPress={() => setStoryEditing(false)}
                  style={styles.editAction}
                />
                <PrimaryButton label="保存" onPress={saveStory} style={styles.editAction} />
              </View>
            </View>
          ) : (
            <View>
              <Text
                style={[
                  styles.storyText,
                  { color: textPrimary },
                  !memory?.story && styles.storyPlaceholder,
                ]}
              >
                {memory?.story
                  ? memory.story
                  : '写下这次鱼获的故事……\n当时的水情、那一下口、你在想什么。'}
              </Text>
              {voiceHint ? (
                <Text style={[styles.voiceHint, { color: textSecondary }]}>
                  语音转文字马上就来，先写下文字吧
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* 鱼获记忆 */}
        <View
          style={[
            styles.panel,
            { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
          ]}
        >
          <Text style={[styles.panelTitle, { color: textPrimary }]}>鱼获记忆</Text>
          <Text style={[styles.memoryCount, { color: textSecondary }]}>
            {loadingMemory ? '正在打开…' : `${photoCount} 张照片`}
          </Text>
          {/* 胶囊操作 chips */}
          <View style={styles.memoryChips}>
            <PressableScale onPress={addMediaFromLibrary} scaleTo={0.96}>
              <View style={[styles.memoryChip, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="add-circle-outline" size={15} color={textSecondary} />
                <Text style={[styles.memoryChipText, { color: textPrimary }]}>添加照片 / 视频</Text>
              </View>
            </PressableScale>
            <PressableScale onPress={addMediaFromCamera} scaleTo={0.96}>
              <View style={[styles.memoryChip, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="camera-outline" size={15} color={textSecondary} />
                <Text style={[styles.memoryChipText, { color: textPrimary }]}>继续拍照</Text>
              </View>
            </PressableScale>
          </View>
          {!loadingMemory && photoCount > 0 ? (
            <View style={styles.grid}>
              {mediaList.map((item, index) => (
                <PressableScale
                  key={`${item.uri}-${index}`}
                  onPress={() => setViewer({ open: true, index })}
                  scaleTo={0.97}
                >
                  <View style={styles.gridCell} pointerEvents="none">
                    <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />
                  </View>
                </PressableScale>
              ))}
            </View>
          ) : !loadingMemory ? (
            <Text style={[styles.memoryEmpty, { color: textSecondary }]}>
              还可以继续留下这次鱼获的更多记忆
            </Text>
          ) : (
            <View style={styles.memoryLoading}>
              <ActivityIndicator color={profile.surface.accent} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* 沉浸式媒体查看器 */}
      <MediaViewerModal
        visible={viewer.open}
        media={mediaList}
        initialIndex={viewer.index}
        onClose={() => setViewer({ open: false, index: 0 })}
        onRemove={removeMedia}
      />
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
  wrap: {
    flex: 1,
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  } as ViewStyle,
  edgeHit: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  } as ViewStyle,
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.serif,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 5,
  } as TextStyle,
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  heroCard: {
    borderRadius: radius.l,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  heroImage: {
    width: '100%',
    aspectRatio: 3 / 2,
  } as ImageStyle,
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  heroPlaceholderText: {
    fontSize: 13,
  } as TextStyle,
  panel: {
    borderRadius: radius.l + 2,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.lg,
  } as ViewStyle,
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  } as ViewStyle,
  panelHeadActions: {
    flexDirection: 'row',
    gap: spacing.md,
  } as ViewStyle,
  headIconHit: {
    padding: 2,
  } as ViewStyle,
  panelTitle: {
    fontFamily: font.serif,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  rowBorderLast: {
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  infoLabel: {
    fontSize: 13,
    width: 62,
  } as TextStyle,
  infoValueSerif: {
    fontFamily: font.serif,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 1,
    flex: 1,
    textAlign: 'right',
  } as TextStyle,
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  } as TextStyle,
  inlineInput: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    paddingVertical: 0,
  } as TextStyle,
  measureRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  } as ViewStyle,
  measureCell: {
    flex: 1,
    paddingLeft: 2,
  } as ViewStyle,
  measureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  measureValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 6,
  } as ViewStyle,
  measureValue: {
    fontFamily: font.serif,
    fontSize: 22,
    fontWeight: '600',
    marginTop: 6,
  } as TextStyle,
  measureInput: {
    fontFamily: font.serif,
    fontSize: 22,
    fontWeight: '600',
    paddingVertical: 0,
    minWidth: 60,
  } as TextStyle,
  measureUnit: {
    fontSize: 13,
    paddingBottom: 3,
  } as TextStyle,
  measureDivider: {
    width: 1,
    marginHorizontal: spacing.lg,
    opacity: 0.7,
  } as ViewStyle,
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  } as ViewStyle,
  editAction: {
    flex: 1,
  } as ViewStyle,
  storyText: {
    fontSize: 15,
    lineHeight: 24,
  } as TextStyle,
  storyPlaceholder: {
    color: palette.mutedInk,
  } as TextStyle,
  storyInput: {
    fontSize: 15,
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
  } as TextStyle,
  voiceHint: {
    fontSize: 12,
    marginTop: 6,
  } as TextStyle,
  memoryCount: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.md,
  } as TextStyle,
  memoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  } as ViewStyle,
  memoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  } as ViewStyle,
  memoryChipText: {
    fontSize: 13,
  } as TextStyle,
  memoryEmpty: {
    fontSize: 13,
    lineHeight: 20,
  } as TextStyle,
  memoryLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  } as ViewStyle,
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  } as ViewStyle,
  gridCell: {
    width: GRID_CELL_WIDTH,
    aspectRatio: 3 / 4,
    borderRadius: radius.s,
    overflow: 'hidden',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  gridImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
});
