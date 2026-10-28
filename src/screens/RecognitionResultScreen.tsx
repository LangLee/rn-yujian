import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  useWindowDimensions,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { AppIcon } from '../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import type { RouteProp } from '@react-navigation/native';
import { useRecognition } from '../contexts/RecognitionContext';
import { useAuth, isUnauthorizedError } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  CatchLocation,
  CatchSaveDraft,
  FeedbackDraft,
  FeedbackTypeWire,
  FishGuideItem,
  RecognitionCandidate,
} from '../types/models';
import { catchService } from '../services/catchService';
import { catchMemoryService } from '../services/catchMemoryService';
import {
  fishKnowledgeService,
  localGuideItems,
  mergeGuideItems,
} from '../services/fishKnowledgeService';
import { PressableScale } from '../components/ui/PressableScale';
import { KeyboardAvoidingScrollView } from '../components/ui';
import { ScreenHeader } from '../components';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { MorningLakeScene } from '../components/coreui';
import {
  RESULT_MARGIN,
  ResultCandidateRow,
  ResultFieldRows,
  ResultHeroViewport,
  ResultLocationSheet,
  ResultMeasureSheet,
  ResultNoteCard,
  CandidateItem,
} from '../components/result/ResultKit';
import { palette } from '../constants/colors';
import { font, fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import { Alert } from '../utils/alert';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type ResultScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Result'
>;
type ResultScreenRouteProp = RouteProp<RootStackParamList, 'Result'>;

const generateSourceEventId = (): string =>
  `APP_${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

type ResultState = 'high' | 'medium' | 'low';

/**
 * P04 识别结果（Recognition Result 冻结设计包 V1 + 关键帧 05-09 逐像素还原）：
 * 高置信度 = Hero(主体优先) → 鱼种身份行(30sp + 修改鱼种›) → 行输入卡
 * (长度/重量/地点 整行点按弹 Sheet 输入+›；值展示带单位) → 感言卡(写下这次鱼获的故事+语音胶囊+0/300)
 * → 双 CTA(继续记忆·相册图标 / 保存本次鱼获·金描边)。
 * 中置信度 = 一行确认提示 + 横向候选卡(Top-1 模型建议·弱青边；选中 2dp 青) +
 * 都不是？选择其他鱼种 ›；选定后提示退场、身份行回显选定鱼种，候选区保留可更换；
 * 记录区常驻，选定鱼种前保存禁用。
 * 低置信度 = 无法确认是什么鱼 + 按钮对(手动选择鱼种·白底金边 / 重新拍摄·灰蓝底)，
 * 记录区同样常驻展示（保存需先选定鱼种）。
 * 视觉基调自然安静纪实；不继承处理页任何 AI 光效。
 */
export const RecognitionResultScreen: React.FC = () => {
  const navigation = useNavigation<ResultScreenNavigationProp>();
  const route = useRoute<ResultScreenRouteProp>();
  const isFocused = useIsFocused();
  const { image, result, submitFeedback, reset } = useRecognition();
  const { session, logout } = useAuth();
  const { reload } = useCatchArchive();
  const { privacy } = usePreferences();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [selectedKey, setSelectedKey] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [lengthText, setLengthText] = useState('');
  const [lengthAuto, setLengthAuto] = useState(false);
  const [weightText, setWeightText] = useState('');
  const [locationText, setLocationText] = useState('');
  const [storyText, setStoryText] = useState('');
  const [saving, setSaving] = useState(false);
  const [slowSaving, setSlowSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 行编辑 Sheet（长度/重量/地点整行点按弹出，编辑永不离开结果页） */
  const [sheet, setSheet] = useState<'length' | 'weight' | 'location' | null>(
    null
  );

  const prediction = result?.prediction ?? null;

  // 拍照页量尺测得的真实长度：自动填入长度字段，用户手动修改后提示退场
  const measuredCm = image?.measuredLengthCm ?? null;
  useEffect(() => {
    if (typeof measuredCm === 'number' && measuredCm > 0) {
      setLengthText(String(Math.round(measuredCm * 10) / 10));
      setLengthAuto(true);
    } else {
      setLengthAuto(false);
    }
  }, [measuredCm]);

  // 长度/重量校验移入 ResultMeasureSheet（非法非空值 Sheet 内提示并禁用完成）

  // 拍照页带入的钓点（自动定位 / 手动选点）：自动填入地点字段
  const carriedLocation = image?.location ?? null;
  const [activeLocation, setActiveLocation] = useState<CatchLocation | null>(
    carriedLocation
  );
  useEffect(() => {
    if (carriedLocation?.label) {
      setLocationText(carriedLocation.label);
      setActiveLocation(carriedLocation);
    } else {
      setActiveLocation(null);
    }
  }, [carriedLocation]);

  const state: ResultState = useMemo(() => {
    if (!prediction) {
      return 'high';
    }
    if (!prediction.lowConfidence) {
      return 'high';
    }
    return prediction.candidates.length >= 2 ? 'medium' : 'low';
  }, [prediction]);

  useEffect(() => {
    if (!prediction) {
      return;
    }
    if (state === 'high') {
      setSelectedKey(prediction.top1.speciesKey);
      setSelectedName(prediction.top1.speciesName);
    } else {
      setSelectedKey('');
      setSelectedName('');
    }
  }, [prediction, state]);

  // 兜底跳失败页：只在本屏仍是栈顶时生效（返回转场期间 IdentifyScreen 重挂载会
  // reset 清空 result，此时本屏已在弹出中，再 replace 会与 pop 转场打架）。
  useEffect(() => {
    if (!isFocused) {
      return;
    }
    const routes = navigation.getState().routes;
    if (routes[routes.length - 1]?.key !== route.key) {
      return;
    }
    // 宽限 600ms：换图重识别的 replace→挂载窗口内，识别上下文的 setResult
    // 可能尚未对本屏可见（React Navigation 合并快速状态变更），瞬时读到空
    // result 会误弹 Issue —— 持续无效状态才路由。
    if (!result || !result.ready || !prediction) {
      const t = setTimeout(() => {
        const current = navigation.getState().routes;
        if (current[current.length - 1]?.key === route.key) {
          navigation.replace('RecognitionIssue');
        }
      }, 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isFocused, result, prediction, navigation, route.key]);

  // 入场（Motion Spec V1：克制的内容渐显；禁庆祝/光爆/循环动效）
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.985)).current;
  const nameTranslate = useRef(new Animated.Value(6)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    if (!hapticFiredRef.current) {
      hapticFiredRef.current = true;
      haptics.confirm();
    }
    if (reduceMotion) {
      heroOpacity.setValue(1);
      heroScale.setValue(1);
      nameOpacity.setValue(1);
      nameTranslate.setValue(0);
      return;
    }
    const animations = Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(heroScale, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.timing(nameOpacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(nameTranslate, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);
    animations.start();
    return () => animations.stop();
  }, [reduceMotion, heroOpacity, heroScale, nameOpacity, nameTranslate]);

  const candidates: RecognitionCandidate[] = useMemo(
    () => prediction?.candidates.slice(0, 3) ?? [],
    [prediction]
  );

  // 候选缩略图：按 speciesKey 从鱼鉴封面补齐（离线退回本地鱼种）
  const [guideCovers, setGuideCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    let mounted = true;
    (async () => {
      let items: FishGuideItem[];
      try {
        items = mergeGuideItems(await fishKnowledgeService.listSpecies());
      } catch {
        items = localGuideItems();
      }
      if (!mounted) {
        return;
      }
      const covers: Record<string, string> = {};
      for (const item of items) {
        const url = fishKnowledgeService.resolveAssetUrl(item.coverImage);
        if (url) {
          covers[item.id] = url;
        }
      }
      setGuideCovers(covers);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const candidateItems: CandidateItem[] = useMemo(
    () =>
      candidates.map((c) => ({
        key: c.speciesKey,
        name: c.speciesName,
        cover: guideCovers[c.speciesKey],
      })),
    [candidates, guideCovers]
  );

  const pickSpecies = useCallback(async () => {
    navigation.navigate('SpeciesPicker', { title: '选择鱼种' });
    const picked = await speciesPickerHub.requestPick();
    if (picked) {
      setSelectedKey(picked.key);
      setSelectedName(picked.name);
      haptics.selection();
    }
  }, [navigation]);

  /* 游客保存的续存意图：被引导去登录后，session 就绪自动完成本次保存 */
  const pendingSaveRef = useRef<{ toMemory: boolean } | null>(null);

  const doSave = useCallback(
    async (opts?: { toMemory?: boolean }) => {
      if (!image || !prediction) {
        setSaveError('识别信息缺失，请重新拍摄');
        return;
      }
      /* 拍照识别无需登录；保存鱼获才需要 —— 游客保存时提示登录，
         记住本次保存意图，登录返回后自动续存。 */
      if (!session) {
        pendingSaveRef.current = { toMemory: Boolean(opts?.toMemory) };
        Alert.alert(
          '登录后保存这条鱼获',
          '识别无需登录；登录后即可把这条鱼获存进你的自然档案，识别结果会为你保留。',
          [
            {
              text: '取消',
              style: 'cancel',
              onPress: () => {
                pendingSaveRef.current = null;
              },
            },
            {
              text: '去登录',
              onPress: () => {
                navigation.navigate('Login');
              },
            },
          ]
        );
        return;
      }
      const finalKey = selectedKey;
      const finalName = selectedName;
      if (!finalKey) {
        return;
      }
      const corrected = finalKey !== prediction.top1.speciesKey;
      const custom = finalKey.startsWith('user_');
      const feedbackType: FeedbackTypeWire = custom
        ? 'new_species_candidate'
        : corrected
        ? 'corrected'
        : 'confirmed';
      const feedback: FeedbackDraft = {
        sourceEventId: generateSourceEventId(),
        imageId: image.imageId,
        feedbackType,
        modelVersion: prediction.modelVersion,
        // 新后端契约：predicted/corrected_species 均传鱼种 ID（与 catches.species_id 同源）
        predictedSpecies: prediction.top1.speciesKey,
        confidence: prediction.top1.confidence,
        correctedSpecies: corrected || custom ? finalKey : null,
        userNote: `source=${image.source ?? 'unknown'}`,
      };
      const draft: CatchSaveDraft = {
        speciesId: finalKey,
        speciesName: finalName,
        confidence: prediction.top1.confidence,
        modelVersion: prediction.modelVersion,
        detectorResult: null,
        classifierResult: {
          model_version: prediction.modelVersion,
          prediction_species: prediction.top1.speciesKey,
          confidence: prediction.top1.confidence,
          user_selected_species: finalKey,
        },
      };

      setSaving(true);
      setSaveError(null);
      const slowTimer = setTimeout(() => setSlowSaving(true), 2000);
      try {
        const upload = await catchService.uploadImage(image.filePath);
        const savedCatch = await catchService.saveCatch(upload, draft);
        clearTimeout(slowTimer);
        setSlowSaving(false);
        setSaving(false);
        setSaved(true);
        haptics.confirm();
        reload();
        /* 填写内容（长度/重量/地点/感言）落本地记忆：普通保存不再丢失（18.2 本地优先） */
        try {
          const mem = await catchMemoryService.load(savedCatch.id);
          mem.lengthCm =
            mem.lengthCm ??
            (Number(lengthText) > 0 ? Number(lengthText) : null);
          mem.weightKg =
            mem.weightKg ??
            (Number(weightText) > 0 ? Number(weightText) : null);
          mem.location = mem.location ?? (locationText.trim() || null);
          mem.latitude = mem.latitude ?? activeLocation?.latitude ?? null;
          mem.longitude = mem.longitude ?? activeLocation?.longitude ?? null;
          if (storyText.trim()) {
            mem.story = storyText.trim();
          }
          await catchMemoryService.save(savedCatch.id, mem);
        } catch {
          // 本地记忆写入失败不阻断保存
        }
        submitFeedback(feedback).catch(() => undefined);
        /* 核心导航合同（手册 8.4）：
           保存鱼获 → Normal Home；保存并记录记忆 → CatchDetail(MEMORY) */
        setTimeout(() => {
          reset();
          if (opts?.toMemory) {
            navigation.replace('CatchDetail', {
              catchId: savedCatch.id,
              initialCatch: savedCatch,
              initialMemory: {
                lengthCm: Number(lengthText) > 0 ? Number(lengthText) : null,
                weightKg: Number(weightText) > 0 ? Number(weightText) : null,
                location: locationText.trim() || null,
                latitude: activeLocation?.latitude ?? null,
                longitude: activeLocation?.longitude ?? null,
                story: storyText.trim() || null,
              },
            });
          } else {
            navigation.popTo('Home');
          }
        }, 320);
      } catch (e) {
        clearTimeout(slowTimer);
        setSlowSaving(false);
        setSaving(false);
        if (isUnauthorizedError(e)) {
          await logout();
          return;
        }
        setSaveError(
          e instanceof Error ? e.message : '保存鱼获失败，内容没有丢失，请重试'
        );
      }
    },
    [
      session,
      image,
      prediction,
      selectedKey,
      selectedName,
      lengthText,
      weightText,
      locationText,
      storyText,
      activeLocation,
      reload,
      submitFeedback,
      logout,
      navigation,
      reset,
    ]
  );

  /* 游客保存被引导登录后：session 就绪即自动续存（识别上下文仍在内存，Result 页未销毁） */
  useEffect(() => {
    if (!session || !pendingSaveRef.current) {
      return;
    }
    const opts = pendingSaveRef.current;
    pendingSaveRef.current = null;
    void doSave(opts);
  }, [session, doSave]);

  if (!result || !result.ready || !prediction) {
    // 过渡期间 result 可能被清空：渲染带背景的空态，避免闪白屏
    return (
      <View style={[styles.screen, { backgroundColor: coreColors.lakeWhite }]}>
        <MorningLakeScene level="content" />
      </View>
    );
  }

  const imageUri = toFileUri(image?.filePath);
  /* Core UI V1 固定清晨湖畔世界 */
  const textPrimary = coreColors.deepLakeBlue;
  const textSecondary = coreColors.lakeBlue;
  const saveDisabled = !selectedKey;
  /** 不确定结果（中/低置信度）：选定鱼种后才进入已解析记录契约并回显身份行 */
  const resolved = state === 'high' || Boolean(selectedKey);
  const bbox = result.assessment.primary?.box ?? null;
  const contentWidth = Math.min(windowWidth - RESULT_MARGIN * 2, 440);

  return (
    <View style={styles.screen}>
      {/* BG_CONTENT：清晨湖畔世界，背景存在感降至 ~75%（Core Visual System §3） */}
      <MorningLakeScene level="content" />
      <ScreenHeader
        title="识别结果"
        onBack={() => navigation.popTo('Identify')}
        titleColor={textPrimary}
        backColor={textPrimary}
      />
      {/* 键盘避让：长度/重量/地点已改由 Sheet 内输入（Sheet 自带 KAV），此处
          只需处理感言卡聚焦——KeyboardAvoidingScrollView 统一双平台：iOS 用原生
          keyboard insets 滚聚焦框进可视区，Android edge-to-edge 下手动补键盘
          内边距并把聚焦框滚到键盘上方 */}
      <KeyboardAvoidingScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {/* Hero（Hero Media Contract：主体优先裁剪；外框 320×248dp@360 规范） */}
          <Animated.View
            style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}
          >
            <ResultHeroViewport
              uri={imageUri}
              bbox={
                bbox
                  ? { x1: bbox.x1, y1: bbox.y1, x2: bbox.x2, y2: bbox.y2 }
                  : null
              }
              mode="subject"
              width={contentWidth}
              accessibilityLabel="本次鱼获照片"
            />
          </Animated.View>

          {/* 鱼种身份行（44dp 规范：30sp 衬线 + 修改鱼种›）：高置信度直出；
              不确定结果（中/低置信度）选定鱼种后同样回显，修改鱼种可再次更换 */}
          {resolved ? (
            <Animated.View
              style={[
                styles.identityRow,
                {
                  opacity: nameOpacity,
                  transform: [{ translateY: nameTranslate }],
                },
              ]}
            >
              <Text
                style={[styles.speciesTitle, { color: textPrimary }]}
                numberOfLines={1}
              >
                {selectedName || prediction.top1.speciesName}
              </Text>
              <PressableScale
                onPress={pickSpecies}
                scaleTo={0.94}
                style={styles.editLinkHit}
              >
                <View style={styles.editLink} pointerEvents="none">
                  <Text style={styles.editLinkText}>修改鱼种</Text>
                  <AppIcon
                    name="chevron_right"
                    size={14}
                    color="#0F7A78"
                    style={styles.editLinkChevron}
                  />
                </View>
              </PressableScale>
            </Animated.View>
          ) : null}

          {/* 中置信度：未选定时一行确认提示 + 横向候选卡 + 都不是？选择其他鱼种 ›；
              选定后提示由身份行接替回显，候选区不收起（点卡片即更换），
              「选择其他鱼种」保留为再次替换入口 */}
          {state === 'medium' ? (
            <Animated.View
              style={{
                opacity: nameOpacity,
                transform: [{ translateY: nameTranslate }],
              }}
            >
              {!resolved ? (
                <Text style={[styles.mediumPrompt, { color: textPrimary }]}>
                  帮我确认一下，这条鱼更像哪一种？
                </Text>
              ) : null}
              <View style={styles.candidateWrap}>
                <ResultCandidateRow
                  candidates={candidateItems}
                  selectedKey={selectedKey}
                  suggestedKey={candidates[0]?.speciesKey}
                  onSelect={(c) => {
                    setSelectedKey(c.key);
                    setSelectedName(c.name);
                    haptics.selection();
                  }}
                  contentWidth={contentWidth}
                />
              </View>
              <PressableScale
                onPress={pickSpecies}
                style={styles.otherSpeciesHit}
              >
                <View style={styles.otherSpeciesLink} pointerEvents="none">
                  <Text style={styles.otherSpeciesText}>
                    都不是？选择其他鱼种
                  </Text>
                  <AppIcon
                    name="chevron_right"
                    size={13}
                    color={textSecondary}
                  />
                </View>
              </PressableScale>
            </Animated.View>
          ) : null}

          {/* 低置信度恢复对（Action Button V1.1 冻结配比：
            SECONDARY_STRONG 手动选择 58% / SECONDARY_MUTED 重新拍摄 42%）；
            选定鱼种后记录区可保存，按钮对保持常驻 */}
          {state === 'low' ? (
            <Animated.View
              style={{
                opacity: nameOpacity,
                transform: [{ translateY: nameTranslate }],
              }}
            >
              <Text style={[styles.lowMessage, { color: textPrimary }]}>
                无法确认是什么鱼
              </Text>
              <View style={styles.lowPair}>
                <PrimaryButton
                  label="手动选择"
                  variant="secondaryStrong"
                  onPress={pickSpecies}
                  disabled={saving || saved}
                  style={styles.lowBtnStrong}
                />
                <PrimaryButton
                  label="重新拍摄"
                  variant="secondaryMuted"
                  onPress={() => navigation.popTo('Identify')}
                  disabled={saving || saved}
                  style={styles.lowBtnMuted}
                />
              </View>
            </Animated.View>
          ) : null}

          {/* 记录契约区（关键帧 05/06/07 常驻）：行输入卡 + 感言卡 + 双 CTA；
            未选定鱼种时保存禁用（低/中置信度先确认鱼种） */}
          <View style={styles.recordGap}>
            <ResultFieldRows
              lengthText={lengthText}
              weightText={weightText}
              locationLabel={locationText || null}
              onEditLength={() => setSheet('length')}
              onEditWeight={() => setSheet('weight')}
              onEditLocation={() => {
                if (privacy.manualLocationEdit) {
                  setSheet('location');
                }
              }}
            />

            {/* 量尺自动填入提示（运行时行为：用户改动后消失） */}
            {lengthAuto && lengthText ? (
              <View style={styles.autoLenRow}>
                <AppIcon
                  name="success"
                  size={12}
                  color={coreColors.morningGold}
                />
                <Text style={styles.autoLenText}>
                  已填入量尺测量结果 {lengthText} cm，可手动修改
                </Text>
              </View>
            ) : null}

            <ResultNoteCard value={storyText} onChange={setStoryText} />

            {saveError ? (
              <Text
                style={[styles.errorText, { color: palette.qualityInvalid }]}
              >
                {saveError}
              </Text>
            ) : null}
            {slowSaving ? (
              <Text style={[styles.slowHint, { color: textSecondary }]}>
                正在保存这次鱼获…
              </Text>
            ) : null}

            {/* 双 CTA（Action Button V1.1 冻结配比：SECONDARY_STRONG 继续记录记忆 44% / PRIMARY 保存本次鱼获 56%） */}
            <View style={styles.ctaRow}>
              <PrimaryButton
                label="继续记录记忆"
                variant="secondaryStrong"
                onPress={() => doSave({ toMemory: true })}
                disabled={saveDisabled || saving || saved}
                loading={saving}
                style={styles.ctaLight}
              />
              <PrimaryButton
                label="保存本次鱼获"
                variant="primary"
                onPress={() => doSave()}
                disabled={saveDisabled}
                loading={saving}
                saved={saved}
                savedLabel="已保存"
                style={styles.ctaPrimary}
              />
            </View>
          </View>
      </KeyboardAvoidingScrollView>

      {/* 长度/重量数值输入 Sheet（编辑永不离开结果页；提交后行内展示值+单位） */}
      <ResultMeasureSheet
        visible={sheet === 'length'}
        kind="length"
        value={lengthText}
        onClose={() => setSheet(null)}
        onCommit={(t) => {
          /* 量尺自动填入提示：仅当用户实际改动值时退场 */
          if (t !== lengthText) {
            setLengthAuto(false);
          }
          setLengthText(t);
        }}
      />
      <ResultMeasureSheet
        visible={sheet === 'weight'}
        kind="weight"
        value={weightText}
        onClose={() => setSheet(null)}
        onCommit={setWeightText}
      />

      {/* 地点编辑 Sheet（编辑永不离开结果页） */}
      {privacy.manualLocationEdit ? (
        <ResultLocationSheet
          visible={sheet === 'location'}
          currentLabel={locationText || null}
          onClose={() => setSheet(null)}
          onCommit={(place) => {
            setActiveLocation(place);
            setLocationText(place.label.slice(0, 40));
          }}
          onClear={() => {
            setActiveLocation(null);
            setLocationText('');
          }}
        />
      ) : null}
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
  content: {
    paddingHorizontal: 20,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  } as ViewStyle,
  /* 鱼种身份行：44dp 规范，标题 30sp/36sp 衬线 */
  identityRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
  } as ViewStyle,
  speciesTitle: {
    flexShrink: 1,
    fontFamily: font.serif,
    fontSize: fs(30),
    lineHeight: fs(36),
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  editLinkHit: {
    borderRadius: 12,
  } as ViewStyle,
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 6,
    paddingLeft: 8,
  } as ViewStyle,
  editLinkText: {
    /* Text Action V1 / NORMAL / LIGHT：14sp·500·Deep Lake Teal（无下划线、无金色） */
    fontSize: fs(14),
    fontWeight: '500',
    color: '#0F7A78',
  } as TextStyle,
  editLinkChevron: {
    /* 文字↔chevron 4dp；chevron 继承动作色调 */
    marginLeft: 4,
  } as ViewStyle,
  /* 中置信度 */
  mediumPrompt: {
    fontFamily: font.serif,
    fontSize: fs(20),
    lineHeight: fs(28),
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
  } as TextStyle,
  candidateWrap: {
    marginTop: 12,
  } as ViewStyle,
  otherSpeciesHit: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingVertical: 4,
  } as ViewStyle,
  otherSpeciesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  otherSpeciesText: {
    fontSize: fs(13),
    color: coreColors.lakeBlue,
    letterSpacing: 1,
  } as TextStyle,
  /* 低置信度 */
  lowMessage: {
    fontFamily: font.serif,
    fontSize: fs(26),
    lineHeight: fs(34),
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 16,
  } as TextStyle,
  lowPair: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  } as ViewStyle,
  /* Action Button V1.1 低置信度冻结配比 58/42 */
  lowBtnStrong: {
    flex: 58,
  } as ViewStyle,
  lowBtnMuted: {
    flex: 42,
  } as ViewStyle,
  /* 记录契约区 */
  recordGap: {
    gap: 12,
    marginTop: 16,
  } as ViewStyle,
  autoLenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  } as ViewStyle,
  autoLenText: {
    color: '#9A7B3F',
    fontSize: fs(12),
    letterSpacing: 0.5,
  } as TextStyle,
  errorText: {
    textAlign: 'center',
    fontSize: fs(12),
  } as TextStyle,
  slowHint: {
    textAlign: 'center',
    fontSize: fs(12),
  } as TextStyle,
  /* 双 CTA（Action Button V1.1：确认态 44/56 冻结配比，间距 12dp） */
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  } as ViewStyle,
  ctaLight: {
    flex: 44,
  } as ViewStyle,
  ctaPrimary: {
    flex: 56,
  } as ViewStyle,
});
