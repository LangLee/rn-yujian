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
import { RemoteImage } from '../components/RemoteImage';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { PressableScale } from '../components/ui/PressableScale';
import { EmptyState } from '../components/ui/EmptyState';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenHeader, HeaderIconButton } from '../components';
import { palette } from '../constants/colors';
import { font, fs, radius, spacing } from '../constants/tokens';
import {
  formatCaptureFull,
  formatCaptureStamp,
  formatLength,
  formatMediaDuration,
  formatWeight,
} from '../utils/formatters';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type CatchDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CatchDetail'>;

const GOLD = palette.accentGold;
const UNKNOWN = '未知鱼种';

/** 3 列记忆格宽：屏宽 - 页边距 - 卡片内边距 - 两列间隙（方格）。 */
const GRID_CELL_WIDTH =
  (Dimensions.get('window').width - spacing.page * 2 - 32 - spacing.sm * 2) / 3;

/** "42.6 cm" → { value: '42.6', unit: 'cm' }；空值显示 "—"。 */
const splitMeasure = (formatted: string | null): { value: string; unit: string } => {
  if (!formatted) {
    return { value: '—', unit: '' };
  }
  const gap = formatted.indexOf(' ');
  if (gap < 0) {
    return { value: formatted, unit: '' };
  }
  return { value: formatted.slice(0, gap), unit: formatted.slice(gap + 1) };
};

interface MemoryMediaItem {
  uri: string;
  authToken: string | null;
  kind: 'photo' | 'video';
  durationSec?: number;
}

/**
 * 鱼获详情 / 鱼获记忆（设计文档 08 + 千岛湖高保真稿）：
 * 照片 Hero + 上浮鱼名卡（金色短规线、三列长度/重量/地点、时间行）；
 * 关于这次鱼获（铅笔 + 麦克风）；鱼获记忆（计数行 + 胶囊 chips + 方格 Grid，视频格播放角标）。
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
        (initialMemory.lengthCm ??
          initialMemory.weightKg ??
          initialMemory.location ??
          initialMemory.latitude ??
          initialMemory.longitude)
      ) {
        data.lengthCm = data.lengthCm ?? initialMemory.lengthCm ?? null;
        data.weightKg = data.weightKg ?? initialMemory.weightKg ?? null;
        data.location = data.location ?? initialMemory.location ?? null;
        data.latitude = data.latitude ?? initialMemory.latitude ?? null;
        data.longitude = data.longitude ?? initialMemory.longitude ?? null;
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
    const items: MemoryMediaItem[] = [];
    const remoteUrl = catchService.resolveUrl(remoteCatch?.imageUrl);
    if (remoteUrl) {
      items.push({ uri: remoteUrl, authToken: session?.accessToken ?? null, kind: 'photo' });
    }
    (memory?.media ?? []).forEach((item) =>
      items.push({ uri: item.uri, authToken: null, kind: item.kind, durationSec: item.durationSec }),
    );
    return items;
  }, [remoteCatch, memory, session]);

  /** 图片选择器 / 相机返回的资产（仅取本页关心的字段）。 */
  const appendPickedAssets = (assets: { uri?: string | null; type?: string | null; duration?: number }[]) => {
    if (!memory || assets.length === 0) {
      return;
    }
    const picked = assets
      .map(
        (asset): { uri: string; kind: 'photo' | 'video'; durationSec?: number } | null => {
          const uri = toFileUri(asset.uri ?? null);
          if (!uri) {
            return null;
          }
          const kind: 'photo' | 'video' = asset.type?.startsWith('video/') ? 'video' : 'photo';
          const durationSec =
            typeof asset.duration === 'number' && asset.duration > 0
              ? Math.round(asset.duration)
              : undefined;
          return { uri, kind, durationSec };
        },
      )
      .filter(
        (entry): entry is { uri: string; kind: 'photo' | 'video'; durationSec?: number } =>
          entry !== null,
      );
    if (picked.length === 0) {
      return;
    }
    const additions: CatchMemoryMedia[] = picked.map((entry, order) => ({
      id: `m_${Date.now()}_${order}`,
      uri: entry.uri,
      kind: entry.kind,
      durationSec: entry.durationSec,
      addedAt: new Date().toISOString(),
    }));
    void persistMemory({ ...memory, media: [...memory.media, ...additions] });
  };

  const addMediaFromLibrary = () => {
    launchImageLibrary({ mediaType: 'mixed', quality: 0.9, selectionLimit: 9 }, (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.length) {
        return;
      }
      appendPickedAssets(response.assets);
    });
  };

  const addMediaFromCamera = () => {
    launchCamera({ mediaType: 'photo', quality: 0.9 }, (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.length) {
        return;
      }
      appendPickedAssets(response.assets);
    });
  };

  const addVideoFromCamera = () => {
    launchCamera({ mediaType: 'video', quality: 0.9 }, (response) => {
      if (response.didCancel || response.errorCode || !response.assets?.length) {
        return;
      }
      appendPickedAssets(response.assets);
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
            variant="memory"
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
  const displaySpeciesName = editing
    ? editDraft.speciesName || UNKNOWN
    : speciesOverride?.name || remoteCatch.speciesName || UNKNOWN;
  const displaySpeciesKey = speciesOverride?.key || remoteCatch.speciesId;
  const lengthParts = splitMeasure(formatLength(memory?.lengthCm ?? null, lengthUnit));
  const weightParts = splitMeasure(formatWeight(memory?.weightKg ?? null, weightUnit));
  const locationLabel = memory?.location?.trim() || null;
  const whenStamp = formatCaptureStamp(remoteCatch.capturedAt);
  const whenLabel = formatCaptureFull(remoteCatch.capturedAt);
  const photoCount = mediaList.filter((item) => item.kind !== 'video').length;
  const videoCount = mediaList.length - photoCount;
  const memorySummary = loadingMemory
    ? '正在打开…'
    : videoCount > 0
      ? `${photoCount} 张照片 · ${videoCount} 段视频`
      : `${photoCount} 张照片`;

  /** 卡内分隔线：跟随次要文字色淡化（浅/深环境都可见）。 */
  const separatorTint = { backgroundColor: textSecondary, opacity: 0.22 } as const;

  const renderGridCell = (item: MemoryMediaItem, index: number) => (
    <PressableScale
      key={`${item.uri}-${index}`}
      onPress={() => setViewer({ open: true, index })}
      scaleTo={0.97}
    >
      <View style={styles.gridCell} pointerEvents="none">
        {item.kind === 'video' ? (
          <View style={styles.videoCell}>
            {/* iOS 直接显示视频首帧；Android 无封面时保留深色底 + 播放角标 */}
            <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />
            <View style={styles.videoShade} />
            <View style={styles.videoPlayWrap}>
              <View style={styles.videoPlayCircle}>
                <Icon name="play" size={15} color="#FFFFFF" />
              </View>
            </View>
            {item.durationSec ? (
              <View style={styles.videoDurationBadge}>
                <Text style={styles.videoDurationText}>
                  {formatMediaDuration(item.durationSec)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />
        )}
      </View>
    </PressableScale>
  );

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      {/* 顶部导航：Back + 标题 + 鱼鉴 / 分享 */}
      <ScreenHeader
        title="鱼获详情"
        onBack={() => navigation.goBack()}
        right={
          <>
            {displaySpeciesKey && displaySpeciesKey !== 'unknown' ? (
              <HeaderIconButton
                name="book-outline"
                color={textPrimary}
                onPress={() => navigation.navigate('Species', { key: displaySpeciesKey })}
              />
            ) : null}
            <HeaderIconButton
              name="share-social-outline"
              color={textPrimary}
              onPress={() => navigation.navigate('ShareCreate', { presetCatchId: remoteCatch.id })}
            />
          </>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 照片 Hero（信息卡上浮叠在底缘）。后端 imageUrl 为相对路径且需 Bearer，
            与列表页一致走 RemoteImage（resolveUrl + 鉴权头），原生 Image 会加载失败 */}
        <PressableScale onPress={() => setViewer({ open: true, index: 0 })} scaleTo={0.99}>
          <View
            style={[
              styles.heroCard,
              { borderColor: profile.surface.glassBorder },
            ]}
          >
            {remoteCatch.imageUrl ? (
              <RemoteImage
                url={remoteCatch.imageUrl}
                authToken={session?.accessToken ?? null}
                style={styles.heroImage}
                resizeMode="cover"
                placeholder={
                  <View style={styles.heroPlaceholder}>
                    <Text style={[styles.heroPlaceholderText, { color: textSecondary }]}>
                      照片加载失败
                    </Text>
                  </View>
                }
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

        {/* 鱼名 + 数据卡（与照片卡片留出间距，不重叠，风格与下方面板一致） */}
        <View
          style={[
            styles.speciesCard,
            { backgroundColor: profile.surface.glassStrong, borderColor: profile.surface.glassBorder },
          ]}
        >
          <View style={styles.speciesHead}>
            <Text style={[styles.speciesName, { color: textPrimary }]} numberOfLines={1}>
              {displaySpeciesName}
            </Text>
            {!editing ? (
              <PressableScale onPress={startEdit} scaleTo={0.88} style={styles.speciesEditHit}>
                <Icon name="pencil" size={15} color={GOLD} />
              </PressableScale>
            ) : null}
          </View>
          <View style={styles.goldRule} />

          {editing ? (
            <View style={styles.editForm}>
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
                <View style={[styles.measureDivider, separatorTint]} />
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
              {/* 三列数据：长度 / 重量 / 地点（竖线分隔，数值在上、标签在下） */}
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <View style={styles.statValueRow}>
                    <Icon name="resize-outline" size={15} color={GOLD} style={styles.statIcon} />
                    <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {lengthParts.value}
                    </Text>
                    {lengthParts.unit ? (
                      <Text style={[styles.statUnit, { color: textSecondary }]}>{lengthParts.unit}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.statLabel, { color: textSecondary }]}>长度</Text>
                </View>
                <View style={[styles.statDivider, separatorTint]} />
                <View style={styles.statCell}>
                  <View style={styles.statValueRow}>
                    <Icon name="scale-outline" size={15} color={GOLD} style={styles.statIcon} />
                    <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {weightParts.value}
                    </Text>
                    {weightParts.unit ? (
                      <Text style={[styles.statUnit, { color: textSecondary }]}>{weightParts.unit}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.statLabel, { color: textSecondary }]}>重量</Text>
                </View>
                <View style={[styles.statDivider, separatorTint]} />
                <View style={styles.statCell}>
                  <View style={styles.statValueRow}>
                    <Icon name="location-outline" size={15} color={GOLD} style={styles.statIcon} />
                    <Text
                      style={[styles.statTextValue, { color: textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {locationLabel ?? '—'}
                    </Text>
                  </View>
                  <Text style={[styles.statLabel, { color: textSecondary }]}>地点</Text>
                </View>
              </View>
              {/* 时间行 */}
              <View style={[styles.statRule, separatorTint]} />
              <View style={styles.timeRow}>
                <View style={styles.statValueRow}>
                  <Icon name="time-outline" size={16} color={GOLD} style={styles.statIcon} />
                  <Text style={[styles.timeValue, { color: textPrimary }]} numberOfLines={1}>
                    {whenStamp || '—'}
                  </Text>
                </View>
                <Text style={[styles.statLabel, { color: textSecondary }]}>时间</Text>
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
          <Text style={[styles.memoryCount, { color: textSecondary }]}>{memorySummary}</Text>
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
            <PressableScale onPress={addVideoFromCamera} scaleTo={0.96}>
              <View style={[styles.memoryChip, { borderColor: profile.surface.glassBorder }]}>
                <Icon name="videocam-outline" size={15} color={textSecondary} />
                <Text style={[styles.memoryChipText, { color: textPrimary }]}>录制视频</Text>
              </View>
            </PressableScale>
          </View>
          {!loadingMemory && mediaList.length > 0 ? (
            <View style={styles.grid}>{mediaList.map(renderGridCell)}</View>
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
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  heroCard: {
    borderRadius: radius.l + 2,
    borderWidth: 1,
    overflow: 'hidden',
    opacity: 0.9,
    backgroundColor: palette.softWater,
  } as ViewStyle,
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 10,
  } as ImageStyle,
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  heroPlaceholderText: {
    fontSize: fs(13),
  } as TextStyle,
  // ---------------------------------------------------------------------
  // 鱼名 + 数据卡（与照片卡片间隔排列，不重叠）
  // ---------------------------------------------------------------------
  speciesCard: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg + 2,
    borderRadius: radius.l + 2,
    borderWidth: 1,
    opacity: 0.9,
  } as ViewStyle,
  speciesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  } as ViewStyle,
  speciesName: {
    flexShrink: 1,
    fontFamily: font.serif,
    fontSize: fs(23),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  speciesEditHit: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  } as ViewStyle,
  goldRule: {
    width: 56,
    height: 2,
    borderRadius: 1,
    marginTop: spacing.sm + 2,
    backgroundColor: GOLD,
  } as ViewStyle,
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.lg + 2,
  } as ViewStyle,
  statCell: {
    flex: 1,
  } as ViewStyle,
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  } as ViewStyle,
  statIcon: {
    marginBottom: 4,
  } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: fs(22),
    fontWeight: '600',
    lineHeight: 27,
  } as TextStyle,
  statTextValue: {
    flexShrink: 1,
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '600',
    paddingBottom: 3,
    lineHeight: 21,
  } as TextStyle,
  statUnit: {
    fontSize: fs(12),
    paddingBottom: 3,
  } as TextStyle,
  statLabel: {
    fontSize: fs(12),
    letterSpacing: 2,
    marginTop: 6,
  } as TextStyle,
  statDivider: {
    width: 1,
    marginHorizontal: spacing.md,
  } as ViewStyle,
  statRule: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg + 2,
  } as ViewStyle,
  timeRow: {
    marginTop: spacing.md,
  } as ViewStyle,
  timeValue: {
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '600',
    letterSpacing: 1,
    paddingBottom: 1,
    lineHeight: 21,
  } as TextStyle,
  // ---------------------------------------------------------------------
  // 原位编辑表单
  // ---------------------------------------------------------------------
  editForm: {
    marginTop: spacing.md,
  } as ViewStyle,
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
  } as ViewStyle,
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  infoLabel: {
    fontSize: fs(13),
    width: 62,
  } as TextStyle,
  infoValueSerif: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '600',
    letterSpacing: 1,
    flex: 1,
    textAlign: 'right',
  } as TextStyle,
  infoValue: {
    fontSize: fs(14),
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  } as TextStyle,
  inlineInput: {
    flex: 1,
    fontSize: fs(15),
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
  measureInput: {
    fontFamily: font.serif,
    fontSize: fs(22),
    fontWeight: '600',
    paddingVertical: 0,
    minWidth: 60,
  } as TextStyle,
  measureUnit: {
    fontSize: fs(13),
    paddingBottom: 3,
  } as TextStyle,
  measureDivider: {
    width: 1,
    marginHorizontal: spacing.lg,
  } as ViewStyle,
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  } as ViewStyle,
  editAction: {
    flex: 1,
  } as ViewStyle,
  // ---------------------------------------------------------------------
  // 关于这次鱼获 / 鱼获记忆
  // ---------------------------------------------------------------------
  panel: {
    borderRadius: radius.l + 2,
    borderWidth: 1,
    opacity: 0.9,
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
    fontSize: fs(18),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  storyText: {
    fontSize: fs(15),
    lineHeight: 24,
  } as TextStyle,
  storyPlaceholder: {
    color: palette.mutedInk,
  } as TextStyle,
  storyInput: {
    fontSize: fs(15),
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
  } as TextStyle,
  voiceHint: {
    fontSize: fs(12),
    marginTop: 6,
  } as TextStyle,
  memoryCount: {
    fontSize: fs(12),
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
    fontSize: fs(13),
  } as TextStyle,
  memoryEmpty: {
    fontSize: fs(13),
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
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  gridImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  videoCell: {
    flex: 1,
    backgroundColor: '#17303A',
  } as ViewStyle,
  videoShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,26,32,0.34)',
  } as ViewStyle,
  videoPlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  videoPlayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
  } as ViewStyle,
  videoDurationBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(9,26,32,0.62)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  } as ViewStyle,
  videoDurationText: {
    color: '#FFFFFF',
    fontSize: fs(10),
    fontWeight: '600',
    letterSpacing: 0.5,
  } as TextStyle,
});
