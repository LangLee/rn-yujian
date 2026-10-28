import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  ImageStyle,
  LayoutChangeEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { AppIcon } from './icons/AppIcon';
import { GUIDE_FRAME, ViewfinderCornerMarks } from './ViewfinderCornerMarks';
import { font, fs, motion } from '../constants/tokens';
import { haptics } from '../utils/haptics';

/**
 * 首次拍照教学（First-use Camera Guide · 两页教学）。
 *
 * 视觉权威：design/pages/recognition/first_use_camera_guide/frozen 冻结稿
 * （P01 竖屏横鱼 / P02 竖拍竖鱼，几何取自 geometry_measurements.json，
 * 颜色为冻结 PNG 像素取样；横屏教学页 P03 已按产品决定移除）。
 * 行为沿用教学规约 —— 相机权限与取景就绪后仅展示一次，
 * 「跳过 / 开始拍摄」均不触发快门，
 * 完成态只在教学被真实关闭（跳过或最终动作）时持久化。
 *
 * 页面构成：整页设计背景照片（assets/guide/guide_bg_*.jpg，stretch 精确铺满
 * 整屏 —— 图片刚好等于屏幕尺寸、内容完整显示不裁切；横鱼用于 P01、竖鱼用于
 * P02，照片构图已按取景框预留鱼位）。不叠任何整页蒙版（照片本身上亮下暗：
 * 亮天空承托页头深墨文字，深水影承托白色文案），白字仅带字形级轻投影保证可读。
 *
 * 冻结稿还原要点（画板 941×1671，px() 按屏宽换算）：
 *  - 取景角标框：照片内 x58-884 / y198-768 区域按 stretch 同一映射换算
 *    （框随照片对齐、鱼体入框；屏幕比例与画板一致时即冻结稿原位），
 *    白色 L 角标、臂长 ≈ 框宽 5.8%；
 *  - 步骤序号「01 / 02」同字号：序号金色、总页灰白半透明；
 *    标题白色衬线大字距，标题下金色下划线（宽 ≈ 标题文字宽）；
 *  - 三个错误示范照片卡 cover 满铺（冻结稿无留白）、圆角 ≈ 卡宽 4.3%、
 *    浅暖细描边；标注为「浅底 × 徽章 + 避免」+ 次行原因小字（徽章直径 38px）；
 *  - 合格提示条：金色短横线 + 轮廓小鱼（鱼头朝左）+ 金色文字，整条居中；
 *  - 页码点：当前页金色实心大点、其余同径空心圆环；
 *  - 「跳过」白字带下划线（上一张无下划线，中间竖线分隔）；
 *    主操作米白胶囊（98px 高）+ 深藏青字，右缘对齐角标框右缘。
 */

/** 冻结稿画板宽（941px），几何比例的统一换算基准 */
const ARTBOARD_W = 941;

/** 两页教学内容（文案取自 structured_pages.json page_copy；横屏教学页已按产品决定移除） */
interface GuidePageData {
  /** 步骤序号（当前页） */
  step: string;
  title: string;
  description: string;
  /** 整页背景照片（设计背景图：横鱼用于 P01、竖鱼用于 P02，stretch 精确铺满整屏） */
  background: ImageSourcePropType;
  /** 三个错误示范（顺序：鱼头不在画面 / 鱼体过小 / 遮挡过多） */
  errors: ImageSourcePropType[];
}

/** 三个错误示范的标注文案（冻结稿 guide.error.*.caption） */
const ERROR_LABELS = ['鱼头不在画面', '鱼体过小', '遮挡过多'] as const;

/** 错误示范卡宽高比（冻结稿 ≈257×173） */
const CARD_ASPECT = 257 / 173;

const GUIDE_PAGES: GuidePageData[] = [
  {
    step: '01',
    title: '竖屏拍摄示意',
    description: '手机保持竖向，整条鱼横向完整放入取景范围',
    background: require('../assets/guide/guide_bg_horizontal.jpg'),
    errors: [
      require('../assets/guide/horizontal_head_out.jpg'),
      require('../assets/guide/horizontal_too_small.jpg'),
      require('../assets/guide/horizontal_occluded.jpg'),
    ],
  },
  {
    step: '02',
    title: '竖拍鱼类拍摄示意',
    description: '手机保持竖向，将整条鱼竖直放入取景范围',
    background: require('../assets/guide/guide_bg_vertical.jpg'),
    errors: [
      require('../assets/guide/vertical_head_out.jpg'),
      require('../assets/guide/vertical_too_small.jpg'),
      require('../assets/guide/vertical_occluded.jpg'),
    ],
  },
];

// ---------------------------------------------------------------------------
// 冻结稿量色（P01/P02 冻结 PNG 像素取样）
// ---------------------------------------------------------------------------

/** 页头墨色（刊头/副题/返回，压在冻结稿亮天区上；取样标题 #00051D / 副题 #112B4A） */
const HEADER_INK = '#122B47';
/** 副题墨色（稍浅一档） */
const HEADER_SUB_INK = 'rgba(17,44,74,0.78)';
/** 教学金色系（序号/下划线/页码点/提示条，取样 #FEF0A6 / #FDE59E / #FEF4A3） */
const GUIDE_GOLD = '#F4DFA0';
/** 步骤总页「/ 02」灰白半透明（取样 #D4D1CF 约 55% 强度） */
const STEP_REST_INK = 'rgba(224,231,237,0.55)';
/** × 徽章：浅蓝白圆底 + 深青 ×（取样 (219,227,236) / (33,69,84)，直径 38px） */
const BADGE_CIRCLE = '#DCE4ED';
const BADGE_X_INK = '#1F4757';
/** 错误示范卡浅暖细描边（卡缘取样 ≈ (243,229,188)） */
const CARD_BORDER = 'rgba(244,233,196,0.75)';
/** 主操作胶囊：米白底 + 深藏青字（取样 #FFFEF8 / #000427） */
const PRIMARY_BG = '#F7F3EA';
const PRIMARY_INK = '#0A1E38';
/** 页码点：当前页金色实心、其余空心圆环（浅白描边） */
const DOT_ACTIVE_GOLD = '#F5DFA0';
const DOT_IDLE_RING = 'rgba(224,233,240,0.8)';

// ---------------------------------------------------------------------------
// 教学示意元素
// ---------------------------------------------------------------------------

/**
 * 提示条上的金色轮廓小鱼（鱼头朝左：空心鱼身 + 鱼眼 + 鳃弧 + 分叉鱼尾）。
 * 冻结稿 ≈45×22px（宽高比 2.05），以 90×44 viewBox 绘制。
 */
const HintFishGlyph: React.FC<{ color: string; width: number; height: number }> = ({
  color,
  width,
  height,
}) => (
  <Svg width={width} height={height} viewBox="0 0 90 44">
    {/* 鱼身轮廓（杏仁形，鱼头朝左） */}
    <Path
      d="M6 22 C 14 12, 34 8, 52 12 C 60 14, 66 18, 68 22 C 66 26, 60 30, 52 32 C 34 36, 14 32, 6 22 Z"
      stroke={color}
      strokeWidth={2.6}
      strokeLinejoin="round"
      fill="none"
    />
    {/* 鱼眼 */}
    <Circle cx={16} cy={20} r={2.4} fill={color} />
    {/* 鳃弧 */}
    <Path d="M30 11 C 35 18, 35 26, 30 33" stroke={color} strokeWidth={2.2} fill="none" />
    {/* 分叉鱼尾 */}
    <Path
      d="M68 22 C 76 15, 82 11, 88 8 M68 22 C 76 29, 82 33, 88 36"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
);

/** 错误标注的 × 徽章：浅蓝白圆底 + 深青 ×（冻结稿 38px 圆） */
const AvoidBadge: React.FC<{ size: number }> = ({ size }) => {
  const c = size / 2;
  /** × 两臂覆盖圆内 ≈58% 对角范围 */
  const arm = size * 0.29;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={c} cy={c} r={c} fill={BADGE_CIRCLE} />
      <Path
        d={`M ${c - arm} ${c - arm} L ${c + arm} ${c + arm} M ${c + arm} ${c - arm} L ${c - arm} ${c + arm}`}
        stroke={BADGE_X_INK}
        strokeWidth={Math.max(1.1, size * 0.085)}
        strokeLinecap="round"
      />
    </Svg>
  );
};

/**
 * 白色文案的轻投影：背景照片完整显示（不叠任何整页蒙版），
 * 只在字形边缘加一圈柔和暗影保证照片亮部上白字的可读性。
 */
const INK_SHADOW: TextStyle = {
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
  textShadowColor: 'rgba(6,20,26,0.45)',
};

/** 页码点：当前页金色实心圆、其余同径空心圆环（冻结稿 15px 直径、环壁 ≈13% 直径） */
const PageDot: React.FC<{ size: number; active: boolean }> = ({ size, active }) => {
  const c = size / 2;
  const stroke = Math.max(1, size * 0.13);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {active ? (
        <Circle cx={c} cy={c} r={c} fill={DOT_ACTIVE_GOLD} />
      ) : (
        <Circle cx={c} cy={c} r={c - stroke / 2} stroke={DOT_IDLE_RING} strokeWidth={stroke} fill="none" />
      )}
    </Svg>
  );
};

/** 与冻结稿同位置的取景框几何（由父级按屏幕统一计算后传入） */
interface GuideFrame {
  /** 框顶距屏幕顶部的绝对位置（y198/1671 ≈ 11.85% 屏高） */
  top: number;
  width: number;
  height: number;
}

/** 单页教学内容：页头 + 取景框（叠在整页背景照片上）+ 步骤说明 + 三个错误示范 + 合格提示条 */
const GuidePage: React.FC<{
  data: GuidePageData;
  contentWidth: number;
  /** 冻结稿画板 → 当前屏的比例尺（几何尺寸统一按冻结 px 换算） */
  u: number;
  /** 内容流顶部的 y 坐标（含安全区与页头前留白），用于把取景框落到绝对位置 */
  flowTop: number;
  frame: GuideFrame;
  onBack: () => void;
}> = ({ data, contentWidth, u, flowTop, frame, onBack }) => {
  const px = (v: number) => Math.round(v * u);
  const cardGap = Math.max(8, px(29));
  const cardW = Math.floor((contentWidth - cardGap * 2) / 3);
  const cardH = Math.round(cardW / CARD_ASPECT);
  const cardRadius = Math.max(5, Math.round(cardW * 0.043));
  const badgeSize = Math.max(13, px(38));
  /** 页头高（与 header minHeight 一致） */
  const headerH = 34;
  /** 取景框在内容流中的上边距：让框顶落在绝对位置 frame.top（页头之后至少留 8dp） */
  const frameMarginTop = Math.max(8, frame.top - flowTop - headerH);

  return (
    <View style={styles.pageBody}>
      {/* 页头：返回在左，居中刊头与副题（两页同款） */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="返回">
          <AppIcon name="back" size={px(36)} color={HEADER_INK} />
        </Pressable>
        <View style={styles.headerMasthead} pointerEvents="none">
          <Text style={styles.headerTitle}>拍照识鱼</Text>
          <Text style={styles.headerSubtitle}>用一张清晰的照片，记录你的每一次相遇</Text>
        </View>
      </View>

      {/* 取景框：与拍照取景页共用 ViewfinderCornerMarks + GUIDE_FRAME 冻结比例
          （白色 L 角标、臂长 ≈ 框宽 5.8%、外挑框边）。整页背景照片已按该取景
          构图，鱼体正落在框线位置 */}
      <View style={[styles.viewfinderRow, { marginTop: frameMarginTop }]}>
        <ViewfinderCornerMarks width={frame.width} height={frame.height} />
      </View>

      {/* 步骤序号 + 标题 + 金色下划线 + 说明。
          冻结稿锚点：序号 y835 → 标题 y891 → 下划线 y965 → 说明 y993 */}
      <View style={[styles.stepBlock, { marginTop: px(67), marginStart: px(12) }]}>
        <View style={styles.stepRow}>
          <Text style={styles.stepCurrent}>{data.step}</Text>
          <Text style={styles.stepTotal}>{` / 0${GUIDE_PAGES.length}`}</Text>
        </View>
        <Text style={styles.stepTitle}>{data.title}</Text>
        <View
          style={[
            styles.titleUnderline,
            {
              width: Math.round(data.title.length * (fs(21) + 2.5)),
              height: Math.max(1.5, px(2)),
            },
          ]}
        />
        <Text style={styles.stepDesc}>{data.description}</Text>
      </View>

      {/* 三个错误示范：照片卡 cover 满铺（浅暖细描边、圆角、无衬底），
          下方「× 徽章 + 避免」两行式标注（标注相对卡缘内缩，冻结稿 ≈14px） */}
      <View style={[styles.errorRow, { gap: cardGap, marginTop: px(49) }]}>
        {data.errors.map((source, i) => (
          <View key={i} style={styles.errorCard}>
            <View
              style={[
                styles.errorImageBox,
                {
                  width: '100%',
                  height: cardH,
                  borderRadius: cardRadius,
                  borderWidth: Math.max(1, px(2)),
                  borderColor: CARD_BORDER,
                },
              ]}
            >
              <Image
                source={source}
                style={[styles.errorImage, { borderRadius: Math.max(0, cardRadius - 1) }]}
                resizeMode="cover"
                accessibilityLabel={`错误示范：${ERROR_LABELS[i]}`}
              />
            </View>
            <View style={[styles.errorCaption, { marginTop: px(20), marginStart: px(14) }]}>
              <View style={styles.errorCaptionHead}>
                <AvoidBadge size={badgeSize} />
                <Text style={styles.errorCaptionLead}>避免</Text>
              </View>
              <Text style={[styles.errorCaptionReason, { marginStart: badgeSize + 6 }]}>
                {ERROR_LABELS[i]}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* 合格提示条：金色短横线 + 轮廓小鱼 + 金色文字，整条居中（冻结稿 y1392） */}
      <View style={[styles.hintRow, { marginTop: px(61), gap: px(12) }]} pointerEvents="none">
        <View style={[styles.hintDash, { width: px(45), height: Math.max(1, px(2)) }]} />
        <HintFishGlyph color={GUIDE_GOLD} width={px(45)} height={px(22)} />
        <Text style={styles.hintText}>鱼体完整，可拍摄</Text>
        <View style={[styles.hintDash, { width: px(45), height: Math.max(1, px(2)) }]} />
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// 教学浮层
// ---------------------------------------------------------------------------

interface FirstUseCameraGuideProps {
  visible: boolean;
  /** 教学被真实关闭（跳过 / 开始拍摄 / 返回键）：由调用方持久化完成态 */
  onFinish: () => void;
}

export const FirstUseCameraGuide: React.FC<FirstUseCameraGuideProps> = ({ visible, onFinish }) => {
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  /**
   * 浮层实测尺寸：Modal 开了 statusBar/navigationBarTranslucent 后，浮层窗口
   * 可能比 useWindowDimensions 报告的 window 尺寸更高（window 高度不含系统栏
   * 区域）。背景与分页若按 window 高度设尺寸，屏幕底部会露出底下的相机页。
   * 首帧用 window 尺寸兜底，onLayout 实测后立即校正（淡入动画掩盖首帧跳变）。
   */
  const [overlaySize, setOverlaySize] = useState({ width: winWidth, height: winHeight });
  const onOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setOverlaySize((prev) =>
      Math.abs(width - prev.width) > 0.5 || Math.abs(height - prev.height) > 0.5
        ? { width, height }
        : prev,
    );
  }, []);
  const windowWidth = overlaySize.width;
  const windowHeight = overlaySize.height;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setIndex(0);
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: motion.normal,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fade]);

  /** 冻结稿画板（941 宽）→ 当前屏比例尺 */
  const u = windowWidth / ARTBOARD_W;
  const px = (v: number) => Math.round(v * u);
  const pageWidth = windowWidth;
  /** 页边距按冻结稿 58px 换算（照片/错误示范/主操作右缘共用同一左缘） */
  const pagePad = px(58);
  const contentWidth = windowWidth - pagePad * 2;

  /**
   * 取景框与冻结稿 Hero 同位（照片内 x58-884 / y198-768），用与拍照取景页
   * 共用的 GUIDE_FRAME 冻结比例换算（背景照片 stretch 精确铺满整屏，
   * 框按同一映射对齐照片构图/鱼位；屏幕比例与画板一致时即冻结稿原位）。
   */
  const frame: GuideFrame = {
    top: Math.round(GUIDE_FRAME.topRatio * windowHeight),
    width: Math.round(GUIDE_FRAME.widthRatio * windowWidth),
    height: Math.round(GUIDE_FRAME.heightRatio * windowHeight),
  };
  /** 内容流顶部（含安全区与顶部留白），GuidePage 用它把取景框落到绝对位置 frame.top */
  const flowTop = insets.top + Math.max(12, px(30));

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    if (next !== index) {
      haptics.selection();
      setIndex(next);
    }
  }, [index, pageWidth]);

  const goTo = useCallback(
    (next: number) => {
      scrollRef.current?.scrollTo({ x: next * pageWidth, animated: true });
      setIndex(next);
    },
    [pageWidth],
  );

  /** 关闭教学：统一走 onFinish（持久化由调用方处理），均不触发快门 */
  const close = useCallback(() => {
    haptics.selection();
    onFinish();
  }, [onFinish]);

  const isLast = index === GUIDE_PAGES.length - 1;
  /** 主操作胶囊高（冻结稿 98px）、底部留白（冻结稿 68px ≈ 4% 屏高）与页码点间距（10px） */
  const primaryH = Math.max(38, px(98));
  const barBottom = insets.bottom + Math.max(12, px(28));
  const dotsBottom = barBottom + primaryH + px(10);

  return (
    <Modal transparent visible={visible} statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Animated.View style={[styles.overlay, { opacity: fade }]} onLayout={onOverlayLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          scrollEventThrottle={16}
          style={styles.pager}
        >
          {GUIDE_PAGES.map((page) => (
            <View key={page.step} style={{ width: pageWidth, height: windowHeight }}>
              {/* 整页背景照片（设计背景图）：stretch 精确铺满整屏 —— 按屏幕宽高
                  独立缩放（x·W/941、y·H/1672），图片刚好等于屏幕尺寸、内容
                  完整显示不裁切、无空带（横鱼 P01 / 竖鱼 P02，构图已按取景框
                  预留鱼位）。
                  Android 兼容：显式 width/height + style 内 resizeMode +
                  resizeMethod="resize"（Fresco 解码阶段即按视图尺寸缩放位图，
                  绕开「大位图 + FIT_XY 硬件拉伸」在部分机型上只渲染出局部
                  图片的异常路径） */}
              <Image
                source={page.background}
                style={[styles.background, { width: pageWidth, height: windowHeight, resizeMode: 'stretch' as const }]}
                resizeMethod="resize"
                resizeMode="stretch"
                accessibilityLabel="拍摄示范背景"
              />
              <View
                style={[
                  styles.pageContent,
                  {
                    paddingTop: insets.top + Math.max(12, px(30)),
                    paddingBottom: dotsBottom + px(50),
                  },
                ]}
              >
                <ScrollView
                  style={styles.pageScroll}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.pageScrollBody, { paddingHorizontal: pagePad }]}
                  nestedScrollEnabled
                >
                  <GuidePage
                    data={page}
                    contentWidth={contentWidth}
                    u={u}
                    flowTop={flowTop}
                    frame={frame}
                    onBack={close}
                  />
                </ScrollView>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* 页码指示点：当前页金色实心大点，其余同径空心圆环（冻结稿 15px、间距 22px） */}
        <View style={[styles.dots, { bottom: dotsBottom, gap: Math.max(7, px(22)) }]} pointerEvents="none">
          {GUIDE_PAGES.map((p, i) => (
            <PageDot key={p.step} size={Math.max(6, px(15))} active={i === index} />
          ))}
        </View>

        {/* 底部操作行：跳过（白字带下划线）/ 上一张（无下划线，竖线分隔）+ 主操作胶囊。
            左缘对齐冻结稿 x71，右缘对齐角标框右缘（x884） */}
        <View style={[styles.actionBar, { bottom: barBottom, left: px(71), right: pagePad }]}>
          <View style={styles.secondaryActions}>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="跳过教学">
              <Text style={styles.secondaryActionText}>跳过</Text>
              <View style={styles.skipUnderline} />
            </Pressable>
            {index > 0 ? (
              <>
                <View style={styles.secondaryDivider} />
                <Pressable
                  onPress={() => {
                    haptics.selection();
                    goTo(index - 1);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="上一张"
                >
                  <Text style={styles.secondaryActionText}>上一张</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              haptics.selection();
              if (isLast) {
                onFinish();
                return;
              }
              goTo(index + 1);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isLast ? '开始拍摄' : '下一张'}
          >
            <View style={[styles.primaryAction, { minHeight: primaryH, borderRadius: primaryH / 2, paddingHorizontal: px(90) }]}>
              <Text style={styles.primaryActionText}>{isLast ? '开始拍摄' : '下一张'}</Text>
              <AppIcon name="chevron_right" size={px(26)} color={PRIMARY_INK} />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// 样式
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  /** 透明浮层：背景为整页设计背景照片（原相机取景被照片铺底覆盖） */
  overlay: {
    flex: 1,
  } as ViewStyle,
  pager: {
    flex: 1,
  } as ViewStyle,
  pageContent: {
    flex: 1,
  } as ViewStyle,
  /** 整页背景照片：显式尺寸锚定页容器左上角（width/height 由组件按屏幕注入） */
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
  } as ImageStyle,
  /** 内层纵向滚动区：显式填满页容器（高度不随内容收缩，与满屏背景照片对齐） */
  pageScroll: {
    flex: 1,
  } as ViewStyle,
  pageScrollBody: {
    /** 冻结稿为顶部对齐排版：页头 → Hero → 说明 → 错误示范自上而下排布 */
    flexGrow: 1,
    justifyContent: 'flex-start',
  } as ViewStyle,
  pageBody: {} as ViewStyle,
  /** 页头：返回动作在左，刊头绝对居中（冻结稿 x402 中心 = 画板中心） */
  header: {
    minHeight: 34,
    justifyContent: 'center',
  } as ViewStyle,
  headerMasthead: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  headerTitle: {
    color: HEADER_INK,
    fontFamily: font.sans,
    fontSize: fs(13),
    fontWeight: '600',
    letterSpacing: 2.5,
    includeFontPadding: false,
  } as TextStyle,
  headerSubtitle: {
    color: HEADER_SUB_INK,
    fontFamily: font.sans,
    fontSize: fs(10.5),
    letterSpacing: 1.5,
    marginTop: 3,
    includeFontPadding: false,
  } as TextStyle,
  /** 取景框行：叠在整页背景照片上（框顶 ≈11.85% 屏高，与冻结稿 Hero 同位） */
  viewfinderRow: {
    alignItems: 'center',
  } as ViewStyle,
  stepBlock: {
    alignSelf: 'stretch',
  } as ViewStyle,
  stepRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  } as ViewStyle,
  /** 序号与总页同字号：当前页金色、总页灰白半透明（冻结稿 108×27 单行） */
  stepCurrent: {
    color: GUIDE_GOLD,
    fontFamily: font.sans,
    fontSize: fs(11),
    fontWeight: '600',
    letterSpacing: 1,
    includeFontPadding: false,
  } as TextStyle,
  stepTotal: {
    ...INK_SHADOW,
    color: STEP_REST_INK,
    fontFamily: font.sans,
    fontSize: fs(11),
    letterSpacing: 1,
    includeFontPadding: false,
  } as TextStyle,
  /** 标题：白色衬线、大字距（冻结稿 y891-946，字高 ≈46px）；下接金色短下划线（y965，宽 ≈ 标题文字宽） */
  stepTitle: {
    ...INK_SHADOW,
    color: '#FFFFFF',
    fontFamily: font.serif,
    fontSize: fs(21),
    fontWeight: '600',
    letterSpacing: 2.5,
    lineHeight: 26,
    marginTop: 10,
    includeFontPadding: false,
  } as TextStyle,
  titleUnderline: {
    backgroundColor: GUIDE_GOLD,
    borderRadius: 1,
    marginTop: 5,
  } as ViewStyle,
  stepDesc: {
    ...INK_SHADOW,
    color: 'rgba(253,254,253,0.92)',
    fontFamily: font.sans,
    fontSize: fs(12.5),
    letterSpacing: 1,
    lineHeight: 19,
    marginTop: 9,
    includeFontPadding: false,
  } as TextStyle,
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  } as ViewStyle,
  errorCard: {
    flex: 1,
    minWidth: 0,
  } as ViewStyle,
  errorImageBox: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  errorImage: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
  /** 「× 徽章 + 避免」两行式标注（冻结稿：第一行徽章+避免 y1267，第二行原因小字） */
  errorCaption: {
    alignItems: 'flex-start',
  } as ViewStyle,
  errorCaptionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as ViewStyle,
  errorCaptionLead: {
    ...INK_SHADOW,
    color: '#FFFFFF',
    fontFamily: font.sans,
    fontSize: fs(12),
    fontWeight: '600',
    letterSpacing: 1,
    includeFontPadding: false,
  } as TextStyle,
  errorCaptionReason: {
    ...INK_SHADOW,
    color: 'rgba(216,228,238,0.85)',
    fontFamily: font.sans,
    fontSize: fs(9.5),
    letterSpacing: 0.5,
    marginTop: 2,
    includeFontPadding: false,
  } as TextStyle,
  /** 合格提示条：金色居中，两侧短横线 + 轮廓小鱼（冻结稿 ≈ 整条 370×26px） */
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  hintDash: {
    backgroundColor: GUIDE_GOLD,
    borderRadius: 1,
    opacity: 0.85,
  } as ViewStyle,
  hintText: {
    ...INK_SHADOW,
    color: GUIDE_GOLD,
    fontFamily: font.sans,
    fontSize: fs(10.5),
    letterSpacing: 1.5,
    includeFontPadding: false,
  } as TextStyle,
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  actionBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  } as ViewStyle,
  secondaryDivider: {
    width: 1,
    height: 13,
    backgroundColor: 'rgba(246,249,251,0.35)',
  } as ViewStyle,
  secondaryActionText: {
    ...INK_SHADOW,
    color: 'rgba(246,249,251,0.95)',
    fontFamily: font.sans,
    fontSize: fs(12.5),
    includeFontPadding: false,
  } as TextStyle,
  /** 「跳过」带下划线（冻结稿 y1579 细线，宽随文字） */
  skipUnderline: {
    alignSelf: 'stretch',
    height: 1,
    marginTop: 3,
    backgroundColor: 'rgba(255,255,255,0.72)',
  } as ViewStyle,
  /** 主操作：米白胶囊 + 深藏青字（冻结稿 314×98） */
  primaryAction: {
    backgroundColor: PRIMARY_BG,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  } as ViewStyle,
  primaryActionText: {
    color: PRIMARY_INK,
    fontFamily: font.sans,
    fontSize: fs(14),
    fontWeight: '600',
    letterSpacing: 1,
    includeFontPadding: false,
  } as TextStyle,
});
