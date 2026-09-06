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
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
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
import { WaterBackdrop } from '../components/WaterBackdrop';
import { PressableScale } from '../components/ui/PressableScale';
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
  const { image, result, submitFeedback, reset } = useRecognition();
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

  useEffect(() => {
    if (!result || !result.ready || !prediction) {
      navigation.replace('RecognitionIssue');
    }
  }, [result, prediction, navigation]);

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
    return <View style={styles.screen} />;
  }

  const imageUri = toFileUri(image?.filePath);
  const textPrimary = profile.surface.textPrimary;
  const textSecondary = profile.surface.textSecondary;
  const saveDisabled = state === 'medium' && !selectedKey;

  return (
    <View style={styles.screen}>
      <WaterBackdrop />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: 48 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 顶部返回 */}
        <PressableScale onPress={() => navigation.goBack()} scaleTo={0.92} style={styles.backHit}>
          <Icon name="chevron-back" size={26} color={textPrimary} />
        </PressableScale>

        {/* Hero：真实鱼获照片立即成为主角 */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <View style={[styles.heroCard, { borderColor: profile.surface.glassBorder }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <FishGlyph size={72} color={palette.fishMint} />
              </View>
            )}
          </View>
        </Animated.View>

        {state === 'high' ? (
          <Animated.View
            style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: textPrimary }]} numberOfLines={2}>
                {selectedName || prediction.top1.speciesName}
              </Text>
              <PressableScale onPress={pickSpecies} scaleTo={0.96} style={styles.editHit}>
                <View style={[styles.editChip, { backgroundColor: profile.surface.accentSoft }]}>
                  <Icon name="create-outline" size={14} color={profile.surface.accent} />
                  <Text style={[styles.editChipText, { color: profile.surface.accent }]}>修改</Text>
                </View>
              </PressableScale>
            </View>
          </Animated.View>
        ) : null}

        {/* 中置信度：帮我确认一下（单一玻璃面板） */}
        {state === 'medium' ? (
          <Animated.View
            style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }}
          >
            <View style={[styles.panel, { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder }]}>
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
                          { backgroundColor: profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' },
                          active && { borderColor: GOLD, borderWidth: 1.5 },
                        ]}
                      >
                        <View style={styles.candidateThumb}>
                          <FishGlyph size={26} color={active ? GOLD : palette.fishGreen} />
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
                  <Icon name="chevron-forward" size={14} color={textSecondary} />
                </View>
              </PressableScale>
            </View>
          </Animated.View>
        ) : null}

        {/* 低置信度：还不能确定 */}
        {state === 'low' ? (
          <Animated.View
            style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }}
          >
            <View style={[styles.panel, { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder }]}>
              <Text style={[styles.panelTitle, { color: textPrimary }]}>
                还不能确定这是什么鱼
              </Text>
              <Text style={[styles.panelSub, { color: textSecondary }]}>
                可以手动选择，或先保存这次鱼获
              </Text>
              <PressableScale onPress={pickSpecies} scaleTo={0.98} style={styles.manualHit}>
                <View style={[styles.manualRow, { backgroundColor: profile.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' }]} pointerEvents="none">
                  <FishGlyph size={24} color={palette.fishGreen} />
                  <Text style={[styles.candidateName, { color: textPrimary, flex: 1 }]}>
                    手动选择鱼种
                  </Text>
                  {selectedKey && selectedKey !== UNKNOWN_KEY ? (
                    <Text style={[styles.pickedName, { color: GOLD }]} numberOfLines={1}>
                      {selectedName}
                    </Text>
                  ) : null}
                  <Icon name="chevron-forward" size={16} color={textSecondary} />
                </View>
              </PressableScale>
            </View>
          </Animated.View>
        ) : null}

        {/* 长度 / 重量 / 地点：三列数据条（参考稿样式，可填写） */}
        <View style={[styles.metaBar, { backgroundColor: profile.surface.glass, borderColor: profile.surface.glassBorder }]}>
          <View style={styles.metaCell}>
            <View style={styles.metaValueRow}>
              <Icon name="resize-outline" size={14} color={GOLD} />
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
          <View style={[styles.metaDivider, { backgroundColor: profile.surface.glassBorder }]} />
          <View style={styles.metaCell}>
            <View style={styles.metaValueRow}>
              <Icon name="scale-outline" size={14} color={GOLD} />
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
          <View style={[styles.metaDivider, { backgroundColor: profile.surface.glassBorder }]} />
          <View style={styles.metaCell}>
            <View style={styles.metaValueRow}>
              <Icon name="location-outline" size={14} color={GOLD} />
              <TextInput
                style={[styles.metaInput, styles.metaInputLocation, { color: textPrimary }]}
                value={locationText}
                onChangeText={setLocationText}
                placeholder="地点"
                placeholderTextColor={textSecondary}
                maxLength={20}
              />
            </View>
            <Text style={[styles.metaLabel, { color: textSecondary }]}>地点</Text>
          </View>
        </View>

        {saveError ? (
          <Text style={[styles.errorText, { color: palette.qualityInvalid }]}>{saveError}</Text>
        ) : null}
        {slowSaving ? (
          <Text style={[styles.slowHint, { color: textSecondary }]}>正在保存这次鱼获…</Text>
        ) : null}

        {/* 保存鱼获（玻璃底 + 深青衬线字，参考稿样式） */}
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

        {state === 'low' ? (
          <PrimaryButton
            label="保存为未知鱼种"
            variant="ghost"
            onPress={() => doSave(UNKNOWN_KEY, UNKNOWN_NAME)}
            disabled={saving || saved}
            style={styles.secondaryButton}
          />
        ) : null}
        <PrimaryButton
          label="重新拍摄"
          variant="ghost"
          onPress={() => navigation.navigate('Identify')}
          disabled={saving || saved}
          style={styles.secondaryButton}
        />
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
  backHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    marginLeft: -8,
    marginBottom: spacing.sm,
  } as ViewStyle,
  heroCard: {
    borderRadius: radius.l + 6,
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: spacing.md,
  } as ViewStyle,
  name: {
    fontFamily: font.serif,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 6,
  } as TextStyle,
  editHit: {
    borderRadius: 14,
  } as ViewStyle,
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  } as ViewStyle,
  editChipText: {
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,
  panel: {
    marginTop: spacing.lg,
    borderRadius: radius.l + 4,
    borderWidth: 1,
    padding: spacing.lg,
  } as ViewStyle,
  panelTitle: {
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
  } as TextStyle,
  panelSub: {
    fontSize: 15,
    marginTop: 6,
  } as TextStyle,
  candidateList: {
    marginTop: spacing.lg,
    gap: spacing.md,
  } as ViewStyle,
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  } as ViewStyle,
  candidateThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(220,238,235,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  candidateName: {
    fontFamily: font.serif,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    flexShrink: 1,
  } as TextStyle,
  recommendChip: {
    backgroundColor: 'rgba(201,169,106,0.18)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
  } as ViewStyle,
  recommendText: {
    color: '#A5854D',
    fontSize: 11,
    fontWeight: '600',
  } as TextStyle,
  searchLinkHit: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  } as ViewStyle,
  searchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  } as ViewStyle,
  searchLinkText: {
    fontSize: 14,
  } as TextStyle,
  manualHit: {
    marginTop: spacing.lg,
  } as ViewStyle,
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.m,
    paddingVertical: 12,
    paddingHorizontal: 14,
  } as ViewStyle,
  pickedName: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 80,
  } as TextStyle,
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    borderRadius: radius.l,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  } as ViewStyle,
  metaCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  } as ViewStyle,
  metaValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,
  metaInput: {
    fontFamily: font.serif,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 0,
    minWidth: 40,
    textAlign: 'center',
  } as TextStyle,
  metaInputLocation: {
    fontSize: 14,
    minWidth: 56,
  } as TextStyle,
  metaUnit: {
    fontSize: 12,
  } as TextStyle,
  metaLabel: {
    fontSize: 12,
  } as TextStyle,
  metaDivider: {
    width: 1,
    height: 30,
    opacity: 0.7,
  } as ViewStyle,
  errorText: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: 13,
  } as TextStyle,
  slowHint: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: 13,
  } as TextStyle,
  saveButton: {
    marginTop: spacing.xl,
  } as ViewStyle,
  secondaryButton: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
