import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import { useIsFocused, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';
import { StackNavigationProp, RootStackParamList } from '../navigation/types';
import { useRecognition } from '../contexts/RecognitionContext';
import { useAuth, isUnauthorizedError } from '../contexts/AuthContext';
import { useCatchArchive } from '../contexts/CatchContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  CatchSaveDraft,
  FeedbackDraft,
  FeedbackTypeWire,
  RecognitionCandidate,
} from '../types/models';
import { catchService } from '../services/catchService';
import { recognitionService } from '../services/recognitionService';
import { WaterBackdrop } from '../components/WaterBackdrop';
import { PressableScale } from '../components/ui/PressableScale';
import { ScreenHeader } from '../components';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { RadioDot } from '../components/ui/RadioDot';
import { FishGlyph } from '../components/ui/FishGlyph';
import { palette } from '../constants/colors';
import { font, radius, spacing } from '../constants/tokens';
import { toFileUri } from '../utils/fileUri';
import { haptics } from '../utils/haptics';
import { speciesPickerHub } from '../utils/speciesPickerHub';

type ResultScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Result'>;

const UNKNOWN_KEY = 'unknown';
const UNKNOWN_NAME = '未识别鱼种';
const GOLD = '#C9A96A';

const generateSourceEventId = (): string =>
  `APP_${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

type ResultState = 'high' | 'medium' | 'low';

/**
 * P04 识别结果（设计文档 7.3 置信度状态合同 + 高保真确认页参考稿）：
 * 真实鱼获照片 + 鱼名 + 长度重量地点 + 可修改鱼种 + 保存鱼获。
 * 中置信度：「帮我确认一下」+ Top3 候选行（缩略图 / 推荐 chip / 金色单选）。
 */
export const RecognitionResultScreen: React.FC = () => {
  const navigation = useNavigation<ResultScreenNavigationProp>();
  const isFocused = useIsFocused();
  const { image, result, selectImage, submitFeedback, reset } = useRecognition();
  const { session, logout } = useAuth();
  const { reload } = useCatchArchive();
  const { profile } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedKey, setSelectedKey] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [lengthText, setLengthText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [locationText, setLocationText] = useState('');
  const [saving, setSaving] = useState(false);
  const [slowSaving, setSlowSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const prediction = result?.prediction ?? null;

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

  // 守卫只在获得焦点时生效：退场转场期间 IdentifyScreen 重挂载会 reset 清空 result，
  // 若此刻再 replace 会与 pop 动画打架，把页面卡在空白中间态（重新拍摄白屏的根因）
  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (!result || !result.ready || !prediction) {
      navigation.replace('RecognitionIssue');
    }
  }, [isFocused, result, prediction, navigation]);

  // Reveal（17.8 / 17.9）：Hero 立即成为主角 + S2 Confirm 一次
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
  }, [heroOpacity, heroScale, nameOpacity, nameTranslate]);

  const candidates: RecognitionCandidate[] = useMemo(
    () => prediction?.candidates.slice(0, 3) ?? [],
    [prediction],
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

  // 低置信度参考稿：「从相册选择」次级胶囊 —— 换一张照片重新识别
  const repickFromGallery = useCallback(() => {
    haptics.selection();
    launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 }, (response) => {
      if (response.didCancel || response.errorCode) {
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (!uri) {
        return;
      }
      void (async () => {
        try {
          const meta = await recognitionService.normalizeImage(uri, 'gallery');
          selectImage(meta);
          navigation.navigate('Recognizing');
        } catch {
          // 选片失败静默返回，不打断当前结果页
        }
      })();
    });
  }, [selectImage, navigation]);

  const doSave = useCallback(
    async (overrideKey?: string, overrideName?: string) => {
      if (!session || !image || !prediction) {
        setSaveError('登录状态已失效，请重新登录');
        return;
      }
      const finalKey = overrideKey ?? selectedKey;
      const finalName = overrideName ?? selectedName;
      if (state === 'medium' && !finalKey) {
        return;
      }
      const isUnknown = finalKey === UNKNOWN_KEY;
      const corrected = Boolean(finalKey) && finalKey !== prediction.top1.speciesKey;
      const custom = finalKey.startsWith('user_');
      const feedbackType: FeedbackTypeWire =
        isUnknown || custom ? 'new_species_candidate' : corrected ? 'corrected' : 'confirmed';
      const feedback: FeedbackDraft = {
        sourceEventId: generateSourceEventId(),
        imageId: image.imageId,
        feedbackType,
        modelVersion: prediction.modelVersion,
        predictedSpecies: prediction.top1.speciesName,
        confidence: prediction.top1.confidence,
        correctedSpecies: corrected || isUnknown || custom ? finalName : null,
        userNote: `source=${image.source ?? 'unknown'}`,
      };
      const draft: CatchSaveDraft = {
        speciesId: finalKey || UNKNOWN_KEY,
        speciesName: finalName || UNKNOWN_NAME,
        confidence: prediction.top1.confidence,
        modelVersion: prediction.modelVersion,
        detectorResult: null,
        classifierResult: {
          model_version: prediction.modelVersion,
          prediction_species: prediction.top1.speciesKey,
          confidence: prediction.top1.confidence,
          user_selected_species: finalKey || UNKNOWN_KEY,
        },
      };

      setSaving(true);
      setSaveError(null);
      const slowTimer = setTimeout(() => setSlowSaving(true), 2000);
      try {
        const upload = await catchService.uploadImage(session.accessToken, image.filePath);
        const savedCatch = await catchService.saveCatch(session.accessToken, upload, draft);
        clearTimeout(slowTimer);
        setSlowSaving(false);
        setSaving(false);
        setSaved(true);
        haptics.confirm();
        reload();
        submitFeedback(feedback).catch(() => undefined);
        setTimeout(() => {
          reset();
          navigation.replace('CatchDetail', {
            catchId: savedCatch.id,
            initialCatch: savedCatch,
            initialMemory: {
              lengthCm: Number(lengthText) > 0 ? Number(lengthText) : null,
              weightKg: Number(weightText) > 0 ? Number(weightText) : null,
              location: locationText.trim() || null,
            },
          });
        }, 320);
      } catch (e) {
        clearTimeout(slowTimer);
        setSlowSaving(false);
        setSaving(false);
        if (isUnauthorizedError(e)) {
          await logout();
          return;
        }
        setSaveError(e instanceof Error ? e.message : '保存鱼获失败，内容没有丢失，请重试');
      }
    },
    [
      session,
      image,
      prediction,
      state,
      selectedKey,
      selectedName,
      lengthText,
      weightText,
      locationText,
      reload,
      submitFeedback,
      logout,
      navigation,
      reset,
    ],
  );

  if (!result || !result.ready || !prediction) {
    // 过渡期间 result 可能被清空：渲染带背景的空态，避免闪白屏
    return (
      <View style={[styles.screen, { backgroundColor: profile.surface.canvas }]}>
        <WaterBackdrop />
      </View>
    );
  }

  const imageUri = toFileUri(image?.filePath);
  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const saveDisabled = state === 'medium' && !selectedKey;
  const rowIdleBg = profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)';
  const rowGoldBg = profile.isDark ? 'rgba(201,169,106,0.2)' : 'rgba(201,169,106,0.14)';
  /** 表单区域底色：比全局 glass 更实，避免填写区显得过透 */
  const formBg = profile.isDark ? 'rgba(16,46,56,0.92)' : 'rgba(255,255,255,0.93)';
  const dividerColor = profile.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(23,59,75,0.10)';

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScreenHeader onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 照片卡（设计稿：独立圆角照片卡，浮于湖面背景） */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <View
            style={[
              styles.photoCard,
              {
                backgroundColor: formBg,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <FishGlyph size={64} color={palette.fishMint} />
              </View>
            )}
          </View>
        </Animated.View>

        {/* 确认面板（设计稿：照片下方毛玻璃长条面板，标题左对齐） */}
        <Animated.View
          style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }}
        >
          <View
            style={[
              styles.panelCard,
              {
                backgroundColor: formBg,
                borderColor: profile.surface.glassBorder,
              },
            ]}
          >
            {state === 'high' ? (
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: textPrimary }]} numberOfLines={2}>
                  {selectedName || prediction.top1.speciesName}
                </Text>
                <PressableScale onPress={pickSpecies} scaleTo={0.96} style={styles.editHit}>
                  <View
                    style={[styles.editChip, { borderColor: profile.surface.textSecondary }]}
                    pointerEvents="none"
                  >
                    <Icon name="create-outline" size={12} color={textSecondary} />
                    <Text style={[styles.editChipText, { color: textSecondary }]}>修改鱼种</Text>
                    <Icon name="chevron-forward" size={12} color={textSecondary} />
                  </View>
                </PressableScale>
              </View>
            ) : null}

            {/* 中置信度：帮我确认一下（设计稿：标题左对齐 + 候选列表） */}
            {state === 'medium' ? (
              <>
                <Text style={[styles.panelTitle, { color: textPrimary }]}>帮我确认一下</Text>
                <Text style={[styles.panelSub, { color: textSecondary }]}>
                  这条鱼更像下面哪一种？
                </Text>
                <View style={styles.candidateList}>
                  {candidates.map((candidate, index) => {
                    const active = selectedKey === candidate.speciesKey;
                    return (
                      <PressableScale
                        key={candidate.speciesKey}
                        scaleTo={0.985}
                        onPress={() => {
                          setSelectedKey(candidate.speciesKey);
                          setSelectedName(candidate.speciesName);
                        }}
                      >
                        <View
                          style={[
                            styles.candidateRow,
                            {
                              backgroundColor: active ? rowGoldBg : rowIdleBg,
                              borderColor: active ? GOLD : profile.surface.glassBorder,
                            },
                            active && styles.candidateRowActive,
                          ]}
                        >
                          <View style={styles.candidateGlyph}>
                            <FishGlyph size={24} color={active ? GOLD : palette.fishGreen} />
                          </View>
                          <Text style={[styles.candidateName, { color: textPrimary }]} numberOfLines={1}>
                            {candidate.speciesName}
                          </Text>
                          {index === 0 ? (
                            <View style={styles.recommendChip}>
                              <Text style={styles.recommendText}>推荐</Text>
                            </View>
                          ) : null}
                          <RadioDot selected={active} color={GOLD} idleColor={textSecondary} />
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
                <PressableScale onPress={pickSpecies} style={styles.searchLinkHit}>
                  <View style={styles.searchLink} pointerEvents="none">
                    <Text style={[styles.searchLinkText, { color: textSecondary }]}>
                      都不是？搜索其他鱼种
                    </Text>
                    <Icon name="chevron-forward" size={13} color={textSecondary} />
                  </View>
                </PressableScale>
              </>
            ) : null}

            {/* 低置信度：还不能确定 */}
            {state === 'low' ? (
              <>
                <View style={styles.questionBadge}>
                  <Svg width={42} height={42}>
                    <Defs>
                      <LinearGradient id="questionGold" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor="#E7CF96" />
                        <Stop offset="1" stopColor={GOLD} />
                      </LinearGradient>
                    </Defs>
                    <Circle cx={21} cy={21} r={21} fill="url(#questionGold)" />
                  </Svg>
                  <Text style={styles.questionMark}>?</Text>
                </View>
                <Text style={[styles.panelTitle, styles.panelTitleCenter, { color: textPrimary }]}>
                  还不能确定这是什么鱼
                </Text>
                <Text style={[styles.panelSub, styles.panelSubCenter, { color: textSecondary }]}>
                  可以手动选择，或先保存这次鱼获
                </Text>
                <PressableScale onPress={pickSpecies} scaleTo={0.98} style={styles.manualHit}>
                  <View style={[styles.manualRow, { backgroundColor: rowIdleBg }]} pointerEvents="none">
                    <FishGlyph size={22} color={palette.fishGreen} />
                    <Text style={[styles.candidateName, { color: textPrimary, flex: 1 }]}>
                      手动选择鱼种
                    </Text>
                    {selectedKey && selectedKey !== UNKNOWN_KEY ? (
                      <Text style={[styles.pickedName, { color: GOLD }]} numberOfLines={1}>
                        {selectedName}
                      </Text>
                    ) : null}
                    <Icon name="chevron-forward" size={15} color={textSecondary} />
                  </View>
                </PressableScale>
              </>
            ) : null}
          </View>
        </Animated.View>

        {/* 长度 / 重量 / 钓点：三列合一信息条（设计稿：icon + 值在上、label 在下） */}
        <View
          style={[
            styles.metaBar,
            { backgroundColor: formBg, borderColor: profile.surface.glassBorder },
          ]}
        >
          <View style={styles.metaCol}>
            <View style={styles.metaValueRow}>
              <Icon name="resize-outline" size={13} color={GOLD} />
              <TextInput
                style={[styles.metaInput, { color: textPrimary }]}
                value={lengthText}
                onChangeText={setLengthText}
                placeholder="长度"
                placeholderTextColor={textSecondary}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.metaUnit, { color: textSecondary }]}>cm</Text>
            </View>
            <Text style={[styles.metaLabel, { color: textSecondary }]}>长度</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: dividerColor }]} />
          <View style={styles.metaCol}>
            <View style={styles.metaValueRow}>
              <Icon name="scale-outline" size={13} color={GOLD} />
              <TextInput
                style={[styles.metaInput, { color: textPrimary }]}
                value={weightText}
                onChangeText={setWeightText}
                placeholder="重量"
                placeholderTextColor={textSecondary}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.metaUnit, { color: textSecondary }]}>kg</Text>
            </View>
            <Text style={[styles.metaLabel, { color: textSecondary }]}>重量</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: dividerColor }]} />
          <View style={styles.metaCol}>
            <View style={styles.metaValueRow}>
              <Icon name="location-outline" size={13} color={GOLD} />
              <TextInput
                style={[styles.metaInput, styles.metaInputLocation, { color: textPrimary }]}
                value={locationText}
                onChangeText={setLocationText}
                placeholder="钓点"
                placeholderTextColor={textSecondary}
                maxLength={20}
              />
            </View>
            <Text style={[styles.metaLabel, { color: textSecondary }]}>钓点</Text>
          </View>
        </View>

        {saveError ? (
          <Text style={[styles.errorText, { color: palette.qualityInvalid }]}>{saveError}</Text>
        ) : null}
        {slowSaving ? (
          <Text style={[styles.slowHint, { color: textSecondary }]}>正在保存这次鱼获…</Text>
        ) : null}

        {/* 主 CTA：高/中置信度 —— 白玻璃胶囊；低置信度 —— 金色渐变「保存为未知鱼种」 */}
        {state === 'low' ? (
          <PrimaryButton
            label="保存为未知鱼种"
            onPress={() => doSave(UNKNOWN_KEY, UNKNOWN_NAME)}
            loading={saving}
            saved={saved}
            savedLabel="已保存"
            variant="gold"
            serif
            style={styles.saveButton}
          />
        ) : (
          <PrimaryButton
            label={saveDisabled ? '选择候选后保存鱼获' : '保存鱼获'}
            onPress={() => doSave()}
            disabled={saveDisabled}
            loading={saving}
            saved={saved}
            savedLabel="已保存"
            variant="glass"
            serif
            style={styles.saveButton}
          />
        )}

        {/* 次要操作：低置信度为两个白底胶囊（重新拍摄 / 从相册选择），其余为安静文字链接 */}
        {state === 'low' ? (
          <View style={styles.secondaryRow}>
            <PrimaryButton
              label="重新拍摄"
              variant="ghost"
              onPress={() => navigation.navigate('Identify')}
              disabled={saving || saved}
              style={styles.secondaryHalf}
            />
            <PrimaryButton
              label="从相册选择"
              variant="ghost"
              onPress={repickFromGallery}
              disabled={saving || saved}
              style={styles.secondaryHalf}
            />
          </View>
        ) : (
          <PressableScale
            onPress={() => navigation.navigate('Identify')}
            disabled={saving || saved}
            style={styles.textLinkHit}
          >
            <Text style={[styles.textLink, { color: textSecondary }]}>重新拍摄</Text>
          </PressableScale>
        )}
      </ScrollView>
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
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  photoCard: {
    borderRadius: radius.l,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#173B4B',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  } as ViewStyle,
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  } as ImageStyle,
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.softWater,
  } as ViewStyle,
  panelCard: {
    marginTop: spacing.md,
    borderRadius: radius.m + 2,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#173B4B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  } as ViewStyle,
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  } as ViewStyle,
  name: {
    fontFamily: font.serif,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    flexShrink: 1,
  } as TextStyle,
  editHit: {
    borderRadius: 12,
  } as ViewStyle,
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: 1,
  } as ViewStyle,
  editChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  } as TextStyle,
  panelTitle: {
    fontFamily: font.serif,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  panelTitleCenter: {
    textAlign: 'center',
  } as TextStyle,
  panelSub: {
    fontSize: 13,
    marginTop: 4,
  } as TextStyle,
  panelSubCenter: {
    textAlign: 'center',
  } as TextStyle,
  questionBadge: {
    alignSelf: 'center',
    width: 42,
    height: 42,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A5854D',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  } as ViewStyle,
  questionMark: {
    position: 'absolute',
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  } as TextStyle,
  candidateList: {
    marginTop: spacing.sm,
    gap: 10,
  } as ViewStyle,
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.m - 4,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
  } as ViewStyle,
  candidateRowActive: {
    borderWidth: 1.5,
  } as ViewStyle,
  candidateGlyph: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  candidateName: {
    fontFamily: font.serif,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 1,
  } as TextStyle,
  recommendChip: {
    backgroundColor: 'rgba(201,169,106,0.18)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  } as ViewStyle,
  recommendText: {
    color: '#A5854D',
    fontSize: 10,
    fontWeight: '600',
  } as TextStyle,
  searchLinkHit: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  } as ViewStyle,
  searchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  searchLinkText: {
    fontSize: 13,
  } as TextStyle,
  manualHit: {
    marginTop: spacing.sm,
  } as ViewStyle,
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.m - 4,
    paddingVertical: 9,
    paddingHorizontal: 12,
  } as ViewStyle,
  pickedName: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 72,
  } as TextStyle,
  metaBar: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.m,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    shadowColor: '#173B4B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  } as ViewStyle,
  metaCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  } as ViewStyle,
  metaDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 3,
  } as ViewStyle,
  metaValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  metaInput: {
    fontFamily: font.serif,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
    minWidth: 34,
    textAlign: 'center',
  } as TextStyle,
  metaInputLocation: {
    fontSize: 13,
    minWidth: 0,
    flexShrink: 1,
  } as TextStyle,
  metaUnit: {
    fontSize: 11,
  } as TextStyle,
  metaLabel: {
    fontSize: 11,
  } as TextStyle,
  errorText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 12,
  } as TextStyle,
  slowHint: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 12,
  } as TextStyle,
  saveButton: {
    marginTop: spacing.md,
  } as ViewStyle,
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  } as ViewStyle,
  secondaryHalf: {
    flex: 1,
  } as ViewStyle,
  textLinkHit: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  } as ViewStyle,
  textLink: {
    fontSize: 13,
  } as TextStyle,
});
