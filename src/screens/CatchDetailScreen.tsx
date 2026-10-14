import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppIcon } from '../components/icons/AppIcon';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  StackNavigationProp,
  CatchDetailRouteProp,
  RootStackParamList,
} from '../navigation/types';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { BsideStatusWire, RemoteCatch } from '../types/models';
import {
  catchMemoryService,
  CatchMemoryData,
  CatchMemoryMedia,
} from '../services/catchMemoryService';
import { catchService } from '../services/catchService';
import { demoCatch } from '../constants/demoData';
import { MorningLakeScene } from '../components/coreui';
import { ScreenHeader, HeaderIconButton } from '../components/ScreenHeader';
import {
  coreColors,
  coreGlass,
  coreRadius,
  HERO_CARD_RADIUS,
  PAGE_MARGIN,
} from '../constants/coreUi';
import { RemoteImage } from '../components/RemoteImage';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { PressableScale } from '../components/ui/PressableScale';
import { MemoryFrameGlyph } from '../components/ui/MemoryFrameGlyph';
import { EmptyState } from '../components/ui/EmptyState';
import { font, fs, motion, spacing } from '../constants/tokens';
import { formatLength, formatMediaDuration, formatWeight } from '../utils/formatters';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';
import { locationPickerHub } from '../utils/locationPickerHub';
import { Alert } from '../utils/alert';

type CatchDetailScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CatchDetail'
>;

const UNKNOWN = '未知鱼种';

/** 记忆卡内边距（冻结稿 ~44px@941） */
const CARD_PAD = 18;
/** 玻璃面板描边宽（styles.panel borderWidth），方格宽度需一并扣除，否则第三列会被挤换行 */
const PANEL_BORDER = 1;
/** 3 列方格宽：屏宽 - 页边距 - 卡片内边距 - 卡片描边 - 两列间隙 */
const GRID_CELL_WIDTH = Math.floor(
  (Dimensions.get('window').width -
    PAGE_MARGIN * 2 -
    CARD_PAD * 2 -
    PANEL_BORDER * 2 -
    spacing.sm * 2) /
    3,
);
/** Hero 宽高比（冻结稿 ~830×580） */
const HERO_ASPECT = 1.42;

interface MemoryMediaItem {
  uri: string;
  authToken: string | null;
  kind: 'photo' | 'video';
  durationSec?: number;
}

/** 编辑工作台草稿（编辑规范 V1：一次会话、分组字段、一次保存） */
interface EditDraft {
  speciesKey: string;
  speciesName: string;
  lengthCm: string;
  weightKg: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  story: string;
}

const parsePositiveNumber = (raw: string): number | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * 鱼获详情（FishRecordDetail V2 · 冻结稿还原）：
 * - A 面 · 鱼获记录（默认面）：真实照片 Hero，底部叠字 —— 鱼名 / 长度 · 重量 · 地点 / 低权重「编辑 >」
 * - B 面 · 鱼获记忆：生成鱼体资产换 Hero 画面，页内 Flip 仅 READY 可见；首次 READY 自动揭示一次
 * - 关于这次鱼获（铅笔进入整合编辑）；鱼获记忆（计数 + 空态 + 三操作 + 方格 Grid + 生成模块）
 */
export const CatchDetailScreen: React.FC = () => {
  const navigation = useNavigation<CatchDetailScreenNavigationProp>();
  const route = useRoute<CatchDetailRouteProp>();
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
          initialMemory.longitude ??
          initialMemory.story)
      ) {
        data.lengthCm = data.lengthCm ?? initialMemory.lengthCm ?? null;
        data.weightKg = data.weightKg ?? initialMemory.weightKg ?? null;
        data.location = data.location ?? initialMemory.location ?? null;
        data.latitude = data.latitude ?? initialMemory.latitude ?? null;
        data.longitude = data.longitude ?? initialMemory.longitude ?? null;
        data.story = data.story || initialMemory.story || '';
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
    [catchId]
  );

  // -----------------------------------------------------------------------
  // B 面（鱼获记忆）生命周期：NOT_GENERATED → GENERATING → READY / FAILED
  // -----------------------------------------------------------------------
  const [bside, setBside] = useState<{ status: BsideStatusWire; uri: string | null }>({
    status: remoteCatch?.bsideStatus ?? 'NONE',
    uri: remoteCatch?.bsideUri ?? null,
  });
  const [bsideBroken, setBsideBroken] = useState(false);

  // 列表数据刷新（如重新进入页面）时同步服务端状态
  useEffect(() => {
    setBside({
      status: remoteCatch?.bsideStatus ?? 'NONE',
      uri: remoteCatch?.bsideUri ?? null,
    });
    setBsideBroken(false);
  }, [remoteCatch?.id, remoteCatch?.bsideStatus, remoteCatch?.bsideUri]);

  const bsideReady =
    bside.status === 'READY' && Boolean(bside.uri) && !bsideBroken;

  const startGeneration = useCallback(async () => {
    if (!catchId || !session || bside.status === 'GENERATING') {
      return;
    }
    setBsideBroken(false);
    setBside({ status: 'GENERATING', uri: null });
    haptics.selection();
    try {
      const gen = await catchService.createBsideJob(catchId);
      setBside({ status: gen.status, uri: gen.resultUri ?? null });
    } catch {
      // 失败文案不暴露内部细节（生成规范 §5）
      setBside({ status: 'FAILED', uri: null });
    }
  }, [bside.status, catchId, session]);

  // GENERATING 期间轮询；页面退出即停
  useEffect(() => {
    if (bside.status !== 'GENERATING' || !catchId || !session) {
      return;
    }
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const gen = await catchService.bsideStatus(catchId);
        if (alive) {
          setBside({ status: gen.status, uri: gen.resultUri ?? null });
        }
      } catch {
        // 网络抖动保持 GENERATING，下一轮再查
      }
    }, 6000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [bside.status, catchId, session]);

  // -----------------------------------------------------------------------
  // A / B 翻面：Reduce Motion 时退化为交叉淡化（语义不变）
  // -----------------------------------------------------------------------
  const [side, setSide] = useState<'A' | 'B'>('A');
  const sideRef = useRef<'A' | 'B'>('A');
  const flipValue = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const revealGuard = useRef(false);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const flipTo = useCallback(
    (next: 'A' | 'B', onSettled?: () => void) => {
      sideRef.current = next;
      setSide(next);
      const animation = Animated.timing(flipValue, {
        toValue: next === 'B' ? 1 : 0,
        duration: reduceMotion ? motion.fast : 520,
        easing: reduceMotion ? undefined : Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
      animation.start(({ finished }) => {
        if (finished) {
          onSettled?.();
        }
      });
    },
    [flipValue, reduceMotion]
  );

  /** B 面资产失效：隐藏 Flip、回到 A 面，不暴露损坏的 B 面（Overview §6）。 */
  const handleBsideLoadError = useCallback(() => {
    setBsideBroken(true);
    if (sideRef.current === 'B') {
      flipTo('A');
    }
  }, [flipTo]);

  // 首次 READY 自动揭示：每条记录至多一次，A 面稳定后执行，B 面真正呈现才消耗
  useEffect(() => {
    if (
      !bsideReady ||
      loadingMemory ||
      !memory ||
      memory.bsideFirstRevealDone ||
      side !== 'A' ||
      revealGuard.current
    ) {
      return;
    }
    revealGuard.current = true;
    const timer = setTimeout(() => {
      flipTo('B', () => {
        void catchMemoryService.markBsideRevealed(catchId);
        setMemory((current) =>
          current ? { ...current, bsideFirstRevealDone: true } : current
        );
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [bsideReady, loadingMemory, memory, side, catchId, flipTo]);

  // -----------------------------------------------------------------------
  // 信息编辑（整合工作台 · 编辑规范 V1）
  // -----------------------------------------------------------------------
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  // Sheet 入出场（4.3 全局规范）：遮罩 Fade + 面板 TranslationY，退出动画播完再卸载
  const editProgress = useRef(new Animated.Value(0)).current;
  const [editMounted, setEditMounted] = useState(false);

  useEffect(() => {
    if (editSheetOpen) {
      setEditMounted(true);
      Animated.timing(editProgress, {
        toValue: 1,
        duration: motion.normal,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (editMounted) {
      Animated.timing(editProgress, {
        toValue: 0,
        duration: motion.fast,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setEditMounted(false);
        }
      });
    }
  }, [editSheetOpen, editProgress, editMounted]);
  const editSheetTranslate = editProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
    extrapolate: 'clamp',
  });
  const [editDraft, setEditDraft] = useState<EditDraft>({
    speciesKey: '',
    speciesName: '',
    lengthCm: '',
    weightKg: '',
    location: '',
    latitude: null,
    longitude: null,
    story: '',
  });
  const editSnapshot = useRef('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [pickingSpecies, setPickingSpecies] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [voiceHint, setVoiceHint] = useState(false);

  /* 感言输入框键盘避让：KAV 把 Sheet 抬到键盘上方后表单区收缩，感言是
     最后一段字段——键盘弹出/聚焦感言时把滚动区推到底，输入框保持可见 */
  const storyInputRef = useRef<TextInput>(null);
  const editScrollRef = useRef<ScrollView>(null);
  const editScrollMetrics = useRef({ contentH: 0, viewH: 0 });
  const kbOpenRef = useRef(false);
  const storyScrollDoneRef = useRef(false);
  /* Android：edge-to-edge Modal 里 KAV 收起键盘后 padding 归零不可靠，会残留
     底部间隙——手动用键盘高度抬升/归零（iOS 仍用 KAV） */
  const [kbLift, setKbLift] = useState(0);

  const scrollStoryIntoView = useCallback(() => {
    const { contentH, viewH } = editScrollMetrics.current;
    const maxOffset = Math.max(0, contentH - viewH);
    if (maxOffset > 0) {
      editScrollRef.current?.scrollTo({ y: maxOffset, animated: true });
    }
  }, []);

  const storyFocused = useCallback(
    () =>
      Boolean(
        storyInputRef.current &&
          TextInput.State.currentlyFocusedInput() === storyInputRef.current
      ),
    []
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kbOpenRef.current = true;
      storyScrollDoneRef.current = false;
      setKbLift(e.endCoordinates?.height ?? 0);
      /* KAV 的收缩布局在键盘事件后下一帧生效：双 rAF 跨过重排再量 */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!storyScrollDoneRef.current && storyFocused()) {
            storyScrollDoneRef.current = true;
            scrollStoryIntoView();
          }
        })
      );
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbOpenRef.current = false;
      storyScrollDoneRef.current = false;
      setKbLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollStoryIntoView, storyFocused]);

  const editDirty = useMemo(
    () => JSON.stringify(editDraft) !== editSnapshot.current,
    [editDraft, editSheetOpen]
  );

  const openEditSheet = useCallback(() => {
    if (!remoteCatch || !memory) {
      return;
    }
    const draft: EditDraft = {
      speciesKey: memory.speciesKey || remoteCatch.speciesId,
      speciesName: memory.speciesName || remoteCatch.speciesName,
      lengthCm: memory.lengthCm != null ? String(memory.lengthCm) : '',
      weightKg: memory.weightKg != null ? String(memory.weightKg) : '',
      location: memory.location ?? '',
      latitude: memory.latitude ?? null,
      longitude: memory.longitude ?? null,
      story: memory.story ?? '',
    };
    setEditDraft(draft);
    editSnapshot.current = JSON.stringify(draft);
    setVoiceHint(false);
    setEditSheetOpen(true);
    haptics.selection();
  }, [memory, remoteCatch]);

  const closeEditSheet = useCallback(() => {
    if (editDirty) {
      Alert.alert('放弃修改？', '未保存的修改将会丢失。', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => setEditSheetOpen(false),
        },
      ]);
      return;
    }
    setEditSheetOpen(false);
  }, [editDirty]);

  const pickSpeciesForEdit = useCallback(async () => {
    if (pickingSpecies) {
      return;
    }
    setPickingSpecies(true);
    setEditSheetOpen(false); // 选择器页面需要盖在详情页上
    navigation.navigate('SpeciesPicker', { title: '修改鱼种' });
    const picked = await speciesPickerHub.requestPick();
    setPickingSpecies(false);
    if (picked) {
      setEditDraft((draft) => ({
        ...draft,
        speciesKey: picked.key,
        speciesName: picked.name,
      }));
      haptics.selection();
    }
    setEditSheetOpen(true); // 草稿保留，回到编辑工作台
  }, [navigation, pickingSpecies]);

  const pickLocationForEdit = useCallback(async () => {
    if (pickingLocation) {
      return;
    }
    setPickingLocation(true);
    setEditSheetOpen(false);
    navigation.navigate('LocationPicker', {
      initial:
        editDraft.latitude != null && editDraft.longitude != null
          ? { latitude: editDraft.latitude, longitude: editDraft.longitude }
          : undefined,
    });
    const picked = await locationPickerHub.requestPick();
    setPickingLocation(false);
    if (picked) {
      setEditDraft((draft) => ({
        ...draft,
        location: picked.label,
        latitude: picked.latitude,
        longitude: picked.longitude,
      }));
      haptics.selection();
    }
    setEditSheetOpen(true);
  }, [editDraft.latitude, editDraft.longitude, navigation, pickingLocation]);

  const lengthValid =
    editDraft.lengthCm.trim() === '' || parsePositiveNumber(editDraft.lengthCm) != null;
  const weightValid =
    editDraft.weightKg.trim() === '' || parsePositiveNumber(editDraft.weightKg) != null;
  const saveDisabled =
    savingEdit || !editDraft.speciesName.trim() || !lengthValid || !weightValid;

  const saveEdit = useCallback(async () => {
    if (!memory || !remoteCatch || savingEdit) {
      return;
    }
    setSavingEdit(true);
    const speciesKey =
      editDraft.speciesKey && editDraft.speciesKey !== 'unknown'
        ? editDraft.speciesKey
        : '';
    const speciesName = editDraft.speciesName.trim();
    // 鱼种覆写仅在与识别结果不同时保留，其余清空回到识别值
    const overridden =
      speciesKey && speciesKey !== remoteCatch.speciesId ? speciesKey : null;
    const next: CatchMemoryData = {
      ...memory,
      lengthCm: parsePositiveNumber(editDraft.lengthCm),
      weightKg: parsePositiveNumber(editDraft.weightKg),
      location: editDraft.location.trim() || null,
      latitude: editDraft.latitude,
      longitude: editDraft.longitude,
      story: editDraft.story,
      speciesKey: overridden,
      speciesName: overridden ? speciesName : null,
    };
    try {
      await persistMemory(next);
      setEditSheetOpen(false);
      haptics.confirm();
    } catch {
      Alert.alert(
        '保存失败',
        '修改还没有保存，请重试。',
        [
          { text: '取消', style: 'cancel' },
          { text: '重试', onPress: () => void saveEdit() },
        ],
      );
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, memory, persistMemory, remoteCatch, savingEdit]);

  // -----------------------------------------------------------------------
  // 鱼获记忆媒体（照片 / 视频收藏）
  // -----------------------------------------------------------------------
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  const mediaList = useMemo(() => {
    const items: MemoryMediaItem[] = [];
    const remoteUrl = catchService.resolveUrl(remoteCatch?.imageUrl);
    if (remoteUrl) {
      items.push({
        uri: remoteUrl,
        authToken: session?.accessToken ?? null,
        kind: 'photo',
      });
    }
    (memory?.media ?? []).forEach((item) =>
      items.push({
        uri: item.uri,
        authToken: null,
        kind: item.kind,
        durationSec: item.durationSec,
      })
    );
    return items;
  }, [remoteCatch, memory, session]);

  /** 图片选择器 / 相机返回的资产（仅取本页关心的字段）。 */
  const appendPickedAssets = (
    assets: { uri?: string | null; type?: string | null; duration?: number }[]
  ) => {
    if (!memory || assets.length === 0) {
      return;
    }
    const picked = assets
      .map(
        (
          asset
        ): {
          uri: string;
          kind: 'photo' | 'video';
          durationSec?: number;
        } | null => {
          const uri = toFileUri(asset.uri ?? null);
          if (!uri) {
            return null;
          }
          const kind: 'photo' | 'video' = asset.type?.startsWith('video/')
            ? 'video'
            : 'photo';
          const durationSec =
            typeof asset.duration === 'number' && asset.duration > 0
              ? Math.round(asset.duration)
              : undefined;
          return { uri, kind, durationSec };
        }
      )
      .filter(
        (
          entry
        ): entry is {
          uri: string;
          kind: 'photo' | 'video';
          durationSec?: number;
        } => entry !== null
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
    launchImageLibrary(
      { mediaType: 'mixed', quality: 0.9, selectionLimit: 9 },
      (response) => {
        if (
          response.didCancel ||
          response.errorCode ||
          !response.assets?.length
        ) {
          return;
        }
        appendPickedAssets(response.assets);
      }
    );
  };

  const addMediaFromCamera = () => {
    launchCamera({ mediaType: 'photo', quality: 0.9 }, (response) => {
      if (
        response.didCancel ||
        response.errorCode ||
        !response.assets?.length
      ) {
        return;
      }
      appendPickedAssets(response.assets);
    });
  };

  const addVideoFromCamera = () => {
    launchCamera({ mediaType: 'video', quality: 0.9 }, (response) => {
      if (
        response.didCancel ||
        response.errorCode ||
        !response.assets?.length
      ) {
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
        <MorningLakeScene level="content" />
        <View style={[styles.wrap, { paddingTop: insets.top + spacing.xl }]}>
          <EmptyState
            variant="memory"
            title="这条鱼获记录已不可用"
            description="它可能已被移除，或暂时无法找到。"
            actionLabel="返回我的鱼获"
            onAction={() => navigation.navigate('MyCatches')}
          />
        </View>
      </View>
    );
  }

  /* Core UI V1 固定清晨湖畔世界：文字/表面不随环境主题漂移 */
  const textPrimary = coreColors.deepLakeBlue;
  const textSecondary = coreColors.lakeBlue;
  const textHint = coreColors.mistBlueGray;
  const displaySpeciesName =
    memory?.speciesName || remoteCatch.speciesName || UNKNOWN;
  const displaySpeciesKey = memory?.speciesKey || remoteCatch.speciesId;

  /** Hero 数据行：仅拼接存在的字段，不伪造占位（页面状态规范 §5）。 */
  const metaParts = [
    formatLength(memory?.lengthCm ?? remoteCatch.lengthCm ?? null, lengthUnit),
    formatWeight(memory?.weightKg ?? remoteCatch.weightKg ?? null, weightUnit),
    memory?.location?.trim() || remoteCatch.location?.trim() || null,
  ].filter((part): part is string => Boolean(part));
  const metaLine = metaParts.join(' · ');

  const photoCount = mediaList.filter((item) => item.kind !== 'video').length;
  const videoCount = mediaList.length - photoCount;
  const memorySummary = loadingMemory
    ? '正在打开…'
    : `${photoCount} 张照片 · ${videoCount} 段视频`;
  const memoryEmpty = !loadingMemory && mediaList.length === 0;

  /** 鱼获记忆生成入口暂时屏蔽，恢复时改回 true 即可 */
  const MEMORY_GENERATION_ENABLED = false;

  /** 生成模块：真实记录 + 已登录 + 未 READY 时展示（READY 由 Flip 承接）。 */
  const showGenerationModule =
    MEMORY_GENERATION_ENABLED &&
    Boolean(catchId) &&
    Boolean(session) &&
    bside.status !== 'READY';

  const bsideResolvedUrl = bside.uri ? catchService.resolveUrl(bside.uri) : null;

  const renderGridCell = (item: MemoryMediaItem, index: number) => (
    <PressableScale
      key={`${item.uri}-${index}`}
      onPress={() => setViewer({ open: true, index })}
      scaleTo={0.97}
      accessibilityLabel={
        item.kind === 'video' ? `查看记忆视频 ${index + 1}` : `查看记忆照片 ${index + 1}`
      }
    >
      <View style={styles.gridCell} pointerEvents="none">
        {item.kind === 'video' ? (
          <View style={styles.videoCell}>
            {/* iOS 直接显示视频首帧；Android 无封面时保留深色底 + 播放角标 */}
            <Image
              source={{ uri: item.uri }}
              style={styles.gridImage}
              resizeMode="cover"
            />
            <View style={styles.videoShade} />
            <View style={styles.videoPlayWrap}>
              <View style={styles.videoPlayCircle}>
                <AppIcon name="play" size={15} color="#FFFFFF" />
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
          <Image
            source={{ uri: item.uri }}
            style={styles.gridImage}
            resizeMode="cover"
          />
        )}
      </View>
    </PressableScale>
  );

  const heroFrontRotate = flipValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const heroFrontOpacity = flipValue.interpolate({
    inputRange: [0, 0.46, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const heroBackRotate = flipValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-90deg', '-90deg', '0deg'],
  });
  const heroBackOpacity = flipValue.interpolate({
    inputRange: [0, 0.5, 0.54, 1],
    outputRange: [0, 0, 1, 1],
  });

  /** A 面媒体缺失 / 加载失败：同一几何内的中性兜底（页面状态规范 §3）。 */
  const heroMediaFallback = (
    <View style={styles.heroFallback}>
      <AppIcon name="image_missing" size={26} color={coreColors.mistBlueGray} />
      <Text style={styles.heroFallbackText}>照片暂不可用</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <MorningLakeScene level="content" />
      {/* 顶部导航 BACK_TITLE_ACTIONS V1：左对齐 20sp 标题 + 纯图标 Utility（鱼鉴/分享） */}
      <ScreenHeader
        title="鱼获详情"
        onBack={() => navigation.goBack()}
        titleColor={textPrimary}
        right={
          <>
            {displaySpeciesKey && displaySpeciesKey !== 'unknown' ? (
              <HeaderIconButton
                name="fish_guide"
                onPress={() =>
                  navigation.navigate('Species', { key: displaySpeciesKey })
                }
                color={textPrimary}
              />
            ) : null}
            <HeaderIconButton
              name="share"
              onPress={() =>
                navigation.navigate('ShareCreate', {
                  presetCatchId: remoteCatch.id,
                })
              }
              color={textPrimary}
            />
          </>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* YuJianCatchHeroCard · Detail：真实照片 / B 面鱼体，底部叠字 + 编辑胶囊 + Flip */}
        <PressableScale
          onPress={() => {
            if (sideRef.current === 'A') {
              setViewer({ open: true, index: 0 });
            }
          }}
          scaleTo={0.99}
          disabled={side === 'B'}
        >
          <View style={styles.heroFrame}>
            {/* A 面 · 真实鱼获照片 */}
            <Animated.View
              style={[
                styles.heroLayer,
                {
                  transform: [
                    { perspective: 1100 },
                    { rotateY: heroFrontRotate },
                  ],
                  opacity: heroFrontOpacity,
                },
              ]}
              pointerEvents="none"
            >
              {remoteCatch.imageUrl ? (
                <RemoteImage
                  url={remoteCatch.imageUrl}
                  authToken={session?.accessToken ?? null}
                  style={styles.heroImage}
                  resizeMode="cover"
                  placeholder={heroMediaFallback}
                />
              ) : (
                heroMediaFallback
              )}
            </Animated.View>

            {/* B 面 · 生成鱼体资产（同一 Hero 外框，仅换画面） */}
            {bsideReady && bsideResolvedUrl ? (
              <Animated.View
                style={[
                  styles.heroLayer,
                  {
                    transform: [
                      { perspective: 1100 },
                      { rotateY: heroBackRotate },
                    ],
                    opacity: heroBackOpacity,
                  },
                ]}
                pointerEvents="none"
              >
                <Image
                  source={{
                    uri: bsideResolvedUrl,
                    headers:
                      bside.uri && bside.uri.startsWith('/')
                        ? {
                            Authorization: `Bearer ${session?.accessToken ?? ''}`,
                          }
                        : undefined,
                  }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  onError={handleBsideLoadError}
                />
              </Animated.View>
            ) : null}

            {/* 底部可读性渐变（冻结稿：透明 → 深色 62%）。
                stopColor 不支持 rgba alpha 写法，透明度必须走 stopOpacity，
                否则渐变退化为纯黑实底盖住照片 */}
            <View style={styles.heroScrim} pointerEvents="none">
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="heroScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#081926" stopOpacity="0" />
                    <Stop offset="1" stopColor="#081926" stopOpacity="0.62" />
                  </LinearGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill="url(#heroScrim)"
                />
              </Svg>
            </View>

            {/* 页内 Flip：仅 READY 可见，A/B 同一稳定位置（Overview §6） */}
            {bsideReady ? (
              <PressableScale
                onPress={() => flipTo(side === 'A' ? 'B' : 'A')}
                scaleTo={0.9}
                style={styles.flipHit}
                accessibilityLabel="翻面"
              >
                <View style={styles.flipChip}>
                  <AppIcon name="flip" size={16} color="#FFFFFF" />
                </View>
              </PressableScale>
            ) : null}

            {/* 底部叠字：鱼名 + 长度 · 重量 · 地点（V2 视觉无时间） + 编辑 > */}
            <View style={styles.heroBottom} pointerEvents="box-none">
              <View style={styles.heroTextCol}>
                <Text style={styles.heroSpecies}>{displaySpeciesName}</Text>
                {loadingMemory ? null : metaLine ? (
                  <Text style={styles.heroMeta} numberOfLines={1}>
                    {metaLine}
                  </Text>
                ) : null}
              </View>
              <PressableScale
                onPress={openEditSheet}
                scaleTo={0.94}
                style={styles.editPillHit}
                accessibilityLabel="编辑鱼获信息"
              >
                <View style={styles.editPill}>
                  <Text style={styles.editPillText}>编辑</Text>
                  <AppIcon name="chevron_right" size={13} color="#FFFFFF" />
                </View>
              </PressableScale>
            </View>
          </View>
        </PressableScale>

        {/* 关于这次鱼获（铅笔进入整合编辑工作台） */}
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={[styles.panelTitle, { color: textPrimary }]}>
              关于这次鱼获
            </Text>
            <PressableScale
              onPress={openEditSheet}
              scaleTo={0.9}
              style={styles.headIconHit}
              accessibilityLabel="编辑这次鱼获"
            >
              <AppIcon name="edit" size={16} color={textSecondary} />
            </PressableScale>
          </View>
          {loadingMemory ? (
            <View style={styles.skeletonBlock}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonShort]} />
            </View>
          ) : memory?.story ? (
            <Text style={[styles.storyText, { color: textSecondary }]}>
              {memory.story}
            </Text>
          ) : (
            <Text style={[styles.storyPlaceholder, { color: textHint }]}>
              记录这一刻的感受…
            </Text>
          )}
        </View>

        {/* 鱼获记忆：计数 + 空态 / 操作 + 方格 + 生成模块 */}
        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { color: textPrimary }]}>
            鱼获记忆
          </Text>
          <Text style={[styles.memoryCount, { color: textHint }]}>
            {memorySummary}
          </Text>

          {memoryEmpty ? (
            <View style={styles.emptyBlock}>
              <MemoryFrameGlyph size={116} />
              <Text style={[styles.emptyTitle, { color: textPrimary }]}>
                留下这次鱼获的画面
              </Text>
              <Text style={[styles.emptyDesc, { color: textHint }]}>
                照片和视频，会让这一刻更完整。
              </Text>
            </View>
          ) : null}

          {!loadingMemory ? (
            <View style={styles.memoryActions}>
              <PressableScale
                onPress={addMediaFromLibrary}
                scaleTo={0.96}
                style={styles.memoryActionHit}
              >
                <View style={styles.memoryAction}>
                  <AppIcon name="gallery" size={15} color={textSecondary} />
                  <Text style={[styles.memoryActionText, { color: textPrimary }]}>
                    添加照片/视频
                  </Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={addMediaFromCamera}
                scaleTo={0.96}
                style={styles.memoryActionHit}
              >
                <View style={styles.memoryAction}>
                  <AppIcon name="camera" size={15} color={textSecondary} />
                  <Text style={[styles.memoryActionText, { color: textPrimary }]}>
                    继续拍照
                  </Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={addVideoFromCamera}
                scaleTo={0.96}
                style={styles.memoryActionHit}
              >
                <View style={styles.memoryAction}>
                  <AppIcon name="video" size={15} color={textSecondary} />
                  <Text style={[styles.memoryActionText, { color: textPrimary }]}>
                    录制视频
                  </Text>
                </View>
              </PressableScale>
            </View>
          ) : null}

          {!loadingMemory && mediaList.length > 0 ? (
            <View style={styles.grid}>{mediaList.map(renderGridCell)}</View>
          ) : null}

          {/* 鱼体资产生成（03 规范：安静纪录式，A 面全程可用） */}
          {showGenerationModule ? (
            <View style={styles.genBlock}>
              <View style={styles.genRule} />
              {bside.status === 'GENERATING' ? (
                <View style={styles.genRow}>
                  <ActivityIndicator size="small" color={textSecondary} />
                  <View style={styles.genTextCol}>
                    <Text style={[styles.genTitle, { color: textPrimary }]}>
                      正在生成鱼获记忆…
                    </Text>
                    <Text style={[styles.genDesc, { color: textHint }]}>
                      可以继续浏览或离开，完成后会保留在这条鱼获里。
                    </Text>
                  </View>
                </View>
              ) : bside.status === 'FAILED' ? (
                <View style={styles.genTextCol}>
                  <Text style={[styles.genTitle, { color: textPrimary }]}>
                    鱼获记忆生成失败
                  </Text>
                  <Text style={[styles.genDesc, { color: textHint }]}>
                    原鱼获记录不受影响。
                  </Text>
                  <PressableScale
                    onPress={() => void startGeneration()}
                    scaleTo={0.95}
                    style={styles.genButtonHit}
                  >
                    <View style={styles.genButton}>
                      <AppIcon name="retry_refresh" size={15} color={textPrimary} />
                      <Text style={[styles.genButtonText, { color: textPrimary }]}>
                        重新生成
                      </Text>
                    </View>
                  </PressableScale>
                </View>
              ) : (
                <View style={styles.genTextCol}>
                  <Text style={[styles.genDesc, { color: textHint }]}>
                    为这次相遇生成一份鱼获记忆
                  </Text>
                  <PressableScale
                    onPress={() => void startGeneration()}
                    scaleTo={0.95}
                    style={styles.genButtonHit}
                  >
                    <View style={styles.genButton}>
                      <AppIcon name="sparkles" size={15} color={textPrimary} />
                      <Text style={[styles.genButtonText, { color: textPrimary }]}>
                        生成鱼获记忆
                      </Text>
                    </View>
                  </PressableScale>
                </View>
              )}
            </View>
          ) : null}
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

      {/* 信息编辑工作台（编辑规范 V1：一个整合编辑会话；冻结稿：乳白玻璃 Sheet + 深色遮罩） */}
      <Modal
        transparent
        visible={editMounted}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeEditSheet}
      >
        {/* 键盘避让：iOS 用 KAV padding；Android edge-to-edge 下 KAV 在 Modal 里
            收起键盘后 padding 归零不可靠（残留底部间隙），enabled=false 使其退化为
            普通 View，改用键盘高度手动 paddingBottom 精确抬升/归零；感言聚焦后由
            上方键盘监听滚进可视区 */}
        <KeyboardAvoidingView
          behavior="padding"
          enabled={Platform.OS === 'ios'}
          style={[styles.editFill, kbLift > 0 ? { paddingBottom: kbLift } : null]}
        >
          {/* 遮罩压暗底层详情页（冻结稿 ~38%）；点击交由关闭确认把关 */}
          <TouchableWithoutFeedback onPress={closeEditSheet}>
            <Animated.View
              style={[styles.editScrim, { opacity: editProgress }]}
            />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.editSheet,
              { transform: [{ translateY: editSheetTranslate }] },
              { paddingBottom: 26 + insets.bottom },
            ]}
          >
            <View style={styles.editHandleWrap}>
              <View style={styles.editHandle} />
            </View>
            <View style={styles.editTitleRow}>
              <Text style={[styles.editTitle, { color: textPrimary }]}>
                编辑鱼获信息
              </Text>
              <PressableScale
                onPress={closeEditSheet}
                scaleTo={0.9}
                style={styles.editCloseHit}
                accessibilityLabel="关闭编辑"
              >
                <AppIcon name="close" size={20} color={textSecondary} />
              </PressableScale>
            </View>

            {/* 表单可滚动：键盘弹出（KAV 收缩可视高度）或小屏字段超高时滚动可达。
                不用 flex:1 ScrollView——maxHeight 容器内会退化成 0 高导致字段不可见；
                flexShrink:1 让 ScrollView 随内容自适应、父容器触顶时收缩出滚动区 */}
            <ScrollView
              ref={editScrollRef}
              style={styles.editBodyScroll}
              contentContainerStyle={styles.editBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onLayout={(e) => {
                editScrollMetrics.current.viewH = e.nativeEvent.layout.height;
                /* KAV 抬升引发的重排回调：聚焦感言时滚进可视区（补键盘事件时序兜底） */
                if (kbOpenRef.current && !storyScrollDoneRef.current && storyFocused()) {
                  storyScrollDoneRef.current = true;
                  scrollStoryIntoView();
                }
              }}
              onContentSizeChange={(_w, h) => {
                editScrollMetrics.current.contentH = h;
              }}
            >
              {/* 基础信息 · 鱼种 */}
              <PressableScale
                onPress={() => void pickSpeciesForEdit()}
                scaleTo={0.99}
              >
                <View
                  style={[styles.fieldCard, styles.fieldRowCard]}
                  pointerEvents="none"
                >
                  <AppIcon name="species" size={17} color={coreColors.morningGold} />
                  <Text style={[styles.fieldLabel, { color: textHint }]}>
                    鱼种
                  </Text>
                  <Text
                    style={[styles.fieldValue, { color: textPrimary }]}
                    numberOfLines={1}
                  >
                    {editDraft.speciesName || '选择鱼种'}
                  </Text>
                  <AppIcon
                    name="chevron_right"
                    size={15}
                    color={coreColors.mistBlueGray}
                  />
                </View>
              </PressableScale>

              {/* 基础信息 · 长度 / 重量（冻结稿：两张独立白卡等分整行，各含内嵌实底输入框；单位固定不入值） */}
              <View style={styles.measurePair}>
                <View style={[styles.fieldCard, styles.measureCard]}>
                  <View style={styles.measureHead}>
                    <AppIcon
                      name="length"
                      size={15}
                      color={coreColors.morningGold}
                    />
                    <Text style={[styles.fieldLabel, { color: textHint }]}>
                      长度
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.measureInputBox,
                      !lengthValid && styles.measureInputInvalid,
                    ]}
                  >
                    <TextInput
                      style={[styles.measureInput, { color: textPrimary }]}
                      value={editDraft.lengthCm}
                      onChangeText={(value) =>
                        setEditDraft((d) => ({ ...d, lengthCm: value }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={coreColors.mistBlueGray}
                      maxLength={8}
                    />
                    <Text style={[styles.measureUnit, { color: textHint }]}>
                      cm
                    </Text>
                  </View>
                </View>
                <View style={[styles.fieldCard, styles.measureCard]}>
                  <View style={styles.measureHead}>
                    <AppIcon
                      name="weight"
                      size={15}
                      color={coreColors.morningGold}
                    />
                    <Text style={[styles.fieldLabel, { color: textHint }]}>
                      重量
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.measureInputBox,
                      !weightValid && styles.measureInputInvalid,
                    ]}
                  >
                    <TextInput
                      style={[styles.measureInput, { color: textPrimary }]}
                      value={editDraft.weightKg}
                      onChangeText={(value) =>
                        setEditDraft((d) => ({ ...d, weightKg: value }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={coreColors.mistBlueGray}
                      maxLength={8}
                    />
                    <Text style={[styles.measureUnit, { color: textHint }]}>
                      kg
                    </Text>
                  </View>
                </View>
              </View>
              {!lengthValid || !weightValid ? (
                <Text style={styles.fieldError}>
                  长度和重量需为正数，或留空
                </Text>
              ) : null}

              {/* 环境与记录 · 地点（地图选点，不凭空捏造坐标） */}
              <PressableScale
                onPress={() => void pickLocationForEdit()}
                scaleTo={0.99}
              >
                <View
                  style={[styles.fieldCard, styles.fieldRowCard]}
                  pointerEvents="none"
                >
                  <AppIcon
                    name="location"
                    size={17}
                    color={coreColors.morningGold}
                  />
                  <Text style={[styles.fieldLabel, { color: textHint }]}>
                    地点
                  </Text>
                  <Text
                    style={[styles.fieldValue, { color: textPrimary }]}
                    numberOfLines={1}
                  >
                    {editDraft.location || '选择钓点'}
                  </Text>
                  <AppIcon
                    name="chevron_right"
                    size={15}
                    color={coreColors.mistBlueGray}
                  />
                </View>
              </PressableScale>

              {/* 环境与记录 · 感言（冻结稿：标题 + 虚线框直接坐 sheet 底色，无白卡包裹） */}
              <View style={styles.storySection}>
                <View style={styles.storyHead}>
                  <Text style={[styles.storyHeadLabel, { color: textPrimary }]}>
                    写下这次鱼获的故事
                  </Text>
                  <PressableScale
                    onPress={() => setVoiceHint(true)}
                    scaleTo={0.92}
                    accessibilityLabel="语音录入"
                  >
                    {/* 行容器需自带：PressableScale 内层 Animated.View 默认纵向排列 */}
                    <View style={styles.voiceHit}>
                      <AppIcon name="voice" size={14} color="#2F6FD0" />
                      <Text style={styles.voiceLabel}>语音录入</Text>
                    </View>
                  </PressableScale>
                </View>
                <View style={styles.storyBox}>
                  <TextInput
                    ref={storyInputRef}
                    style={[styles.storyInput, { color: textPrimary }]}
                    value={editDraft.story}
                    onChangeText={(value) =>
                      setEditDraft((d) => ({ ...d, story: value }))
                    }
                    onFocus={() => {
                      /* 键盘已开（不会再触发 keyboardDidShow）：聚焦即滚进可视区 */
                      if (kbOpenRef.current) {
                        storyScrollDoneRef.current = true;
                        requestAnimationFrame(() => scrollStoryIntoView());
                      }
                    }}
                    placeholder="记录这一刻的感受…"
                    placeholderTextColor={coreColors.mistBlueGray}
                    multiline
                    maxLength={2000}
                  />
                </View>
                {voiceHint ? (
                  <Text style={[styles.voiceHint, { color: textHint }]}>
                    语音转文字马上就来，先写下文字吧
                  </Text>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.editActions}>
              <PressableScale
                onPress={closeEditSheet}
                scaleTo={0.97}
                style={styles.editActionHit}
              >
                <View style={styles.cancelButton}>
                  <Text style={[styles.cancelText, { color: textPrimary }]}>
                    取消
                  </Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={() => void saveEdit()}
                scaleTo={0.97}
                disabled={saveDisabled}
                style={styles.editActionHit}
              >
                <View
                  style={[
                    styles.saveButton,
                    saveDisabled && styles.saveButtonDisabled,
                  ]}
                >
                  {/* 保存按钮渐变（冻结稿 #3E7FE8 → #2A5FC4），文字压在其上 */}
                  {!saveDisabled ? (
                    <View style={styles.saveGradient} pointerEvents="none">
                      <Svg width="100%" height="100%" preserveAspectRatio="none">
                        <Defs>
                          <LinearGradient
                            id="editSaveGradient"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <Stop offset="0" stopColor="#3E7FE8" />
                            <Stop offset="1" stopColor="#2A5FC4" />
                          </LinearGradient>
                        </Defs>
                        <Rect
                          x="0"
                          y="0"
                          width="100%"
                          height="100%"
                          fill="url(#editSaveGradient)"
                        />
                      </Svg>
                    </View>
                  ) : null}
                  {savingEdit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveText}>保存修改</Text>
                  )}
                </View>
              </PressableScale>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingHorizontal: PAGE_MARGIN,
  } as ViewStyle,
  content: {
    paddingHorizontal: PAGE_MARGIN,
  } as ViewStyle,
  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Hero（YuJianCatchHeroCard · Detail）
  // -----------------------------------------------------------------------
  heroFrame: {
    borderRadius: HERO_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: coreColors.lakeWhite,
    aspectRatio: HERO_ASPECT,
  } as ViewStyle,
  heroLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,45,75,0.08)',
  } as ViewStyle,
  heroImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
  } as ViewStyle,
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(116,136,151,0.14)',
  } as ViewStyle,
  heroFallbackText: {
    fontSize: fs(12),
    color: coreColors.mistBlueGray,
  } as TextStyle,
  heroBottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  } as ViewStyle,
  heroTextCol: {
    flexShrink: 1,
    paddingRight: spacing.sm,
  } as ViewStyle,
  heroSpecies: {
    fontFamily: font.serif,
    fontSize: fs(30),
    fontWeight: '700',
    letterSpacing: 3,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8,25,38,0.55)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  } as TextStyle,
  heroMeta: {
    marginTop: 4,
    fontSize: fs(13),
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(8,25,38,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  editPillHit: {
    marginBottom: 3,
  } as ViewStyle,
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: coreGlass.C.bg,
    borderColor: coreGlass.C.border,
  } as ViewStyle,
  editPillText: {
    fontSize: fs(12),
    color: '#FFFFFF',
    fontWeight: '500',
  } as TextStyle,
  flipHit: {
    position: 'absolute',
    top: spacing.sm + 2,
    right: spacing.sm + 2,
  } as ViewStyle,
  flipChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,25,38,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  } as ViewStyle,
  // -----------------------------------------------------------------------
  // 玻璃内容卡（关于这次鱼获 / 鱼获记忆）
  // -----------------------------------------------------------------------
  panel: {
    marginTop: spacing.xl,
    borderRadius: coreRadius.lg,
    borderWidth: 1,
    backgroundColor: coreGlass.A.bg,
    borderColor: coreGlass.A.border,
    shadowColor: coreGlass.A.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    paddingHorizontal: CARD_PAD,
    paddingVertical: CARD_PAD - 2,
  } as ViewStyle,
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm - 2,
  } as ViewStyle,
  headIconHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  } as ViewStyle,
  panelTitle: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  storyText: {
    fontSize: fs(14),
    lineHeight: 23,
  } as TextStyle,
  storyPlaceholder: {
    fontSize: fs(13),
    lineHeight: 21,
  } as TextStyle,
  skeletonBlock: {
    gap: 8,
  } as ViewStyle,
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(11,45,75,0.10)',
  } as ViewStyle,
  skeletonShort: {
    width: '62%',
  } as ViewStyle,
  memoryCount: {
    fontSize: fs(12),
    marginTop: 3,
    marginBottom: spacing.md,
  } as TextStyle,
  // 空态（无上传记忆冻结稿：线稿相框 + 双行文案）
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 2,
  } as ViewStyle,
  emptyTitle: {
    marginTop: spacing.md,
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  emptyDesc: {
    fontSize: fs(12),
    lineHeight: 19,
  } as TextStyle,
  // 三个记忆操作（一排等宽胶囊）
  memoryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  } as ViewStyle,
  memoryActionHit: {
    flex: 1,
  } as ViewStyle,
  memoryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(116,136,151,0.38)',
    paddingHorizontal: 4,
  } as ViewStyle,
  memoryActionText: {
    fontSize: fs(11.5),
    fontWeight: '500',
    flexShrink: 1,
  } as TextStyle,
  // 方格媒体
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  } as ViewStyle,
  gridCell: {
    width: GRID_CELL_WIDTH,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: coreColors.lakeWhite,
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
    left: 6,
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
  // 生成模块（安静纪录式）
  genBlock: {
    marginTop: spacing.lg,
  } as ViewStyle,
  genRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(116,136,151,0.35)',
    marginBottom: spacing.md,
  } as ViewStyle,
  genRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
  } as ViewStyle,
  genTextCol: {
    flex: 1,
    gap: 2,
  } as ViewStyle,
  genTitle: {
    fontSize: fs(13.5),
    fontWeight: '600',
    lineHeight: 20,
  } as TextStyle,
  genDesc: {
    fontSize: fs(12),
    lineHeight: 19,
  } as TextStyle,
  genButtonHit: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  } as ViewStyle,
  genButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(116,136,151,0.42)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 16,
  } as ViewStyle,
  genButtonText: {
    fontSize: fs(12.5),
    fontWeight: '600',
  } as TextStyle,
  // -----------------------------------------------------------------------
  // 信息编辑 Bottom Sheet（冻结稿 FishRecordDetail_Editing_V1_Frozen）
  // -----------------------------------------------------------------------
  editFill: {
    flex: 1,
    justifyContent: 'flex-end',
  } as ViewStyle,
  editScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,22,32,0.38)',
  } as ViewStyle,
  editSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(236,243,251,0.94)',
    paddingBottom: 26,
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  } as ViewStyle,
  editHandleWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  } as ViewStyle,
  editHandle: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#A9BED4',
  } as ViewStyle,
  editTitleRow: {
    justifyContent: 'center',
    paddingHorizontal: CARD_PAD + 2,
    marginBottom: spacing.md,
  } as ViewStyle,
  editTitle: {
    fontFamily: font.serif,
    fontSize: fs(17),
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  } as TextStyle,
  editCloseHit: {
    position: 'absolute',
    right: CARD_PAD,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  } as ViewStyle,
  /** 表单滚动容器：内容自适应高度，Sheet 被 maxHeight/键盘压缩时收缩出滚动区 */
  editBodyScroll: {
    flexShrink: 1,
  } as ViewStyle,
  editBody: {
    paddingHorizontal: CARD_PAD + 2,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  } as ViewStyle,
  // 字段白卡（冻结稿：rgba(255,255,255,0.65) + #D6E3F0 细边 + ~28px 圆角）
  fieldCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3F0',
    backgroundColor: 'rgba(255,255,255,0.65)',
    padding: spacing.md + 2,
  } as ViewStyle,
  fieldRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  } as ViewStyle,
  fieldLabel: {
    fontSize: fs(13),
    letterSpacing: 1,
  } as TextStyle,
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '600',
  } as TextStyle,
  fieldError: {
    fontSize: fs(11.5),
    color: '#C25B4E',
    marginTop: -spacing.xs,
  } as TextStyle,
  measurePair: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
  } as ViewStyle,
  /** 两张测量卡等分整行（flex:1），输入框随之占满卡宽 */
  measureCard: {
    flex: 1,
  } as ViewStyle,
  measureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  // 内嵌实底输入框（冻结稿：纯白底 + 单位在框内右侧）
  measureInputBox: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    height: 41,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(11,45,75,0.16)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
  } as ViewStyle,
  measureInputInvalid: {
    borderColor: 'rgba(194,91,78,0.55)',
  } as ViewStyle,
  measureInput: {
    flex: 1,
    fontFamily: font.serif,
    fontSize: fs(16),
    fontWeight: '600',
    paddingVertical: 0,
  } as TextStyle,
  measureUnit: {
    fontSize: fs(12),
    paddingLeft: 4,
  } as TextStyle,
  storySection: {
    gap: 0,
  } as ViewStyle,
  storyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  } as ViewStyle,
  storyHeadLabel: {
    fontFamily: font.serif,
    fontSize: fs(14),
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  voiceHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 2,
  } as ViewStyle,
  voiceLabel: {
    fontSize: fs(12),
    color: '#2F6FD0',
    fontWeight: '500',
  } as TextStyle,
  storyBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(116,136,151,0.5)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
  } as ViewStyle,
  storyInput: {
    fontSize: fs(13.5),
    lineHeight: 22,
    minHeight: 96,
    textAlignVertical: 'top',
    paddingVertical: 0,
  } as TextStyle,
  voiceHint: {
    fontSize: fs(11.5),
    marginTop: 6,
  } as TextStyle,
  // 底部双钮（冻结稿：等宽胶囊，取消白底 + 保存蓝色渐变）
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: CARD_PAD + 2,
    paddingTop: 14,
  } as ViewStyle,
  editActionHit: {
    flex: 1,
  } as ViewStyle,
  cancelButton: {
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(11,45,75,0.14)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  } as ViewStyle,
  cancelText: {
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
  saveButton: {
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  saveButtonDisabled: {
    backgroundColor: 'rgba(116,136,151,0.35)',
  } as ViewStyle,
  saveGradient: {
    ...StyleSheet.absoluteFillObject,
  } as ViewStyle,
  saveText: {
    fontSize: fs(14),
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1,
  } as TextStyle,
});
