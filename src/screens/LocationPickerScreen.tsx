import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageStyle,
  Keyboard,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { usePreferences } from '../contexts/PreferencesContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  PlaceSearchItem,
  buildConcreteAddress,
  formatCoordLabel,
  locationService,
} from '../services/locationService';
import { yujianLocation } from '../native/yujianLocation';
import { locationPickerHub } from '../utils/locationPickerHub';
import { PressableScale } from '../components/ui/PressableScale';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { font, fs, radius, spacing } from '../constants/tokens';
import {
  TILE_SIZE,
  latToTileY,
  lonToTileX,
  tileXToLon,
  tileYToLat,
} from '../utils/tileMath';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../utils/coordSys';
import { haptics } from '../utils/haptics';

type PickerNavigationProp = StackNavigationProp<RootStackParamList, 'LocationPicker'>;
type PickerRouteProp = RouteProp<RootStackParamList, 'LocationPicker'>;

const GOLD = '#D6A541';
/** 中心四周各补 2 张瓦片（5x5），覆盖一次拖动不重排的行程 */
const TILE_RADIUS = 2;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
/** 无初始坐标时的默认视图（中国地理中心） */
const DEFAULT_CENTER = { latitude: 34.0, longitude: 108.0 };
const DEFAULT_ZOOM = 4;
/** 圆形图标操作按钮直径 */
const ROUND_BTN = 44;

/**
 * 地图选点页（全屏地图）：
 * - 高德瓦片全屏铺满（国内可达 + 中文标注，免 Key），无背景装饰与顶栏；
 * - 左上角圆形关闭、右上角搜索按钮（点击在原位向左平滑延展成搜索条）；
 * - 右侧图标化操作列：放大 / 缩小 / 回到当前位置；
 * - 中心金色十字即所选钓点，底部浮卡展示具体地址 + 坐标并确认回传。
 * 高德瓦片为 GCJ-02：内部 center 统一 WGS-84（与存储一致），显示转换、拖动结算逆转换。
 * 离线时瓦片与地名编码失败均静默降级（坐标仍可选）。
 */
export const LocationPickerScreen: React.FC = () => {
  const navigation = useNavigation<PickerNavigationProp>();
  const route = useRoute<PickerRouteProp>();
  const { profile } = useTheme();
  const { privacy } = usePreferences();
  const insets = useSafeAreaInsets();

  /** 手动选点保留记录精度口径作为元数据（展示一律具体地址） */
  const labelPrecision = privacy.recordPrecision === 'waterbody_county'
    ? ('waterbody_county' as const)
    : ('precise' as const);

  const initial = route.params?.initial;
  const [center, setCenter] = useState({
    latitude: initial?.latitude ?? DEFAULT_CENTER.latitude,
    longitude: initial?.longitude ?? DEFAULT_CENTER.longitude,
  });
  const [zoom, setZoom] = useState(initial ? 15 : DEFAULT_ZOOM);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  const [previewAddress, setPreviewAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  /** 瓦片加载阶段：idle 显示加载中，error 显示离线提示（缩放后重新探测） */
  const [tilePhase, setTilePhase] = useState<'idle' | 'shown' | 'error'>('idle');

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PlaceSearchItem[]>([]);

  /**
   * 搜索条平滑展开：收起态即圆形搜索按钮（宽 ROUND_BTN），展开时在原位向左
   * 延展成整条胶囊（内容与 close 按钮同行的剩余宽度）。searchMounted 让输入区
   * 在收起动画播完后再卸载，收起过程内容随宽度收拢而不是瞬间消失。
   */
  const [searchMounted, setSearchMounted] = useState(false);
  const searchWidth = useRef(new Animated.Value(0)).current;
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;
  const { width: windowWidth } = useWindowDimensions();
  const searchExpandedWidth = Math.max(
    ROUND_BTN,
    windowWidth - spacing.md * 2 - ROUND_BTN - spacing.md,
  );

  const animateSearch = useCallback(
    (open: boolean) => {
      Animated.timing(searchWidth, {
        toValue: open ? 1 : 0,
        duration: open ? 300 : 220,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !searchOpenRef.current) {
          setSearchMounted(false);
        }
      });
    },
    [searchWidth],
  );

  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const confirmedRef = useRef(false);

  // 无初始坐标时先试最后已知位置（瞬时，不等 GPS）
  useEffect(() => {
    if (initial) {
      return;
    }
    let mounted = true;
    void yujianLocation.getLastKnownPosition().then((last) => {
      if (mounted && last) {
        setCenter({ latitude: last.latitude, longitude: last.longitude });
        setZoom(15);
      }
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 未确认就离开（关闭 / 手势 / 被顶栈）：以取消收口，解除调用方 await
  useEffect(
    () => () => {
      if (!confirmedRef.current) {
        locationPickerHub.complete(null);
      }
    },
    [],
  );

  const flashHint = useCallback((text: string) => {
    setHint(text);
    setTimeout(() => setHint((current) => (current === text ? null : current)), 2600);
  }, []);

  /** 松手：把像素位移换算进中心点（GCJ tile 空间线性，结算后转回 WGS 存储） */
  const commitDrag = useCallback((dx: number, dy: number) => {
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      setDragOffset({ x: 0, y: 0 });
      return;
    }
    const wgs = centerRef.current;
    const z = zoomRef.current;
    const gcj = wgs84ToGcj02(wgs.latitude, wgs.longitude);
    const tileX = lonToTileX(gcj.longitude, z) - dx / TILE_SIZE;
    const tileY = latToTileY(gcj.latitude, z) - dy / TILE_SIZE;
    const next = gcj02ToWgs84(tileYToLat(tileY, z), tileXToLon(tileX, z));
    setCenter({ latitude: next.latitude, longitude: next.longitude });
    setDragOffset({ x: 0, y: 0 });
    haptics.selection();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderMove: (_event, gesture) => setDragOffset({ x: gesture.dx, y: gesture.dy }),
      onPanResponderRelease: (_event, gesture) => commitDrag(gesture.dx, gesture.dy),
      onPanResponderTerminate: (_event, gesture) => commitDrag(gesture.dx, gesture.dy),
    }),
  ).current;

  // 中心变化 → 防抖逆地理编码预览具体地址
  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(() => {
      void (async () => {
        const place = await locationService.reverseGeocode(center.latitude, center.longitude);
        if (cancelled) {
          return;
        }
        setPreviewAddress(buildConcreteAddress(place));
        setResolving(false);
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [center]);

  // 缩放后瓦片全量替换，重新探测加载阶段
  useEffect(() => {
    setTilePhase('idle');
  }, [zoom]);

  /**
   * 瓦片网格：中心瓦片四周 TILE_RADIUS 圈，经度回绕，纬度出界裁剪。
   * 高德瓦片按 GCJ-02 绘制：先转换中心再算 tile，整张网格坐标系一致。
   */
  const tiles = useMemo(() => {
    const z = Math.round(zoom);
    const gcj = wgs84ToGcj02(center.latitude, center.longitude);
    const tileX = lonToTileX(gcj.longitude, z);
    const tileY = latToTileY(gcj.latitude, z);
    const n0 = Math.floor(tileX);
    const m0 = Math.floor(tileY);
    const count = 2 ** z;
    const list: { key: string; url: string; left: number; top: number }[] = [];
    for (let i = -TILE_RADIUS; i <= TILE_RADIUS; i += 1) {
      for (let j = -TILE_RADIUS; j <= TILE_RADIUS; j += 1) {
        const n = n0 + i;
        const m = m0 + j;
        if (m < 0 || m >= count) {
          continue;
        }
        const wrappedN = ((n % count) + count) % count;
        // 4 个瓦片子域轮询，提高并行加载能力
        const subdomain = ((Math.abs(n) + Math.abs(m)) % 4) + 1;
        list.push({
          key: `${n}-${m}`,
          url:
            `https://webrd0${subdomain}.is.autonavi.com/appmaptile` +
            `?lang=zh_cn&size=1&scale=1&style=8&x=${wrappedN}&y=${m}&z=${z}`,
          left: (n - tileX) * TILE_SIZE,
          top: (m - tileY) * TILE_SIZE,
        });
      }
    }
    return list;
  }, [center, zoom]);

  const coordLabel = useMemo(
    () => formatCoordLabel(center.latitude, center.longitude),
    [center],
  );

  const zoomBy = useCallback((delta: number) => {
    haptics.selection();
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta)));
  }, []);

  const locateMe = useCallback(async () => {
    haptics.selection();
    try {
      const position = await yujianLocation.getCurrentPosition(6000);
      setCenter({ latitude: position.latitude, longitude: position.longitude });
      setZoom(16);
    } catch {
      const last = await yujianLocation.getLastKnownPosition();
      if (last) {
        setCenter({ latitude: last.latitude, longitude: last.longitude });
        setZoom(16);
      } else {
        flashHint('无法获取当前位置，请检查定位权限与服务');
      }
    }
  }, [flashHint]);

  const openSearch = useCallback(() => {
    haptics.selection();
    setSearchMounted(true);
    setSearchOpen(true);
    animateSearch(true);
  }, [animateSearch]);

  const closeSearch = useCallback(() => {
    haptics.selection();
    setSearchOpen(false);
    Keyboard.dismiss();
    setResults([]);
    animateSearch(false);
  }, [animateSearch]);

  const runSearch = useCallback(async () => {
    const text = query.trim();
    if (!text) {
      return;
    }
    haptics.selection();
    setSearching(true);
    const items = await locationService.searchPlaces(text, center);
    setSearching(false);
    setResults(items);
    if (items.length === 0) {
      flashHint('没有找到相关地点');
    }
  }, [query, center, flashHint]);

  const applyResult = useCallback(
    (item: PlaceSearchItem) => {
      setCenter({ latitude: item.latitude, longitude: item.longitude });
      setZoom(15);
      setQuery(item.name);
      setSearchOpen(false);
      setResults([]);
      Keyboard.dismiss();
      animateSearch(false);
      haptics.selection();
    },
    [animateSearch],
  );

  const confirmPick = useCallback(async () => {
    if (confirming) {
      return;
    }
    setConfirming(true);
    haptics.confirm();
    const location = await locationService.fromManualPick(
      center.latitude,
      center.longitude,
      labelPrecision,
    );
    confirmedRef.current = true;
    locationPickerHub.complete(location);
    navigation.goBack();
  }, [confirming, center, labelPrecision, navigation]);

  const close = useCallback(() => {
    haptics.cancel();
    confirmedRef.current = true;
    locationPickerHub.complete(null);
    navigation.goBack();
  }, [navigation]);

  const iconColor = '#1C3D4B';
  const cardBg = profile.isDark ? 'rgba(13,38,48,0.94)' : 'rgba(253,254,253,0.95)';
  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;

  return (
    <View
      style={[styles.screen, { backgroundColor: profile.isDark ? '#0A1D24' : '#D7E4E4' }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setMapSize({ width, height });
      }}
    >
      {/* 全屏地图：PanResponder 承载拖动；瓦片按中心 + 拖动偏移摆放 */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        {mapSize.width > 0
          ? tiles.map((tile) => (
              <Image
                key={`${tile.key}-${zoom}`}
                source={{ uri: tile.url }}
                style={[
                  styles.tile,
                  {
                    left: mapSize.width / 2 + tile.left + dragOffset.x,
                    top: mapSize.height / 2 + tile.top + dragOffset.y,
                  },
                ]}
                onLoad={() => setTilePhase('shown')}
                onError={() => setTilePhase((prev) => (prev === 'shown' ? prev : 'error'))}
                resizeMode="cover"
              />
            ))
          : null}
        {tilePhase !== 'shown' && mapSize.width > 0 ? (
          <View style={styles.tileHintWrap} pointerEvents="none">
            <Text style={styles.tileHintText}>
              {tilePhase === 'error' ? '地图加载失败，可能处于离线状态' : '地图加载中…'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 中心十字准星：即所选钓点 */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairRing} />
        <View style={styles.crosshairDot} />
      </View>

      {/* 顶部操作：左上角圆形关闭 / 右上角搜索按钮原地向左延展成搜索条 */}
      <View
        style={[styles.topRow, { paddingTop: insets.top + spacing.md }]}
        pointerEvents="box-none"
      >
        <PressableScale
          onPress={close}
          scaleTo={0.9}
          style={styles.roundBtn}
          accessibilityLabel="关闭地图选点"
          accessibilityRole="button"
        >
          <Icon name="close" size={21} color={iconColor} />
        </PressableScale>
        <Animated.View
          style={[
            styles.searchField,
            {
              width: searchWidth.interpolate({
                inputRange: [0, 1],
                outputRange: [ROUND_BTN, searchExpandedWidth],
              }),
              backgroundColor: searchWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(253,254,253,0.94)', cardBg],
              }),
              borderColor: searchWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(23,59,75,0.12)', profile.surface.glassBorder],
              }),
            },
          ]}
        >
          {searchMounted ? (
            <>
              <Icon name="search" size={18} color={iconColor} />
              <TextInput
                style={[styles.searchInput, { color: textPrimary }]}
                value={query}
                onChangeText={setQuery}
                placeholder="搜索湖泊、水库、钓场…"
                placeholderTextColor={textSecondary}
                returnKeyType="search"
                autoFocus
                onSubmitEditing={() => void runSearch()}
              />
              {searching ? (
                <ActivityIndicator size="small" color={GOLD} />
              ) : query ? (
                <PressableScale
                  onPress={() => {
                    setQuery('');
                    setResults([]);
                  }}
                  scaleTo={0.9}
                  style={styles.searchClear}
                  accessibilityLabel="清空搜索"
                  accessibilityRole="button"
                >
                  <Icon name="close-circle" size={15} color={textSecondary} />
                </PressableScale>
              ) : (
                <PressableScale
                  onPress={closeSearch}
                  scaleTo={0.9}
                  style={styles.searchClear}
                  accessibilityLabel="收起搜索"
                  accessibilityRole="button"
                >
                  <Icon name="chevron-down" size={17} color={textSecondary} />
                </PressableScale>
              )}
            </>
          ) : (
            <PressableScale
              onPress={openSearch}
              scaleTo={0.9}
              style={styles.searchTrigger}
              accessibilityLabel="搜索地点"
              accessibilityRole="button"
            >
              <Icon name="search" size={20} color={iconColor} />
            </PressableScale>
          )}
        </Animated.View>
      </View>

      {/* 搜索结果列表：搜索条正下方 */}
      {results.length > 0 ? (
        <ScrollView
          style={[
            styles.resultList,
            {
              top: insets.top + spacing.md + ROUND_BTN + spacing.xs,
              backgroundColor: cardBg,
              borderColor: profile.surface.glassBorder,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {results.map((item) => (
            <PressableScale key={item.id} onPress={() => applyResult(item)} scaleTo={0.99}>
              <View style={styles.resultRow}>
                <Icon name="location-outline" size={14} color={GOLD} />
                <View style={styles.resultText}>
                  <Text style={[styles.resultName, { color: textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.resultDetail, { color: textSecondary }]} numberOfLines={1}>
                    {item.detail}
                  </Text>
                </View>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}

      {/* 右侧操作列：放大 / 缩小 / 回到当前位置 */}
      <View style={styles.sideControls} pointerEvents="box-none">
        <PressableScale
          onPress={() => zoomBy(1)}
          scaleTo={0.9}
          style={styles.roundBtn}
          accessibilityLabel="放大地图"
          accessibilityRole="button"
        >
          <Icon name="add" size={21} color={iconColor} />
        </PressableScale>
        <PressableScale
          onPress={() => zoomBy(-1)}
          scaleTo={0.9}
          style={styles.roundBtn}
          accessibilityLabel="缩小地图"
          accessibilityRole="button"
        >
          <Icon name="remove" size={21} color={iconColor} />
        </PressableScale>
        <PressableScale
          onPress={() => void locateMe()}
          scaleTo={0.9}
          style={[styles.roundBtn, styles.locateBtn]}
          accessibilityLabel="回到当前位置"
          accessibilityRole="button"
        >
          <Icon name="locate" size={19} color={GOLD} />
        </PressableScale>
      </View>

      {hint ? (
        <View style={[styles.hintWrap, { bottom: insets.bottom + 190 }]} pointerEvents="none">
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}

      {/* 底部确认浮卡：具体地址 + 坐标 + 使用这个位置 */}
      <View
        style={[
          styles.confirmCard,
          {
            backgroundColor: cardBg,
            borderColor: profile.surface.glassBorder,
            bottom: insets.bottom + spacing.md,
          },
        ]}
      >
        <View style={styles.previewRow}>
          <Icon name="location" size={16} color={GOLD} />
          {resolving ? (
            <ActivityIndicator size="small" color={GOLD} style={styles.previewSpinner} />
          ) : null}
          <View style={styles.previewText}>
            <Text style={[styles.previewAddress, { color: textPrimary }]} numberOfLines={2}>
              {previewAddress || coordLabel}
            </Text>
            {previewAddress ? (
              <Text style={[styles.previewCoord, { color: textSecondary }]} numberOfLines={1}>
                {coordLabel}
              </Text>
            ) : null}
          </View>
        </View>
        <PrimaryButton
          label="使用这个位置"
          onPress={() => void confirmPick()}
          loading={confirming}
          variant="primary"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  } as ViewStyle,
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  } as ImageStyle,
  tileHintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  tileHintText: {
    color: 'rgba(251,253,252,0.9)',
    fontSize: fs(12),
    backgroundColor: 'rgba(10,26,32,0.66)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.s,
    overflow: 'hidden',
  } as TextStyle,
  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  crosshairRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(201,169,106,0.12)',
  } as ViewStyle,
  crosshairDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  } as ViewStyle,
  topRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  /** 圆形图标操作按钮（关闭 / 缩放 / 聚焦共用） */
  roundBtn: {
    width: ROUND_BTN,
    height: ROUND_BTN,
    borderRadius: ROUND_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(253,254,253,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(23,59,75,0.12)',
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  } as ViewStyle,
  /**
   * 顶栏搜索条：收起态宽 ROUND_BTN 即圆形按钮，展开时向左延展成胶囊；
   * paddingLeft = (ROUND_BTN - 图标) / 2，图标在两个形态间位置不跳变。
   */
  searchField: {
    height: ROUND_BTN,
    borderRadius: ROUND_BTN / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  } as ViewStyle,
  /** 收起态：覆盖整个圆形区域的点击触发层 */
  searchTrigger: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  sideControls: {
    position: 'absolute',
    right: spacing.md,
    top: '38%',
    gap: spacing.sm,
  } as ViewStyle,
  locateBtn: {
    borderColor: 'rgba(201,169,106,0.55)',
  } as ViewStyle,
  searchInput: {
    flex: 1,
    fontSize: fs(13),
    paddingVertical: 0,
  } as TextStyle,
  searchClear: {
    padding: 4,
    borderRadius: 10,
  } as ViewStyle,
  resultList: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.m,
    borderWidth: 1,
    maxHeight: 216,
  } as ViewStyle,
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(23,59,75,0.08)',
  } as ViewStyle,
  resultText: {
    flex: 1,
  } as ViewStyle,
  resultName: {
    fontFamily: font.serif,
    fontSize: fs(14),
    fontWeight: '700',
  } as TextStyle,
  resultDetail: {
    fontSize: fs(11),
    marginTop: 1,
  } as TextStyle,
  hintWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  } as ViewStyle,
  hintText: {
    color: '#FDFEFD',
    fontSize: fs(12),
    backgroundColor: 'rgba(10,26,32,0.72)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.s,
    overflow: 'hidden',
  } as TextStyle,
  confirmCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.l,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  } as ViewStyle,
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  } as ViewStyle,
  previewSpinner: {
    marginLeft: -2,
  } as ViewStyle,
  previewText: {
    flex: 1,
    flexShrink: 1,
  } as ViewStyle,
  previewAddress: {
    fontFamily: font.serif,
    fontSize: fs(15),
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 21,
  } as TextStyle,
  previewCoord: {
    fontSize: fs(11),
    marginTop: 2,
  } as TextStyle,
});
