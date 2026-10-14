import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { AppIcon } from '../../components/icons/AppIcon';
import { StackNavigationProp } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { font, fs, spacing } from '../../constants/tokens';
import { ShareWork, shareWorkService } from '../../services/shareWorkService';
import { WaterBackdrop } from '../../components/WaterBackdrop';
import { PressableScale } from '../../components/ui/PressableScale';
import { ScreenHeader } from '../../components';
import { PosterCanvas, POSTER_ASPECT } from './PosterCanvas';
import {
  alertSaveResult,
  savePosterToAlbum,
  sharePoster,
} from '../../utils/posterCapture';
import { hapticForLevel } from '../../utils/haptics';

type PreviewNavigationProp = StackNavigationProp;
type PreviewRoute = RouteProp<
  { SharePreview: { work: ShareWork; mode?: 'create' | 'view'; from?: 'annual' } },
  'SharePreview'
>;

type Stage = 'preview' | 'generating' | 'result';

const GOLD = '#D6A541';
const GOLD_LIGHT = '#E7D2A2';

const GEN_STEPS = [
  'AI 正在整理鱼获数据',
  '挑选照片与水边故事',
  '选择模板并排版作品',
];
const GEN_TIPS = [
  '小提示：记录的鱼获数据越完整，生成的作品越精彩。',
  '小提示：在鱼获详情里补上重量和地点，海报会更完整。',
  '小提示：生成后可以随时更换模板或布局重新制作。',
];

/**
 * 分享作品预览（P14 / P15 / P16）：
 * 排版预览（布局切换）→ 生成过程（进度环）→ 最终作品（保存 / 分享 / 重新制作）。
 * mode=view 时直接进入最终作品（查看已保存作品）。
 */
export const SharePreviewScreen: React.FC = () => {
  const navigation = useNavigation<PreviewNavigationProp>();
  const route = useRoute<PreviewRoute>();
  const { profile } = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const accessToken = session?.accessToken ?? null;

  const mode = route.params?.mode ?? 'create';
  const [baseWork] = useState<ShareWork>(route.params.work);
  const [stage, setStage] = useState<Stage>(mode === 'view' ? 'result' : 'preview');
  const [layoutIndex, setLayoutIndex] = useState(baseWork.layoutIndex);
  const [percent, setPercent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const posterRef = useRef<View>(null);
  const saveGuard = useRef(false);

  const work = useMemo<ShareWork>(() => ({ ...baseWork, layoutIndex }), [baseWork, layoutIndex]);

  // 生成过程：进度环 0 → 100，结束后进入最终作品
  useEffect(() => {
    if (stage !== 'generating') {
      return;
    }
    const listenerId = progress.addListener(({ value }) => setPercent(Math.round(value * 100)));
    Animated.timing(progress, {
      toValue: 1,
      duration: 3200,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      progress.removeListener(listenerId);
      if (!finished) {
        return;
      }
      hapticForLevel('s2');
      if (mode === 'create' && !saveGuard.current) {
        saveGuard.current = true;
        void shareWorkService.save({ ...work, layoutIndex });
      }
      setStage('result');
    });
    return () => {
      progress.removeListener(listenerId);
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [stage, progress, mode, work]);

  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const templateName = work.templateId === 'story' ? '水边故事' : '战绩卡';

  const posterWidth = POSTER_W;

  const handleSave = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    const result = await savePosterToAlbum(posterRef);
    setSaving(false);
    if (result === 'saved') {
      setSaved(true);
      hapticForLevel('s2');
    }
    alertSaveResult(result);
  };

  const handleShare = async () => {
    await sharePoster(posterRef, work.shareMessage);
  };

  const handleRemake = () => {
    if (mode === 'create') {
      setStage('preview');
    } else {
      // 查看历史作品：回到生成设置重新配置
      navigation.navigate('ShareCreate', {
        presetRange: work.rangeKey,
        presetTemplate: work.templateId,
      });
    }
  };

  const handleBack = () => {
    if (stage === 'result' && mode === 'create') {
      // 生成完成：回到来源列表（年度回顾 / 鱼获分享）
      if (route.params?.from === 'annual') {
        navigation.goBack();
      } else {
        navigation.pop(2);
      }
      return;
    }
    navigation.goBack();
  };

  // ---------------------------------------------------------------------
  // 生成过程舞台
  // ---------------------------------------------------------------------
  if (stage === 'generating') {
    const stepIndex = Math.min(GEN_STEPS.length - 1, Math.floor((percent / 100) * GEN_STEPS.length));
    const tipIndex = Math.floor(Date.now() / 1000) % GEN_TIPS.length;
    return (
      <View style={styles.screen}>
        <WaterBackdrop />
        <ScreenHeader
          title="正在生成"
          onBack={() => (mode === 'create' ? setStage('preview') : navigation.goBack())}
        />
        <View style={styles.generatingWrap}>
          <View style={styles.ringWrap}>
            <ProgressRing percent={percent} size={150} />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={[styles.ringPercent, { color: textPrimary }]}>{percent}%</Text>
            </View>
          </View>

          <Text style={[styles.genStepTitle, { color: textPrimary }]}>正在生成你的鱼获记忆</Text>
          <Text style={[styles.genStepText, { color: textSecondary }]}>{GEN_STEPS[stepIndex]}</Text>
          <Text style={[styles.genEta, { color: textSecondary }]}>预计还需 {Math.max(1, Math.ceil((100 - percent) * 0.032))} 秒</Text>

          <View
            style={[
              styles.tipCard,
              {
                backgroundColor: profile.surface.glass,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <Text style={[styles.tipTitle, { color: GOLD_LIGHT }]}>小提示</Text>
            <Text style={[styles.tipText, { color: textSecondary }]}>{GEN_TIPS[tipIndex]}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------
  // 预览 / 最终作品舞台
  // ---------------------------------------------------------------------
  const isResult = stage === 'result';

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      {/* 统一头部：返回 + 居中标题 + 分享按钮（与全应用一致） */}
      <ScreenHeader
        title={isResult ? '生成完成' : `${templateName}预览`}
        onBack={handleBack}
        right={
          !isResult ? (
            <PressableScale onPress={handleShare} scaleTo={0.94} style={styles.shareHit}>
              <View
                style={[
                  styles.sharePill,
                  {
                    backgroundColor: profile.isDark
                      ? 'rgba(255,255,255,0.14)'
                      : 'rgba(255,255,255,0.85)',
                    borderColor: profile.surface.glassBorder,
                  },
                ]}
              >
                <AppIcon name="share" size={14} color={textPrimary} />
                <Text style={[styles.sharePillText, { color: textPrimary }]}>分享预览</Text>
              </View>
            </PressableScale>
          ) : null
        }
      />
      <Text style={styles.headerSubline}>
        {isResult ? '你的鱼获记忆已生成' : '已根据你的设置自动排版'}
      </Text>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 海报 */}
        <View style={styles.posterHit}>
          <View
            ref={posterRef}
            collapsable={false}
            style={[
              styles.posterCard,
              {
                borderRadius: 18,
                shadowColor: '#0B2D4B',
                shadowOpacity: 0.18,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              },
            ]}
          >
            <PosterCanvas work={work} width={posterWidth} authToken={accessToken} />
          </View>
        </View>

        {/* 布局选择（仅预览阶段） */}
        {!isResult ? (
          <View
            style={[
              styles.layoutPanel,
              {
                backgroundColor: profile.surface.glassStrong,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            <View style={styles.layoutHeader}>
              <Text style={[styles.layoutTitle, { color: textPrimary }]}>
                {work.templateId === 'story' ? '照片布局' : '选择布局'}
              </Text>
              <PressableScale
                onPress={() => setLayoutIndex((value) => (value + 1) % 3)}
                scaleTo={0.96}
              >
                <View style={styles.layoutShuffle}>
                  <AppIcon name="retry_refresh" size={13} color={GOLD} />
                  <Text style={[styles.layoutShuffleText, { color: GOLD }]}>换一种布局</Text>
                </View>
              </PressableScale>
            </View>
            <View style={styles.layoutRow}>
              {[0, 1, 2].map((index) => (
                <LayoutThumb
                  key={index}
                  work={{ ...work, layoutIndex: index }}
                  selected={layoutIndex === index}
                  authToken={accessToken}
                  onPress={() => setLayoutIndex(index)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* 底部操作 */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: insets.bottom + (stage === 'result' ? spacing.lg : spacing.md),
            backgroundColor: profile.isDark ? 'rgba(10,32,40,0.82)' : 'rgba(255,255,255,0.72)',
            borderTopColor: profile.surface.glassBorder,
          },
        ]}
      >
        <View style={styles.actionRow}>
        {isResult ? (
          <>
            <PressableScale onPress={handleSave} disabled={saving} scaleTo={0.96} style={styles.actionHalf}>
              <View
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: profile.isDark
                      ? 'rgba(255,255,255,0.14)'
                      : 'rgba(255,255,255,0.85)',
                    borderColor: profile.surface.glassBorder,
                  },
                ]}
              >
                <AppIcon
                  name={saved ? 'check' : 'save'}
                  size={17}
                  color={saved ? profile.surface.accent : textPrimary}
                />
                <Text style={[styles.secondaryText, { color: textPrimary }]}>
                  {saving ? '正在保存…' : saved ? '已保存' : '保存图片'}
                </Text>
              </View>
            </PressableScale>
            <PressableScale onPress={handleShare} scaleTo={0.96} style={styles.actionHalf}>
              <View style={styles.primaryButton}>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgGradient id="resultShareBg" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={GOLD_LIGHT} />
                      <Stop offset="1" stopColor={GOLD} />
                    </SvgGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#resultShareBg)" rx="26" />
                </Svg>
                <View style={styles.primaryRow} pointerEvents="none">
                  <AppIcon name="share" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryText}>分享作品</Text>
                </View>
              </View>
            </PressableScale>
          </>
        ) : (
          <>
            <PressableScale onPress={() => navigation.goBack()} scaleTo={0.96} style={styles.actionHalf}>
              <View
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: profile.isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(255,255,255,0.6)',
                    borderColor: profile.surface.glassBorder,
                  },
                ]}
              >
                <Text style={[styles.secondaryText, { color: textSecondary }]}>返回修改内容</Text>
              </View>
            </PressableScale>
            <PressableScale onPress={() => setStage('generating')} scaleTo={0.96} style={styles.actionHalf}>
              <View style={styles.primaryButton}>
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgGradient id="genCtaBg" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={GOLD_LIGHT} />
                      <Stop offset="1" stopColor={GOLD} />
                    </SvgGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#genCtaBg)" rx="26" />
                </Svg>
                <View style={styles.primaryRow} pointerEvents="none">
                  <Text style={styles.primaryText}>生成作品</Text>
                  <AppIcon name="chevron_right" size={16} color="#FFFFFF" />
                </View>
              </View>
            </PressableScale>
          </>
        )}
        </View>
        {isResult ? (
          <PressableScale onPress={handleRemake} scaleTo={0.96} style={styles.remakeHit}>
            <Text style={[styles.remakeText, { color: textSecondary }]}>
              {mode === 'create' ? '重新制作' : '换个模板再做一张'}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
};

/** 海报宽度（与页面左右边距一致）。 */
const POSTER_W = Dimensions.get('window').width - spacing.page * 2;

/** 生成进度环（SVG 圆环 + 渐变描边）。 */
const ProgressRing: React.FC<{ percent: number; size: number }> = ({ percent, size }) => {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="1" stopColor={GOLD} />
        </SvgGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(23,59,75,0.12)"
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="url(#ringGrad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={[circumference]}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
};

/** 布局缩略图：迷你海报 + 选中金框。 */
const LayoutThumb: React.FC<{
  work: ShareWork;
  selected: boolean;
  authToken: string | null;
  onPress: () => void;
}> = ({ work, selected, authToken, onPress }) => {
  const BASE_W = 128;
  const THUMB_W = 100;
  const scale = THUMB_W / BASE_W;
  return (
    <PressableScale onPress={onPress} scaleTo={0.96} style={styles.layoutThumbHit}>
      <View
        style={[
          styles.layoutThumb,
          {
            width: THUMB_W,
            height: BASE_W * POSTER_ASPECT * scale,
            borderRadius: 10,
            borderColor: selected ? GOLD : 'rgba(23,59,75,0.14)',
            borderWidth: selected ? 2 : 1,
          },
        ]}
      >
        <View
          style={{
            width: BASE_W,
            height: BASE_W * POSTER_ASPECT,
            transform: [{ scale }],
            transformOrigin: 'top left',
          }}
        >
          <PosterCanvas work={work} width={BASE_W} authToken={authToken} />
        </View>
        {selected ? (
          <View style={styles.layoutThumbCheck}>
            <AppIcon name="check" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  /* 页面说明行（Top Navigation V1 不承载副标题） */
  headerSubline: {
    fontSize: fs(13),
    lineHeight: fs(18),
    color: '#748897',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
  } as TextStyle,
  screen: {
    flex: 1,
  } as ViewStyle,
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  shareHit: {
    height: 40,
    justifyContent: 'center',
  } as ViewStyle,
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#0B2D4B',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  } as ViewStyle,
  sharePillText: {
    fontSize: fs(12.5),
    fontWeight: '600',
  } as TextStyle,
  posterHit: {
    marginTop: spacing.lg,
    borderRadius: 18,
  } as ViewStyle,
  posterCard: {
    overflow: 'hidden',
    backgroundColor: '#E8F0EF',
  } as ViewStyle,
  layoutPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  } as ViewStyle,
  layoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  } as ViewStyle,
  layoutTitle: {
    fontSize: fs(14.5),
    fontWeight: '700',
  } as TextStyle,
  layoutShuffle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  layoutShuffleText: {
    fontSize: fs(12.5),
    fontWeight: '600',
  } as TextStyle,
  layoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  } as ViewStyle,
  layoutThumbHit: {
    borderRadius: 10,
  } as ViewStyle,
  layoutThumb: {
    overflow: 'hidden',
    backgroundColor: '#E8F0EF',
  } as ViewStyle,
  layoutThumbCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  } as ViewStyle,
  actionHalf: {
    flex: 1,
  } as ViewStyle,
  secondaryButton: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  } as ViewStyle,
  secondaryText: {
    fontSize: fs(14.5),
    fontWeight: '600',
  } as TextStyle,
  primaryButton: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#8A6A2F',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  } as ViewStyle,
  primaryRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  } as ViewStyle,
  primaryText: {
    color: '#FFFFFF',
    fontSize: fs(15),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  remakeHit: {
    alignSelf: 'center',
    marginTop: spacing.md,
  } as ViewStyle,
  remakeText: {
    fontSize: fs(12.5),
    textDecorationLine: 'underline',
  } as TextStyle,
  generatingWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  ringWrap: {
    marginTop: spacing.xxl + spacing.lg,
    width: 150,
    height: 150,
  } as ViewStyle,
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  ringPercent: {
    fontFamily: font.serif,
    fontSize: fs(34),
    fontWeight: '700',
  } as TextStyle,
  genStepTitle: {
    fontSize: fs(16),
    fontWeight: '700',
    marginTop: spacing.xl,
  } as TextStyle,
  genStepText: {
    fontSize: fs(13),
    marginTop: 8,
  } as TextStyle,
  genEta: {
    fontSize: fs(12),
    marginTop: 5,
    opacity: 0.8,
  } as TextStyle,
  tipCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.xxl + spacing.xl,
  } as ViewStyle,
  tipTitle: {
    fontSize: fs(12),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  tipText: {
    fontSize: fs(12.5),
    lineHeight: 19,
    marginTop: 4,
  } as TextStyle,
});
