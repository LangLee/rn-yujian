import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../icons/AppIcon';
import { PressableScale } from '../ui/PressableScale';
import { RemoteImage } from '../RemoteImage';
import { FishGlyph } from '../ui/FishGlyph';
import { palette } from '../../constants/colors';
import { font, fs } from '../../constants/tokens';
import { coreColors } from '../../constants/coreUi';
import {
  locationService,
  PlaceSearchItem,
} from '../../services/locationService';
import type { CatchLocation } from '../../types/models';

/**
 * Recognition Result 共享组件库（冻结设计包 V1 + 关键帧 05-09 逐像素还原）：
 *   · design/pages/recognition/design/0{5,6,7,8,9}_*_Frozen.png（PNG 为最终权威）
 *   · engineering/Recognition_Result_Layout_Geometry_V1.md（360×640 规范 + 宽高自适应）
 *   · engineering/Recognition_Result_Candidate_Card_V1.md（候选卡状态模型）
 *   · media/Recognition_Result_Hero_Media_Contract_V1.md（Hero 媒体映射）
 *
 * 行输入/按钮冻结色均为关键帧像素取样：深藏青标签 #1E3A6E、按钮字 #253765、
 * 占位 #9AA7B8、金描边 #F1C455、感言标签 #7688AB、语音胶囊描边 #B2BED7。
 * 结果页不继承处理页任何 AI 光效；视觉基调自然、安静、纪实。
 */

/** 冻结常量（Layout Geometry V1 §2）：内容边距 20dp、Hero 320×248dp @360dp 宽 */
export const RESULT_MARGIN = 20;
export const HERO_ASPECT = 1.2903;
export const heroHeightFor = (width: number): number =>
  Math.round(width / HERO_ASPECT);

/** 候选选中冻结青（Candidate Card V1 §4：2dp #0F7A78 + ~8% 青色 tint；无金色） */
const TEAL = '#0F7A78';
const TEAL_SUGGEST_BORDER = 'rgba(15,122,120,0.28)';
const TEAL_TINT = 'rgba(15,122,120,0.08)';
/** GLASS_A 主内容面（Fit 支撑面 / 卡面） */
const GLASS_A = 'rgba(255,255,255,0.78)';
const GLASS_A_LIGHT = 'rgba(255,255,255,0.66)';
const HAIRLINE = 'rgba(11,45,75,0.10)';
const TEXT_PRIMARY = coreColors.deepLakeBlue;
const TEXT_SECONDARY = coreColors.lakeBlue;
const TEXT_MUTED = coreColors.mistBlueGray;
/** 行输入 / 按钮冻结色（关键帧 05/07/08 像素取样） */
const ROW_NAVY = '#1E3A6E';
const ROW_PLACEHOLDER = '#9AA7B8';
const NOTE_LABEL = '#7688AB';
const MIC_BORDER = '#B2BED7';

export interface HeroBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ResultHeroViewport —— Hero 媒体映射（Hero Media Contract V1）
 *
 * High/Medium/Low = Subject First：可信 bbox → SUBJECT_CROP_FILL
 * （FishSafeRect = bbox 外扩 14% 横 / 18% 竖，最小纵横比匹配裁剪，源内平移，
 * 12dp 视觉安全内衬），任一硬性检查不过 → 宽度铺满退化（图片水平占满卡片，
 * 竖向居中裁剪，不留左右支撑面）。
 * No Fish / Image Quality = Cover Fill：等比铺满卡片、居中裁剪。
 * （原 Evidence Contain 会在竖版照片两侧留大片支撑面，产品决定改为铺满。）
 * 未覆盖区域一律 GLASS_A 支撑面（禁止模糊放大照片填充）。
 * ──────────────────────────────────────────────────────────────────────────── */
interface HeroLayout {
  /** 显示尺寸缩放后的整图尺寸 */
  imgW: number;
  imgH: number;
  /** 图相对视口左上角偏移 */
  left: number;
  top: number;
}

function computeHeroLayout(
  srcW: number,
  srcH: number,
  viewW: number,
  viewH: number,
  bbox: HeroBBox | null,
  mode: 'subject' | 'evidence' | 'cover'
): HeroLayout {
  if (!srcW || !srcH) {
    return { imgW: viewW, imgH: viewH, left: 0, top: 0 };
  }
  // Evidence：完整源图 Contain 居中（保留证据用）
  const fit = (): HeroLayout => {
    const k = Math.min(viewW / srcW, viewH / srcH);
    const imgW = srcW * k;
    const imgH = srcH * k;
    return { imgW, imgH, left: (viewW - imgW) / 2, top: (viewH - imgH) / 2 };
  };
  // Cover：等比铺满卡片、居中裁剪（失败页证据卡按产品决定铺满展示）
  const cover = (): HeroLayout => {
    const k = Math.max(viewW / srcW, viewH / srcH);
    const imgW = srcW * k;
    const imgH = srcH * k;
    return { imgW, imgH, left: (viewW - imgW) / 2, top: (viewH - imgH) / 2 };
  };
  // Subject 退化展示：图片水平占满卡片 —— 按宽度等比铺满，竖向居中裁剪
  const fillWidth = (): HeroLayout => {
    const k = viewW / srcW;
    const imgH = srcH * k;
    return { imgW: viewW, imgH, left: 0, top: (viewH - imgH) / 2 };
  };
  if (mode === 'evidence') {
    return fit();
  }
  if (mode === 'cover') {
    return cover();
  }
  if (!bbox) {
    return fillWidth();
  }
  // 可信性检查（Contract §7）
  const finite =
    Number.isFinite(bbox.x1) &&
    Number.isFinite(bbox.y1) &&
    Number.isFinite(bbox.x2) &&
    Number.isFinite(bbox.y2);
  const bw = bbox.x2 - bbox.x1;
  const bh = bbox.y2 - bbox.y1;
  if (!finite || bw <= 0 || bh <= 0) {
    return fillWidth();
  }
  // FishSafeRect：+14% 横 / +18% 竖，钳回源内（Contract §8）
  const padX = bw * 0.14;
  const padY = bh * 0.18;
  const fsX1 = Math.max(0, bbox.x1 - padX);
  const fsY1 = Math.max(0, bbox.y1 - padY);
  const fsX2 = Math.min(1, bbox.x2 + padX);
  const fsY2 = Math.min(1, bbox.y2 + padY);
  const fsw = fsX2 - fsX1;
  const fsh = fsY2 - fsY1;
  if (fsw <= 0 || fsh <= 0) {
    return fillWidth();
  }
  // 源边保护（Contract §9）：bbox 边贴住源边 → 该侧不得再向内裁
  const clippedL = bbox.x1 <= 0.02;
  const clippedR = bbox.x2 >= 0.98;
  const clippedT = bbox.y1 <= 0.02;
  const clippedB = bbox.y2 >= 0.98;
  // 最小纵横比匹配裁剪（Contract §10 Step3）：完全包含 FishSafeRect 的最小 HeroAspect 矩形
  const safePx = {
    x: fsX1 * srcW,
    y: fsY1 * srcH,
    w: fsw * srcW,
    h: fsh * srcH,
  };
  let cropW: number;
  let cropH: number;
  if (safePx.w / safePx.h > HERO_ASPECT) {
    cropW = safePx.w;
    cropH = safePx.w / HERO_ASPECT;
  } else {
    cropH = safePx.h;
    cropW = safePx.h * HERO_ASPECT;
  }
  // 12dp 安全内衬（Step4）：视口内再留 12dp 后 FishSafeRect 仍需完整可见 →
  // 等价于把目标区域按 (viewW-24)/(viewH-24) 的更严纵横比扩一档
  const insetAspect = (viewW - 24) / (viewH - 24);
  if (safePx.w / safePx.h > insetAspect) {
    const insetW = safePx.w / ((viewW - 24) / viewW);
    cropW = Math.max(cropW, insetW);
    cropH = cropW / HERO_ASPECT;
  } else {
    const insetH = safePx.h / ((viewH - 24) / viewH);
    cropH = Math.max(cropH, insetH);
    cropW = cropH * HERO_ASPECT;
  }
  if (cropW > srcW || cropH > srcH) {
    // 裁剪矩形超出源尺寸且贴边保护不允许外扩 → 水平占满退化
    if (
      clippedL ||
      clippedR ||
      clippedT ||
      clippedB ||
      cropW > srcW * 1.0001 ||
      cropH > srcH * 1.0001
    ) {
      return fillWidth();
    }
  }
  // 源内平移（Step5）：先包住 FishSafeRect，再向可用像素侧移动
  let cx = safePx.x + safePx.w / 2 - cropW / 2;
  let cy = safePx.y + safePx.h / 2 - cropH / 2;
  cx = Math.min(Math.max(cx, 0), Math.max(0, srcW - cropW));
  cy = Math.min(Math.max(cy, 0), Math.max(0, srcH - cropH));
  // 贴边保护：贴边侧对齐源边（不再向内裁）
  if (clippedL) {
    cx = 0;
  }
  if (clippedR) {
    cx = srcW - cropW;
  }
  if (clippedT) {
    cy = 0;
  }
  if (clippedB) {
    cy = srcH - cropH;
  }
  // 最终校验：FishSafeRect 必须完整落在裁剪矩形内（硬门 100%）
  if (
    cx > safePx.x ||
    cy > safePx.y ||
    cx + cropW < safePx.x + safePx.w ||
    cy + cropH < safePx.y + safePx.h
  ) {
    return fillWidth();
  }
  const k = viewW / cropW;
  return {
    imgW: srcW * k,
    imgH: srcH * k,
    left: -cx * k,
    top: -cy * k,
  };
}

interface ResultHeroViewportProps {
  uri: string | null;
  /** 检测 bbox（归一化源坐标；仅 High/Medium/Low 主体优先用） */
  bbox?: HeroBBox | null;
  mode?: 'subject' | 'evidence' | 'cover';
  width: number;
  radius?: number;
  accessibilityLabel?: string;
}

export const ResultHeroViewport: React.FC<ResultHeroViewportProps> = ({
  uri,
  bbox,
  mode = 'subject',
  width,
  radius = 22,
  accessibilityLabel,
}) => {
  const height = heroHeightFor(width);
  const [src, setSrc] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!uri) {
      return;
    }
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (alive) {
          setSrc({ w, h });
        }
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  const layout = useMemo(
    () =>
      computeHeroLayout(
        src?.w ?? 0,
        src?.h ?? 0,
        width,
        height,
        bbox ?? null,
        mode
      ),
    [src, width, height, bbox, mode]
  );

  return (
    <View
      style={[styles.hero, { width, height, borderRadius: radius }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            position: 'absolute',
            left: layout.left,
            top: layout.top,
            width: layout.imgW,
            height: layout.imgH,
          }}
          resizeMode="stretch"
        />
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <FishGlyph size={64} color={palette.fishMint} />
        </View>
      )}
    </View>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * ResultCandidateRow —— 中置信度横向候选卡（Candidate Card V1）
 * 2-3 张；Default / Suggested(仅 Top-1，1dp 青 28% 边，弱于选中) / Selected
 * (2dp #0F7A78 + 8% tint，用户点选专属)。无金色、无百分比、无自动选中。
 * ──────────────────────────────────────────────────────────────────────────── */
export interface CandidateItem {
  key: string;
  name: string;
  cover?: string;
}

interface ResultCandidateRowProps {
  candidates: CandidateItem[];
  selectedKey: string;
  suggestedKey?: string;
  onSelect: (item: CandidateItem) => void;
  contentWidth: number;
}

export const ResultCandidateRow: React.FC<ResultCandidateRowProps> = ({
  candidates,
  selectedKey,
  suggestedKey,
  onSelect,
  contentWidth,
}) => {
  const two = candidates.length === 2;
  // 卡宽：(contentWidth - 16) / 3，钳 88-116；2 张时 ≤136 居中（Candidate Card V1 §2）
  const cardW = two
    ? Math.min(136, (contentWidth - 8) / 2)
    : Math.min(116, Math.max(88, (contentWidth - 16) / 3));
  return (
    <View style={[styles.candidateRow, two && { justifyContent: 'center' }]}>
      {candidates.slice(0, 3).map((c) => {
        const selected = selectedKey === c.key;
        const suggested = !selected && suggestedKey === c.key;
        return (
          <PressableScale
            key={c.key}
            scaleTo={0.985}
            onPress={() => onSelect(c)}
            accessibilityLabel={`${c.name}${suggested ? '，模型建议' : ''}${
              selected ? '，已选择' : ''
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View
              style={[
                styles.candidateCard,
                { width: cardW },
                suggested && styles.candidateSuggested,
                selected && styles.candidateSelected,
              ]}
            >
              <View style={styles.candidateMedia}>
                {c.cover ? (
                  <RemoteImage
                    url={c.cover}
                    style={styles.candidateImg}
                    resizeMode="contain"
                  />
                ) : (
                  <FishGlyph
                    size={30}
                    color={selected ? TEAL : palette.fishGreen}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.candidateLabel,
                  selected && { color: TEXT_PRIMARY },
                ]}
                numberOfLines={1}
              >
                {c.name}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * ResultFieldRows —— 行输入卡（关键帧 05/06/07：纵向三行）
 * 深蓝图标 + 衬线标签 + 右对齐值 + ›；三行整行触达：长度/重量弹数值输入
 * Sheet（输入框内带单位，提交后行内展示值+单位），地点开地点编辑 Sheet；
 * 行间 1dp 低对比细分割线；无金色。
 * ──────────────────────────────────────────────────────────────────────────── */
export interface FieldRowsValues {
  lengthText: string;
  weightText: string;
  locationLabel: string | null;
  locating?: boolean;
}

interface ResultFieldRowsProps extends FieldRowsValues {
  onEditLength: () => void;
  onEditWeight: () => void;
  onEditLocation: () => void;
}

export const ResultFieldRows: React.FC<ResultFieldRowsProps> = ({
  lengthText,
  weightText,
  locationLabel,
  locating,
  onEditLength,
  onEditWeight,
  onEditLocation,
}) => {
  /** 值+单位（空值显示占位）；单位作为值的后缀展示，不入值 */
  const measureValue = (text: string, unit: string) =>
    text ? (
      <Text style={styles.fieldValue} numberOfLines={1}>
        {text}
        <Text style={styles.fieldUnit}>{` ${unit}`}</Text>
      </Text>
    ) : (
      <Text style={[styles.fieldValue, styles.fieldBlank]} numberOfLines={1}>
        请输入
      </Text>
    );

  return (
    <View style={styles.fieldCard}>
      <Pressable
        style={styles.fieldRow}
        onPress={onEditLength}
        accessibilityLabel="长度字段，点按输入长度"
        accessibilityRole="button"
      >
        <AppIcon name="length" size={19} color={ROW_NAVY} />
        <Text style={styles.fieldLabel}>长度</Text>
        {measureValue(lengthText, 'cm')}
        <AppIcon name="chevron_right" size={15} color={ROW_PLACEHOLDER} />
      </Pressable>
      <View style={styles.fieldDivider} />
      <Pressable
        style={styles.fieldRow}
        onPress={onEditWeight}
        accessibilityLabel="重量字段，点按输入重量"
        accessibilityRole="button"
      >
        <AppIcon name="weight" size={19} color={ROW_NAVY} />
        <Text style={styles.fieldLabel}>重量</Text>
        {measureValue(weightText, 'kg')}
        <AppIcon name="chevron_right" size={15} color={ROW_PLACEHOLDER} />
      </Pressable>
      <View style={styles.fieldDivider} />
      <Pressable
        style={styles.fieldRow}
        onPress={onEditLocation}
        accessibilityLabel="地点字段，点按选择地点"
        accessibilityRole="button"
      >
        <AppIcon name="location" size={19} color={ROW_NAVY} />
        <Text style={styles.fieldLabel}>地点</Text>
        <Text
          style={[
            styles.fieldValue,
            !locationLabel && !locating && styles.fieldBlank,
          ]}
          numberOfLines={1}
        >
          {locating ? '正在获取位置…' : locationLabel ?? '请输入'}
        </Text>
        <AppIcon name="chevron_right" size={15} color={ROW_PLACEHOLDER} />
      </Pressable>
    </View>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * ResultNoteCard —— 感言卡（关键帧 05）：写下这次鱼获的故事 +
 * 语音录入胶囊（冻结视觉位）+ 记录这一刻的感受…… + 0/300 计数。
 * ──────────────────────────────────────────────────────────────────────────── */
export const ResultNoteCard: React.FC<{
  value: string;
  onChange: (text: string) => void;
}> = ({ value, onChange }) => (
  <View style={styles.noteCard}>
    <View style={styles.noteHead}>
      <Text style={styles.noteTitle}>写下这次鱼获的故事</Text>
      {/* 语音能力未接入：按冻结稿保留纯视觉胶囊位，不提供空操作控件 */}
      <View style={styles.micPill}>
        <AppIcon name="voice" size={12} color={NOTE_LABEL} />
        <Text style={styles.micPillText}>语音录入</Text>
      </View>
    </View>
    <TextInput
      style={styles.noteArea}
      value={value}
      onChangeText={onChange}
      placeholder="记录这一刻的感受……"
      placeholderTextColor={ROW_PLACEHOLDER}
      multiline
      maxLength={300}
      accessibilityLabel="鱼获感言输入框"
    />
    <Text style={styles.noteCounter}>{value.length}/300</Text>
  </View>
);


/* ────────────────────────────────────────────────────────────────────────────
 * 底部编辑 Sheet 家族（Metadata Edit Flow V1）：顶圆角 28dp、24dp 水平内边距、
 * 中性拖拽把手、Scrim 压暗、完成/清除共享文本动作；编辑永不离开结果页。
 * ──────────────────────────────────────────────────────────────────────────── */
const SheetShell: React.FC<{
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ visible, onClose, children }) => {
  const insets = useSafeAreaInsets();
  /* Android：edge-to-edge Modal 里 KAV 收起键盘后 padding 归零不可靠，会残留
     底部间隙——改为手动监听 keyboardDidShow/Hide，用键盘高度精确抬升、精确归零
     （与 KeyboardAvoidingScrollView 同一方案）；iOS 保持 KAV 原生行为 */
  const [kbLift, setKbLift] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKbLift(e.endCoordinates?.height ?? 0)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (!visible) {
    return null;
  }
  const sheetBody = (
    <Pressable
      style={[styles.sheetBody, { paddingBottom: insets.bottom + 24 }]}
      onPress={(e) => e.stopPropagation()}
    >
      <View style={styles.sheetHandle} />
      {children}
    </Pressable>
  );
  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.sheetAvoid}
            pointerEvents="box-none"
          >
            {sheetBody}
          </KeyboardAvoidingView>
        ) : (
          <View
            style={[
              styles.sheetAvoid,
              kbLift > 0 ? { paddingBottom: kbLift } : null,
            ]}
            pointerEvents="box-none"
          >
            {sheetBody}
          </View>
        )}
      </Pressable>
    </Modal>
  );
};

/** 地点编辑 Sheet（搜索 / 当前位置 / 最近使用，点选即提交并关闭） */
export const ResultLocationSheet: React.FC<{
  visible: boolean;
  currentLabel: string | null;
  onClose: () => void;
  onCommit: (place: CatchLocation) => void;
  onClear: () => void;
}> = ({ visible, currentLabel, onClose, onCommit, onClear }) => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<
    | 'recent'
    | 'searching'
    | 'results'
    | 'empty'
    | 'error'
    | 'locating'
    | 'denied'
  >('recent');
  const [results, setResults] = useState<PlaceSearchItem[]>([]);
  const [recent, setRecent] = useState<PlaceSearchItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setState('recent');
      setResults([]);
      void locationService.getRecentPlaces().then(setRecent);
    }
  }, [visible]);

  // 300ms 防抖搜索（Edit Flow §8：查询只搜不写结果字段）
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const q = query.trim();
    if (!q) {
      setState('recent');
      setResults([]);
      return undefined;
    }
    setState('searching');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await locationService.searchPlaces(q);
          setResults(found);
          setState(found.length > 0 ? 'results' : 'empty');
        } catch {
          setState('error');
        }
      })();
    }, 300);
    debounceRef.current = timer;
    return () => clearTimeout(timer);
  }, [query, visible]);

  const commitPlace = (item: PlaceSearchItem) => {
    locationService.pushRecentPlace(item);
    onCommit({
      latitude: item.latitude,
      longitude: item.longitude,
      label: item.name,
      precision: 'precise',
    });
    onClose();
  };

  const useCurrent = useCallback(async () => {
    hapticLight();
    setState('locating');
    let status = await locationService.getPermissionStatus();
    if (status !== 'granted') {
      status = await locationService.requestPermission();
    }
    if (status !== 'granted') {
      setState('denied');
      return;
    }
    const loc = await locationService.resolveCurrentLocation('precise');
    if (loc) {
      onCommit(loc);
      locationService.pushRecentPlace({
        id: `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`,
        name: loc.label,
        detail: '',
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      onClose();
    } else {
      setState('error');
    }
  }, [onCommit, onClose]);

  const row = (item: PlaceSearchItem, key: string) => (
    <Pressable
      key={key}
      style={styles.placeRow}
      onPress={() => commitPlace(item)}
      accessibilityLabel={`${item.name}，${item.detail}`}
      accessibilityRole="button"
    >
      <AppIcon name="location" size={16} color={TEAL} />
      <View style={styles.placeTexts}>
        <Text style={styles.placeName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.detail ? (
          <Text style={styles.placeDetail} numberOfLines={1}>
            {item.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>鱼获地点</Text>
      <View style={styles.searchField}>
        <AppIcon name="search" size={15} color={TEXT_MUTED} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索地点（如：千岛湖、富春江）"
          placeholderTextColor={TEXT_MUTED}
          returnKeyType="search"
          maxLength={40}
          accessibilityLabel="搜索地点"
        />
        {query ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityLabel="清除搜索词"
            accessibilityRole="button"
          >
            <AppIcon name="close" size={15} color={TEXT_MUTED} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={styles.placeList} keyboardShouldPersistTaps="handled">
        <Pressable
          style={styles.currentRow}
          onPress={() => void useCurrent()}
          accessibilityLabel="使用当前位置"
          accessibilityRole="button"
        >
          <AppIcon name="location" size={17} color={TEAL} />
          <Text style={styles.currentText}>使用当前位置</Text>
          {state === 'locating' ? (
            <ActivityIndicator size="small" color={TEAL} />
          ) : null}
        </Pressable>
        {state === 'searching' ? (
          <View style={styles.listStateWrap}>
            <ActivityIndicator size="small" color={TEXT_MUTED} />
          </View>
        ) : null}
        {state === 'empty' ? (
          <Text style={styles.listStateText}>没有找到相关地点</Text>
        ) : null}
        {state === 'error' ? (
          <Text style={styles.listStateText}>地点搜索暂不可用，请稍后重试</Text>
        ) : null}
        {state === 'denied' ? (
          <Text style={styles.listStateText}>未授权定位，可以继续搜索地点</Text>
        ) : null}
        {state === 'results' ? results.map((r) => row(r, r.id)) : null}
        {state === 'recent' && recent.length > 0 ? (
          <View>
            <View style={styles.recentHead}>
              <Text style={styles.recentTitle}>最近使用</Text>
              <Pressable
                onPress={() => {
                  locationService.clearRecentPlaces();
                  setRecent([]);
                }}
                accessibilityLabel="清除最近使用"
                accessibilityRole="button"
              >
                <Text style={styles.recentClear}>清除</Text>
              </Pressable>
            </View>
            {recent.map((r) => row(r, `recent-${r.id}`))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.sheetActions}>
        {currentLabel ? (
          <Pressable
            onPress={() => {
              onClear();
              onClose();
            }}
            style={styles.sheetTextAction}
            accessibilityRole="button"
          >
            <Text style={styles.sheetTextMuted}>清除</Text>
          </Pressable>
        ) : (
          <View style={styles.sheetTextAction} />
        )}
        <Pressable
          onPress={onClose}
          style={styles.sheetTextAction}
          accessibilityRole="button"
        >
          <Text style={styles.sheetTextNormal}>完成</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
};

/** 极轻触感（当前位置行点选；结果页无庆祝动效，Motion Spec V1） */
function hapticLight() {
  // 触感由页面层统一管理；此处保持无操作避免引入循环依赖
}

/* ────────────────────────────────────────────────────────────────────────────
 * ResultMeasureSheet —— 长度/重量数值输入 Sheet（Metadata Edit Flow V1）
 * 输入框内右侧固定单位（cm/kg，单位不入值）；空值=清除；非法非空值行内
 * 提示并禁用完成（元数据可选，不弹错打断）；提交后行内展示值+单位。
 * ──────────────────────────────────────────────────────────────────────────── */

/** 行文本校验（与保存契约一致）：长度 0.1-999.9（≤1 位小数）/ 重量 0.01-999.99（≤2 位小数） */
export function isValidMeasureText(
  kind: 'length' | 'weight',
  text: string
): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return false;
  }
  const dec = t.includes('.') ? t.split('.')[1].length : 0;
  return kind === 'length'
    ? n >= 0.1 && n <= 999.9 && dec <= 1
    : n >= 0.01 && n <= 999.99 && dec <= 2;
}

/** decimal-pad 可能带出逗号/多个小数点：只留数字与首个小数点 */
function sanitizeMeasureText(t: string): string {
  const s = t.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  return dot < 0
    ? s
    : `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`;
}

const MEASURE_META: Record<
  'length' | 'weight',
  { title: string; unit: string; hint: string; error: string }
> = {
  length: {
    title: '鱼获长度',
    unit: 'cm',
    hint: '范围 0.1 – 999.9 cm，最多 1 位小数',
    error: '请输入 0.1 – 999.9 之间的数值，最多 1 位小数',
  },
  weight: {
    title: '鱼获重量',
    unit: 'kg',
    hint: '范围 0.01 – 999.99 kg，最多 2 位小数',
    error: '请输入 0.01 – 999.99 之间的数值，最多 2 位小数',
  },
};

export const ResultMeasureSheet: React.FC<{
  visible: boolean;
  kind: 'length' | 'weight';
  value: string;
  onClose: () => void;
  /** 仅回传合法值或空串（清除）；非法非空值由 Sheet 内提示拦截 */
  onCommit: (text: string) => void;
}> = ({ visible, kind, value, onClose, onCommit }) => {
  const meta = MEASURE_META[kind];
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (visible) {
      setDraft(value);
      // autoFocus 在 Modal slide 入场动画中常被 Android 吃掉：延迟到动画基本
      // 结束后再聚焦，保证抽屉弹出即拉起键盘
      const timer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, value]);
  const trimmed = draft.trim();
  const invalid = Boolean(trimmed) && !isValidMeasureText(kind, trimmed);
  const commit = () => {
    if (invalid) {
      return;
    }
    onCommit(trimmed);
    onClose();
  };
  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>{meta.title}</Text>
      <View style={styles.measureBox}>
        <TextInput
          ref={inputRef}
          style={styles.measureInput}
          value={draft}
          onChangeText={(t) => setDraft(sanitizeMeasureText(t))}
          keyboardType="decimal-pad"
          maxLength={8}
          autoFocus
          placeholder="0"
          placeholderTextColor={ROW_PLACEHOLDER}
          returnKeyType="done"
          onSubmitEditing={commit}
          accessibilityLabel={`${meta.title}输入框，单位${meta.unit}`}
        />
        <Text style={styles.measureUnit}>{meta.unit}</Text>
      </View>
      <Text style={invalid ? styles.measureError : styles.measureHint}>
        {invalid ? meta.error : meta.hint}
      </Text>
      <View style={styles.sheetActions}>
        {value ? (
          <Pressable
            onPress={() => {
              onCommit('');
              onClose();
            }}
            style={styles.sheetTextAction}
            accessibilityRole="button"
            accessibilityLabel="清除数值"
          >
            <Text style={styles.sheetTextMuted}>清除</Text>
          </Pressable>
        ) : (
          <View style={styles.sheetTextAction} />
        )}
        {invalid ? (
          <View style={styles.sheetTextAction}>
            <Text style={styles.sheetTextDisabled}>完成</Text>
          </View>
        ) : (
          <Pressable
            onPress={commit}
            style={styles.sheetTextAction}
            accessibilityRole="button"
          >
            <Text style={styles.sheetTextNormal}>完成</Text>
          </Pressable>
        )}
      </View>
    </SheetShell>
  );
};

const styles = StyleSheet.create({
  /* Hero */
  hero: {
    overflow: 'hidden',
    backgroundColor: GLASS_A_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  /* 候选卡 */
  candidateRow: {
    flexDirection: 'row',
    gap: 8,
  } as ViewStyle,
  candidateCard: {
    height: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(11,45,75,0.10)',
    backgroundColor: GLASS_A_LIGHT,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  } as ViewStyle,
  candidateSuggested: {
    borderColor: TEAL_SUGGEST_BORDER,
  } as ViewStyle,
  candidateSelected: {
    borderWidth: 2,
    borderColor: TEAL,
    backgroundColor: TEAL_TINT,
  } as ViewStyle,
  candidateMedia: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  candidateImg: {
    width: 48,
    height: 48,
    borderRadius: 8,
  } as ImageStyle,
  candidateLabel: {
    fontSize: fs(14),
    lineHeight: fs(20),
    fontWeight: '500',
    color: TEXT_PRIMARY,
    alignSelf: 'stretch',
    textAlign: 'center',
  } as TextStyle,
  /* 行输入卡（关键帧 05/06/07） */
  fieldCard: {
    borderRadius: 16,
    backgroundColor: GLASS_A,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  } as ViewStyle,
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
  } as ViewStyle,
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: HAIRLINE,
    marginHorizontal: 16,
  } as ViewStyle,
  fieldLabel: {
    fontFamily: font.serif,
    fontSize: fs(15),
    lineHeight: fs(20),
    fontWeight: '700',
    color: ROW_NAVY,
    letterSpacing: 1,
  } as TextStyle,
  fieldValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fs(15),
    lineHeight: fs(20),
    fontWeight: '600',
    color: ROW_NAVY,
  } as TextStyle,
  fieldBlank: {
    color: ROW_PLACEHOLDER,
    fontWeight: '400',
  } as TextStyle,
  /* 行内值的单位后缀（提交后展示；单位不入值） */
  fieldUnit: {
    fontSize: fs(12),
    fontWeight: '500',
    color: NOTE_LABEL,
    letterSpacing: 0.5,
  } as TextStyle,
  /* 感言卡（关键帧 05） */
  noteCard: {
    borderRadius: 16,
    backgroundColor: GLASS_A,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  } as ViewStyle,
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  } as ViewStyle,
  noteTitle: {
    fontSize: fs(13),
    lineHeight: fs(18),
    fontWeight: '600',
    letterSpacing: 1,
    color: NOTE_LABEL,
  } as TextStyle,
  micPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: MIC_BORDER,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 9,
    paddingVertical: 3,
  } as ViewStyle,
  micPillText: {
    fontSize: fs(11),
    lineHeight: fs(14),
    color: NOTE_LABEL,
    letterSpacing: 1,
  } as TextStyle,
  noteArea: {
    minHeight: 60,
    fontSize: fs(14),
    lineHeight: fs(21),
    color: TEXT_PRIMARY,
    paddingVertical: 0,
    textAlignVertical: 'top',
  } as TextStyle,
  noteCounter: {
    alignSelf: 'flex-end',
    fontSize: fs(11),
    lineHeight: fs(14),
    color: ROW_PLACEHOLDER,
    marginTop: 2,
  } as TextStyle,
  /* Sheet */
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,24,30,0.40)',
    justifyContent: 'flex-end',
  } as ViewStyle,
  sheetAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  } as ViewStyle,
  sheetBody: {
    backgroundColor: '#FBFDFE',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    /* 键盘弹出时可用高度变小，限制 Sheet 高度让结果列表收缩而不是溢出屏幕 */
    maxHeight: '78%',
  } as ViewStyle,
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(11,45,75,0.14)',
    marginBottom: 14,
  } as ViewStyle,
  sheetTitle: {
    textAlign: 'center',
    fontSize: fs(17),
    lineHeight: fs(24),
    fontWeight: '600',
    color: TEXT_PRIMARY,
    letterSpacing: 2,
  } as TextStyle,
  sheetError: {
    marginTop: 8,
    fontSize: fs(12),
    color: palette.qualityInvalid,
  } as TextStyle,
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  } as ViewStyle,
  sheetTextAction: {
    minWidth: 64,
    paddingVertical: 10,
    alignItems: 'center',
  } as ViewStyle,
  sheetTextMuted: {
    fontSize: fs(14),
    color: TEXT_MUTED,
    letterSpacing: 2,
  } as TextStyle,
  sheetTextNormal: {
    fontSize: fs(15),
    color: TEAL,
    fontWeight: '600',
    letterSpacing: 2,
  } as TextStyle,
  /* 非法非空值时完成禁用（保持动作位布局稳定） */
  sheetTextDisabled: {
    fontSize: fs(15),
    color: ROW_PLACEHOLDER,
    fontWeight: '600',
    letterSpacing: 2,
  } as TextStyle,
  /* 长度/重量数值输入 Sheet：实底输入框 + 框内固定单位 */
  measureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 58,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  } as ViewStyle,
  measureInput: {
    minWidth: 140,
    textAlign: 'center',
    fontSize: fs(22),
    fontWeight: '600',
    color: TEXT_PRIMARY,
    paddingVertical: 0,
    includeFontPadding: false,
  } as TextStyle,
  measureUnit: {
    fontSize: fs(15),
    fontWeight: '600',
    color: NOTE_LABEL,
    letterSpacing: 1,
  } as TextStyle,
  measureHint: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: fs(12),
    color: TEXT_MUTED,
    letterSpacing: 0.5,
  } as TextStyle,
  measureError: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: fs(12),
    color: palette.qualityInvalid,
    letterSpacing: 0.5,
  } as TextStyle,
  /* 地点 */
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: 'rgba(52,85,111,0.04)',
    paddingHorizontal: 14,
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: fs(14),
    color: TEXT_PRIMARY,
    paddingVertical: 0,
  } as TextStyle,
  placeList: {
    marginTop: 8,
    maxHeight: 260,
    flexGrow: 0,
    /* Sheet 高度被 maxHeight 限制时先收缩结果列表，保住搜索框在键盘上方 */
    flexShrink: 1,
  } as ViewStyle,
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HAIRLINE,
  } as ViewStyle,
  currentText: {
    flex: 1,
    fontSize: fs(15),
    fontWeight: '600',
    color: TEAL,
    letterSpacing: 1,
  } as TextStyle,
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  } as ViewStyle,
  placeTexts: {
    flex: 1,
  } as ViewStyle,
  placeName: {
    fontSize: fs(15),
    color: TEXT_PRIMARY,
    fontWeight: '500',
  } as TextStyle,
  placeDetail: {
    fontSize: fs(12),
    color: TEXT_MUTED,
    marginTop: 2,
  } as TextStyle,
  listStateWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  } as ViewStyle,
  listStateText: {
    paddingVertical: 16,
    textAlign: 'center',
    fontSize: fs(13),
    color: TEXT_MUTED,
  } as TextStyle,
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  } as ViewStyle,
  recentTitle: {
    fontSize: fs(12),
    color: TEXT_SECONDARY,
    letterSpacing: 2,
  } as TextStyle,
  recentClear: {
    fontSize: fs(12),
    color: TEXT_MUTED,
  } as TextStyle,
});
