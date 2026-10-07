import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import type { AnimationObject } from 'lottie-react-native';
import { StackNavigationProp } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { RemoteCatch } from '../types/models';
import { font, fs, spacing } from '../constants/tokens';
import {
  CAPTURE_VISUAL_SIZE,
  HERO_CARD_RADIUS,
  PAGE_MARGIN,
  coreColors,
  coreType,
} from '../constants/coreUi';
import { countDistinctDays, formatCaptureWhen, formatLength, formatWeight } from '../utils/formatters';
import { catchMemoryService, CatchMemoryData } from '../services/catchMemoryService';
import { homeFeedback } from '../services/homeFeedback';
import { RemoteImage } from '../components/RemoteImage';
import { PressableScale } from '../components/ui/PressableScale';
import { CardCarousel } from '../components/ui/CardCarousel';
import { MorningLakeScene, YuJianPrimaryCaptureButton } from '../components/coreui';
import cameraFlash from '../assets/home/animation/camera_flash.json';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** 居中大卡宽度：设计稿主卡约占屏宽 74%，两侧卡片露出更多形成层次 */
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.74);
/** 首卡/末卡也能居中：内容区两侧留出 (屏宽 - 卡宽) / 2 */
const SIDE_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const CARD_GAP = Math.round(SCREEN_WIDTH * 0.045);
const CARD_HEIGHT = Math.max(280, Math.round(SCREEN_HEIGHT * 0.37));
const CARD_STEP = CARD_WIDTH + CARD_GAP;
/** 两侧卡片轻缩放下沉（冻结稿为单主卡；多记录时弱化立体层次，禁 3D cover flow） */
const SIDE_DROP = 10;
const SIDE_SCALE = 0.92;
const SIDE_PUSH = Math.round((CARD_WIDTH * (1 - SIDE_SCALE)) / 2) - 2;


export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp>();
  const { reduceMotion } = useTheme();
  const { session } = useAuth();
  const { catches, statistics, loading, reload } = useCatchArchive();
  const { avatar } = usePreferences();
  const insets = useSafeAreaInsets();
  const [memories, setMemories] = useState<Record<string, CatchMemoryData>>({});

  const flashRef = useRef<LottieView>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const profileScale = useRef(new Animated.Value(1)).current;

  /**
   * HomeState（手册 8.1）：仅由有效 FishRecord 数量决定，login/session 不是选择器。
   * 加载期间 catches 恒为 []，空态世界从首帧稳定呈现，不随 loading 抖动
   * 切换到普通布局的加载卡（首次进入即 Empty Home V2）。
   */
  const isEmptyHome = catches.length === 0;

  const visibleCatches = useMemo(() => catches.slice(0, 6), [catches]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        visibleCatches.map(
          async (item) => [item.id, await catchMemoryService.load(item.id)] as const,
        ),
      );
      if (mounted) setMemories(Object.fromEntries(entries));
    })();
    return () => { mounted = false; };
  }, [visibleCatches]);

  /* 环境水声：仅用户开启后循环（Audio_Spec），离开首页即停 */
  useEffect(() => {
    let enabled = false;
    homeFeedback.isAmbientEnabled().then((on) => {
      enabled = on;
      if (on) homeFeedback.startAmbient();
    });
    return () => {
      if (enabled) homeFeedback.stopAmbient();
    };
  }, []);

  const speciesCount =
    statistics.speciesCount ||
    new Set(catches.map((c) => c.speciesId).filter(Boolean)).size;
  const dayCount = countDistinctDays(catches);

  /* 统计口径（8.2）：distinct species / valid count / distinct catch days */
  const stats = [
    { label: '鱼种', value: speciesCount, target: 'Guide' as const },
    { label: '鱼获', value: catches.length, target: 'MyCatches' as const },
    { label: '记录天数', value: dayCount, target: 'Calendar' as const },
  ];

  const accessToken = session?.accessToken ?? null;

  /* 个人中心入口：scale .96→1 + 柔和确认音 + Soft 触感（220ms） */
  const openProfile = () => {
    homeFeedback.playProfileOpen();
    homeFeedback.hapticProfile();
    Animated.sequence([
      Animated.timing(profileScale, {
        toValue: 0.96,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(profileScale, {
        toValue: 1,
        speed: 20,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();
    navigation.navigate('Profile');
  };

  /* 相机入口：闪白 180ms + 快门音 + Medium 触感（复用现有 Identify 流程）。
     拍照识别不需要鉴权 —— 游客直接进识别页，仅在保存鱼获时才提示登录。 */
  const handleCapture = () => {
    homeFeedback.playCapture();
    homeFeedback.hapticCapture();
    flashOpacity.setValue(1);
    flashRef.current?.reset();
    flashRef.current?.play();
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 220,
      delay: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    navigation.navigate('Identify');
  };

  /* 相册入口（空首页）：进识别页后自动拉起既有相册选择，不新建第二套 Picker */
  const handleOpenAlbum = () => {
    homeFeedback.hapticCapture();
    navigation.navigate('Identify', { openAlbum: true });
  };

  /* 栈底轻渲染：识别流程（Identify→Recognizing→Result）期间 Home 沉在栈底，
     原生 ScreenStack 在页面挂载/分离变更时的合成抖动会把栈底屏短暂显示出来，
     鱼获卡片因此闪现。离开 Home 的转场（280ms）结束后再撤下内容
     （display:none，不产生原生视图但保留组件状态），抖动窗口内只剩主题背景色；
     回到 Home 立即恢复。快速往返（340ms 内）不会撤下，避免内容闪烁。 */
  const isFocused = useIsFocused();
  const [contentHidden, setContentHidden] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setContentHidden(false);
      return;
    }
    const t = setTimeout(() => setContentHidden(true), 340);
    return () => clearTimeout(t);
  }, [isFocused]);

  return (
    <View style={[styles.root, contentHidden && { backgroundColor: coreColors.lakeWhite }]}>
      <View style={[styles.flex, contentHidden && styles.hiddenContent]}>
      {/* 环境层（Core UI V1）：同一个清晨湖畔世界。
          空首页环境参与叙事（钓竿/鱼漂/涟漪/晨光）；有数据时退为干净场景。 */}
      <MorningLakeScene level="hero" fishing={isEmptyHome} atmosphere={isEmptyHome} />

      {/* 拍照闪白（camera_flash.json，覆盖全屏） */}
      {!reduceMotion && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: flashOpacity }]} pointerEvents="none">
          <LottieView
            ref={flashRef}
            source={cameraFlash as unknown as AnimationObject}
            loop={false}
            style={styles.fill}
          />
        </Animated.View>
      )}

      {isEmptyHome ? (
        /* ── Empty Home V2：安静等待，随时记录 ─────────────────── */
        <EmptyHomeLayout
          insetsTop={insets.top}
          loggedIn={!!session}
          nicknameEntry={
            <Animated.View style={{ transform: [{ scale: profileScale }] }}>
              <PressableScale onPress={openProfile} scaleTo={0.94} style={styles.avatarHit}>
                <View style={styles.avatar}>
                  <AvatarFace avatar={avatar} />
                </View>
              </PressableScale>
            </Animated.View>
          }
          onLogin={() => navigation.navigate('Login')}
        />
      ) : (
        /* ── Normal Home V1：最近鱼获 + 继续记录 ───────────────── */
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 10, paddingBottom: 150 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={reload}
              tintColor={coreColors.deepLakeBlue}
              progressBackgroundColor="#FFFFFF"
            />
          }
        >
          {/* ── 品牌区 ─────────────────────────────────────────── */}
          <View style={[styles.brandRow, styles.pageInset]}>
            <PressableScale onPress={openProfile} scaleTo={0.97}>
              <Text style={styles.brand}>渔见</Text>
            </PressableScale>

            {/* 头像入口（玻璃圆钮 + 已设头像或默认人像） */}
            <Animated.View style={{ transform: [{ scale: profileScale }] }}>
              <PressableScale onPress={openProfile} scaleTo={0.94} style={styles.avatarHit}>
                <View style={styles.avatar}>
                  <AvatarFace avatar={avatar} />
                </View>
              </PressableScale>
            </Animated.View>
          </View>

          {/* ── 统计区（设计稿：直接落在背景上，细分割线隔开） ──────── */}
          <View style={[styles.statBar, styles.pageInset]}>
            {stats.map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={styles.statDivider} />}
                <PressableScale
                  onPress={() => navigation.navigate(stat.target)}
                  scaleTo={0.97}
                  style={styles.statCell}
                >
                  <CountUp value={stat.value} reduceMotion={reduceMotion} />
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </PressableScale>
              </React.Fragment>
            ))}
          </View>

          {/* ── 最近鱼获：区块标题 + 全部 ›（设计稿与标题同行） ────── */}
          <View style={[styles.sectionRow, styles.pageInset]}>
            <Text style={styles.sectionTitle}>最近鱼获</Text>
            <PressableScale
              onPress={() => navigation.navigate('MyCatches')}
              scaleTo={0.96}
              style={styles.seeAllHit}
            >
              <View style={styles.seeAllRow}>
                <Text style={styles.seeAllText}>全部</Text>
                <Icon name="chevron-forward" size={15} color={coreColors.deepLakeBlue} />
              </View>
            </PressableScale>
          </View>

          {/* ── 渔获卡轮播（中间大卡 + 两侧弱预览，无 3D） ──────── */}
          {/* catches===0 时整个普通布局不可达（Empty Home 承接），此处恒有数据 */}
          <View style={{ marginTop: 14 }}>
            <CardCarousel
                count={visibleCatches.length}
                cardWidth={CARD_WIDTH}
                cardHeight={CARD_HEIGHT}
                gap={CARD_GAP}
                sideScale={SIDE_SCALE}
                sideDrop={SIDE_DROP}
                sidePush={SIDE_PUSH}
                sideOpacity={0.75}
                onChange={() => {
                  homeFeedback.playCardSwipe();
                  homeFeedback.hapticSwipe();
                }}
                renderItem={({ index, isActive, scrollX }) => (
                  <CatchCard
                    key={visibleCatches[index].id}
                    item={visibleCatches[index]}
                    memory={memories[visibleCatches[index].id]}
                    accessToken={accessToken}
                    isActive={isActive}
                    index={index}
                    scrollX={scrollX}
                    reduceMotion={reduceMotion}
                    onPress={() =>
                      navigation.navigate('CatchDetail', {
                        catchId: visibleCatches[index].id,
                        initialCatch: visibleCatches[index],
                      })
                    }
                  />
                )}
              />
          </View>
        </ScrollView>
      )}

      {/* ── 底部相机（共享 YuJianPrimaryCaptureButton，锚点 ~83.5%） ── */}
      <View
        style={[styles.cameraDock, { bottom: insets.bottom + SCREEN_HEIGHT * 0.085 }]}
        pointerEvents="box-none"
      >
        {isEmptyHome ? (
          <Text style={styles.cameraCaption}>对准鱼获，拍一张</Text>
        ) : (
          <Text style={styles.cameraCaption}>记录下一条鱼</Text>
        )}
        <YuJianPrimaryCaptureButton onPress={handleCapture} size={CAPTURE_VISUAL_SIZE} />
        {isEmptyHome && (
          <PressableScale onPress={handleOpenAlbum} scaleTo={0.94} style={styles.albumEntry}>
            <View style={styles.albumRow}>
              <View style={styles.albumIcon}>
                <Icon name="images-outline" size={15} color="rgba(255,255,255,0.92)" />
              </View>
              <Text style={styles.albumText}>从相册选择</Text>
            </View>
          </PressableScale>
        )}
      </View>
      </View>
    </View>
  );
};

/* ─── 头像入口内容：已设置头像显示照片，否则默认人像图标 ──────────────────── */

const AvatarFace: React.FC<{ avatar: string | null }> = ({ avatar }) =>
  avatar ? (
    <Image source={{ uri: avatar }} style={styles.avatarPhoto} />
  ) : (
    <Icon name="person-outline" size={19} color="#30485A" />
  );

/* ─── Empty Home V2 布局 ──────────────────────────────────────────────────── */

const EmptyHomeLayout: React.FC<{
  insetsTop: number;
  loggedIn: boolean;
  nicknameEntry: React.ReactNode;
  onLogin: () => void;
}> = ({ insetsTop, loggedIn, nicknameEntry, onLogin }) => {
  /* 柔和入场（content_screens 允许 soft entrance） */
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <View style={styles.emptyRoot} pointerEvents="box-none">
      {/* 品牌区 */}
      <Animated.View
        style={[styles.emptyBrandRow, styles.pageInset, { marginTop: insetsTop + 6, opacity: enter }]}
      >
        <View>
          <Text style={styles.brand}>渔见</Text>
          <Text style={styles.brandSub}>拍照收藏每次渔获</Text>
        </View>
        {loggedIn ? (
          nicknameEntry
        ) : (
          <PressableScale onPress={onLogin} scaleTo={0.94} style={styles.loginEntry}>
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>登录</Text>
              <View style={styles.loginChevron}>
                <Icon name="chevron-forward" size={14} color={coreColors.deepLakeBlue} />
              </View>
            </View>
          </PressableScale>
        )}
      </Animated.View>

      {/* 情绪 Hero 文案（anchor: x 4.6% / y 11.7%，冻结稿两行） */}
      <Animated.View style={[styles.emptyHero, styles.pageInset, { opacity: enter }]}>
        <Text style={styles.emptyHeroLine}>现在，轮到你</Text>
        <View>
          <Text style={styles.emptyHeroLine}>记录第一条鱼。</Text>
          {/* 金色笔锋下划线（SoftGold 弱高光，Gold 仅用于品牌/重要时刻） */}
          <View style={styles.heroSwash} />
        </View>
      </Animated.View>
    </View>
  );
};

/* ─── 统计数字滚动 ────────────────────────────────────────────────────────── */

const CountUp: React.FC<{ value: number; reduceMotion: boolean }> = ({
  value,
  reduceMotion,
}) => {
  const [display, setDisplay] = useState(0);
  const lastValue = useRef(-1);

  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const counter = new Animated.Value(0);
    const id = counter.addListener(({ value: t }) => setDisplay(Math.round(t)));
    Animated.timing(counter, {
      toValue: value,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => counter.removeListener(id));
    return () => counter.removeListener(id);
  }, [value, reduceMotion]);

  return <Text style={styles.statValue}>{display}</Text>;
};

/* ─── 渔获卡（YuJianCatchHeroCard · HOME variant） ────────────────────────── */

const CatchCard: React.FC<{
  item: RemoteCatch;
  memory?: CatchMemoryData;
  accessToken: string | null;
  isActive: boolean;
  index: number;
  scrollX: Animated.Value;
  reduceMotion: boolean;
  onPress: () => void;
}> = ({ item, memory, accessToken, isActive, index, scrollX, reduceMotion, onPress }) => {
  const lengthLabel = formatLength(memory?.lengthCm ?? null, 'cm');
  const weightLabel = formatWeight(memory?.weightKg ?? null, 'kg');
  const location = memory?.location?.trim();
  /* 设计稿三行信息：鱼名 / 长度 · 体重 / 时间 · 地点 */
  const bodySpec = [lengthLabel, weightLabel].filter(Boolean).join(' · ');
  const footprint = [formatCaptureWhen(item.capturedAt), location].filter(Boolean).join(' · ');

  /* 轮播几何：中间原大，两侧轻微缩小下沉（无 3D 倾斜） */
  const scale = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
    extrapolate: 'clamp',
  });
  const opacity = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [0.75, 1, 0.75],
    extrapolate: 'clamp',
  });
  const translateY = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [SIDE_DROP, 0, SIDE_DROP],
    extrapolate: 'clamp',
  });
  /* 向内位移补偿缩放空隙：侧卡收向居中卡、轻压其下 */
  const translateX = scrollX.interpolate({
    inputRange: [(index - 1) * CARD_STEP, index * CARD_STEP, (index + 1) * CARD_STEP],
    outputRange: [-SIDE_PUSH, 0, SIDE_PUSH],
    extrapolate: 'clamp',
  });

  /* 卡片进入：opacity 0→1、scale .94→1，spring */
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const enterScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.94)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(enterScale, {
        toValue: 1,
        speed: 20,
        bounciness: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [enter, enterScale, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.cardHit,
        {
          opacity: Animated.multiply(enter, opacity),
          transform: [
            { translateX },
            { scale: Animated.multiply(enterScale, scale) },
            { translateY },
          ],
          zIndex: isActive ? 2 : 1,
        },
      ]}
    >
      <PressableScale onPress={onPress} scaleTo={0.985} style={{ width: CARD_WIDTH }}>
        <View style={styles.card}>
          {item.imageUrl ? (
            <RemoteImage
              url={item.imageUrl}
              authToken={accessToken}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cardImage, styles.cardFallback]}>
              <Text style={styles.cardFallbackText}>渔见</Text>
            </View>
          )}

          {/* 底部渐变遮罩（GLASS_C：transparent → DeepOverlay 文字保护） */}
          <View style={styles.cardOverlay}>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id={`scrim${index}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0.35" stopColor="#081926" stopOpacity="0" />
                  <Stop offset="0.7" stopColor="#081926" stopOpacity="0.24" />
                  <Stop offset="1" stopColor="#081926" stopOpacity="0.6" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#scrim${index})`} />
            </Svg>

            {/* 卡片信息：三行（鱼名 / 规格 / 时空），居左（设计稿） */}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.speciesName || '这条鱼还在确认中'}
              </Text>
              {!!bodySpec && (
                <Text style={styles.cardSpecText} numberOfLines={1}>
                  {bodySpec}
                </Text>
              )}
              {!!footprint && (
                <Text style={styles.cardFootprintText} numberOfLines={1}>
                  {footprint}
                </Text>
              )}
            </View>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
};

/* ─── 样式 ───────────────────────────────────────────────────────────────── */

/** 头像玻璃表面（GLASS_B：white 0.60） */
/* 默认头像合同 profile_avatar_v1：外盘 #6BFFFFFF / 描边 #9EFFFFFF / 人像 #30485A */
const AVATAR_GLASS_FILL = 'rgba(255,255,255,0.42)';
const AVATAR_GLASS_BORDER = 'rgba(255,255,255,0.62)';

const styles = StyleSheet.create({
  root: { flex: 1 } as ViewStyle,
  flex: { flex: 1 } as ViewStyle,
  /** 栈底期间内容隐藏：display:none 不产生原生视图，组件状态保留 */
  hiddenContent: { display: 'none' } as ViewStyle,
  fill: { flex: 1 } as ViewStyle,
  content: { paddingHorizontal: 0 } as ViewStyle,
  /** 页面通用左右留白（外距）：轮播以外的内容块使用，轮播通栏贴边 */
  pageInset: { marginHorizontal: PAGE_MARGIN } as ViewStyle,

  // 品牌区（两态共用）：标题与头像同一水平中线
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  } as ViewStyle,
  brand: {
    fontFamily: font.serif,
    fontSize: fs(coreType.brand),
    fontWeight: '700',
    letterSpacing: 10,
    lineHeight: fs(coreType.brand) * 1.2,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  brandSub: {
    fontSize: fs(coreType.uiXS),
    letterSpacing: 3,
    marginTop: 6,
    color: coreColors.lakeBlue,
  } as TextStyle,
  avatarHit: { borderRadius: 21 } as ViewStyle,
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: AVATAR_GLASS_BORDER,
    backgroundColor: AVATAR_GLASS_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  avatarPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  } as ImageStyle,

  // 统计区（设计稿：直接落在背景上，无容器）
  statBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: 12,
  } as ViewStyle,
  statDivider: { width: 1, height: 34, backgroundColor: 'rgba(11,45,75,0.10)' } as ViewStyle,
  statCell: { flex: 1, alignItems: 'center' } as ViewStyle,
  statValue: {
    fontFamily: font.serif,
    fontSize: fs(coreType.uiL),
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: fs(coreType.uiL) * 1.15,
    textAlign: 'center',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  statLabel: {
    fontSize: fs(coreType.uiXS),
    letterSpacing: 2.5,
    marginTop: 3,
    textAlign: 'center',
    color: coreColors.mistBlueGray,
  } as TextStyle,

  // 最近鱼获：区块标题 + 全部 ›（同一行）
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  } as ViewStyle,
  sectionTitle: {
    fontFamily: font.serif,
    fontSize: fs(coreType.displayM),
    fontWeight: '700',
    letterSpacing: 2,
    lineHeight: fs(coreType.displayM) * 1.35,
    color: coreColors.deepLakeBlue,
  } as TextStyle,

  // 全部 ›（seeAllHit 为热区，seeAllRow 为行容器——PressableScale 会把 children
  // 包进内层 Animated.View（纵向），行布局必须落在该行容器上，否则文字与图标上下堆叠）
  seeAllHit: {
    paddingVertical: 4,
    paddingLeft: 8,
  } as ViewStyle,
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  } as ViewStyle,
  seeAllText: {
    fontSize: fs(coreType.uiS),
    color: coreColors.deepLakeBlue,
    letterSpacing: 1,
  } as TextStyle,

  // Empty Home V2
  emptyRoot: { flex: 1 } as ViewStyle,
  emptyBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  loginEntry: {
    paddingVertical: 4,
    paddingLeft: 8,
  } as ViewStyle,
  /** 行容器：行布局须落在 PressableScale 内层（其 Animated.View 包装层为纵向） */
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  } as ViewStyle,
  loginText: {
    fontSize: fs(coreType.uiS),
    lineHeight: fs(coreType.uiS) * 1.3,
    color: coreColors.deepLakeBlue,
    letterSpacing: 1,
  } as TextStyle,
  /** 图标盒：高度与文字行高一致 + 上移 1dp 光学校正（Ionicons 字形在盒内偏下） */
  loginChevron: {
    height: fs(coreType.uiS) * 1.3,
    justifyContent: 'center',
    alignItems: 'center',
    // transform: [{ translateY: -1 }],
  } as ViewStyle,
  emptyHero: {
    marginTop: SCREEN_HEIGHT * 0.045,
    gap: 2,
  } as ViewStyle,
  emptyHeroLine: {
    fontFamily: font.serif,
    fontSize: fs(coreType.displayXL),
    fontWeight: '700',
    lineHeight: fs(coreType.displayXL) * 1.42,
    letterSpacing: 2,
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  heroSwash: {
    marginTop: -fs(6),
    width: Math.round(SCREEN_WIDTH * 0.34),
    height: fs(7),
    borderRadius: 999,
    backgroundColor: coreColors.softGold,
    opacity: 0.62,
  } as ViewStyle,

  // 轮播
  carousel: {
    gap: CARD_GAP,
    paddingHorizontal: SIDE_PADDING,
    marginTop: spacing.xl,
    marginBottom: SIDE_DROP,
    overflow: 'visible',
  } as ViewStyle,
  cardHit: { width: CARD_WIDTH } as ViewStyle,
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: HERO_CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    backgroundColor: coreColors.lakeWhite,
  } as ViewStyle,
  cardImage: {
    width: '100%',
    height: CARD_HEIGHT,
  } as ImageStyle,
  cardFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D9E6EB',
  } as ViewStyle,
  cardFallbackText: {
    fontFamily: font.serif,
    fontSize: fs(coreType.displayL - 10),
    color: coreColors.lakeBlue,
    letterSpacing: 4,
  } as TextStyle,

  // 卡片遮罩 + 信息（设计稿三行：鱼名 / 规格 / 时空）
  cardOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' } as ViewStyle,
  cardInfo: {
    alignItems: 'flex-start',
    paddingBottom: 22,
    paddingHorizontal: 18,
    gap: 6,
  } as ViewStyle,
  cardName: {
    fontFamily: font.serif,
    fontSize: fs(coreType.displayL),
    fontWeight: '600',
    letterSpacing: 2,
    lineHeight: fs(coreType.displayL) * 1.25,
    color: '#FFFFFF',
    textShadowColor: 'rgba(8,25,38,0.5)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  /** 第二行：长度 · 体重 */
  cardSpecText: {
    fontSize: fs(coreType.uiM),
    lineHeight: fs(coreType.uiM) * 1.3,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(8,25,38,0.4)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
  /** 第三行：时间 · 地点 */
  cardFootprintText: {
    fontSize: fs(coreType.uiS),
    lineHeight: fs(coreType.uiS) * 1.3,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.72)',
    textShadowColor: 'rgba(8,25,38,0.4)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,

  // 相机底座（两态共用）
  cameraDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 0,
  } as ViewStyle,
  cameraCaption: {
    fontSize: fs(coreType.uiS),
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.94)',
    textShadowColor: 'rgba(8,25,38,0.55)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
    marginBottom: 18,
  } as TextStyle,
  albumEntry: {
    marginTop: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  } as ViewStyle,
  /** 行容器：行布局须落在 PressableScale 内层（其 Animated.View 包装层为纵向） */
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  /** 图标盒：高度与文字行高一致 + 上移 1dp 光学校正（Ionicons 字形在盒内偏下） */
  albumIcon: {
    height: fs(coreType.uiS) * 1.35,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -1 }],
  } as ViewStyle,
  albumText: {
    fontSize: fs(coreType.uiS),
    lineHeight: fs(coreType.uiS) * 1.35,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(8,25,38,0.55)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  } as TextStyle,
});
