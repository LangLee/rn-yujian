import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  ImageStyle,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { AppIcon, AppIconName } from '../../components/icons/AppIcon';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import { accountService } from '../../services/accountService';
import { ApiError } from '../../services/apiClient';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import { codePointCount, normalizeNickname, validateNickname } from '../../utils/accountRules';
import { LakeContentBackdrop } from '../../components/coreui/LakeContentBackdrop';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import {
  KeyboardAvoidingScrollView,
  useEnsureInputVisible,
} from '../../components/ui/KeyboardAvoidingScrollView';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { FooterGrass } from '../../components/ui/FooterGrass';
import { ScreenHeader } from '../../components';
import { AvatarCropView } from './AvatarCropView';

type EditProfileNavigationProp = StackNavigationProp<RootStackParamList, 'EditProfile'>;

/** 选择器统一参数：源图压到 ≤1024，保证裁切输出不超过 1024×1024 契约目标 */
const PICK_OPTIONS = ({
  mediaType: 'photo' as const,
  selectionLimit: 1,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.9,
} as const);

/**
 * 编辑资料（Edit Profile Home V1.1 + Avatar/Nickname 冻结契约）：
 * - 头像（+相机角标+更换头像）、账号只读行（不可修改）、昵称行（清空 + n/20 计数）；
 * - 选择/裁切只形成本地 Pending Preview，不上传；点「保存修改」才执行
 *   昵称 PATCH → 头像上传 → 会话资料更新的单一保存事务；
 * - 未保存返回时确认（放弃未保存的修改？）；失败保留草稿可重试。
 */
export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<EditProfileNavigationProp>();
  const insets = useSafeAreaInsets();
  const { session, applyProfile } = useAuth();
  const { avatar: legacyAvatar, setNickname: setLegacyNickname } = usePreferences();

  const [nicknameDraft, setNicknameDraft] = useState(session?.nickname ?? '');
  const [persistedNickname, setPersistedNickname] = useState(session?.nickname ?? '');
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [sourceSheet, setSourceSheet] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [discardSheet, setDiscardSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; text: string } | null
  >(null);
  const inputRef = useRef<TextInput>(null);
  /* Android 键盘已开时聚焦昵称栏：主动请求滚动进可视区 */
  const ensureInputVisible = useEnsureInputVisible();

  /* 打开页面时以服务端资料为权威刷新初始值（失败静默保持会话值） */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const profile = await accountService.getProfile();
        if (!mounted || !profile.nickname) {
          return;
        }
        applyProfile({ nickname: profile.nickname, avatarUrl: profile.avatarUrl });
        setPersistedNickname(profile.nickname);
        setNicknameDraft((draft) => (draft === session?.nickname ? profile.nickname : draft));
      } catch {
        // /me 拉取失败不阻塞编辑（会话缓存仍可用）
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedDraft = normalizeNickname(nicknameDraft);
  const nicknameError = validateNickname(nicknameDraft);
  const nicknameChanged = normalizedDraft !== persistedNickname;
  const dirty = nicknameChanged || pendingAvatar !== null;
  const saveEnabled = !saving && !nicknameError && (nicknameChanged || pendingAvatar !== null);

  /* 新编辑立即清除上一条成功反馈（State Spec §3） */
  useEffect(() => {
    if (nicknameChanged || pendingAvatar) {
      setFeedback((current) => (current?.kind === 'success' ? null : current));
    }
  }, [nicknameDraft, pendingAvatar, nicknameChanged]);

  const displayAvatar =
    pendingAvatar ?? session?.avatarUrl ?? legacyAvatar ?? null;

  /* ── 返回：草稿未保存时先确认 ─────────────────────────────────── */
  const handleBack = useCallback(() => {
    if (saving) {
      /* 保存请求未决时不离开页面（State Spec §5） */
      return;
    }
    if (dirty) {
      setDiscardSheet(true);
      return;
    }
    navigation.goBack();
  }, [dirty, saving, navigation]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cropUri) {
        setCropUri(null);
        return true;
      }
      handleBack();
      return true;
    });
    return () => handler.remove();
  }, [cropUri, handleBack]);

  /* ── 头像来源与裁切 ───────────────────────────────────────────── */
  const openPicker = () => {
    setSourceSheet(false);
    launchImageLibrary(PICK_OPTIONS, (response) => {
      const uri = response.assets?.[0]?.uri;
      if (uri) {
        setCropUri(uri);
      }
      // 取消选择：静默返回，不改变状态
    });
  };

  const openCamera = async () => {
    setSourceSheet(false);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setFeedback({ kind: 'error', text: '需要相机权限才能拍照更换头像' });
          return;
        }
      }
      launchCamera(PICK_OPTIONS, (response) => {
        const uri = response.assets?.[0]?.uri;
        if (uri) {
          setCropUri(uri);
        }
        // 取消拍摄：静默返回
      });
    } catch {
      setFeedback({ kind: 'error', text: '需要相机权限才能拍照更换头像' });
    }
  };

  /* ── 保存事务：昵称 PATCH → 头像上传 → 会话更新 ──────────────── */
  const handleSave = useCallback(async () => {
    if (!saveEnabled) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      /* 第一步：昵称（仅变化时 PATCH；服务端响应为权威） */
      if (nicknameChanged) {
        const profile = await accountService.updateNickname(normalizedDraft);
        applyProfile({ nickname: profile.nickname, avatarUrl: profile.avatarUrl });
        setPersistedNickname(profile.nickname);
        setLegacyNickname(profile.nickname);
      }
      /* 第二步：头像上传（仅存在 Pending Preview 时；失败保留待重试） */
      if (pendingAvatar) {
        try {
          const profile = await accountService.uploadAvatar(pendingAvatar);
          applyProfile({ nickname: profile.nickname, avatarUrl: profile.avatarUrl });
          setPendingAvatar(null);
        } catch (error) {
          if (isSessionExpired(error)) {
            setFeedback({ kind: 'error', text: '登录状态已失效，请重新登录' });
          } else if (nicknameChanged) {
            /* 昵称已确认、头像失败：如实呈现部分成功，保留头像草稿 */
            setFeedback({ kind: 'error', text: '部分内容已保存，头像更新失败，请重试' });
          } else {
            setFeedback({ kind: 'error', text: '头像上传失败，请重试' });
          }
          return;
        }
      }
      setFeedback({ kind: 'success', text: '已保存' });
    } catch (error) {
      if (isSessionExpired(error)) {
        setFeedback({ kind: 'error', text: '登录状态已失效，请重新登录' });
      } else {
        setFeedback({ kind: 'error', text: '保存资料失败，请重试' });
      }
    } finally {
      setSaving(false);
    }
  }, [saveEnabled, nicknameChanged, normalizedDraft, pendingAvatar, applyProfile, setLegacyNickname]);

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="编辑资料" onBack={handleBack} />

      {/* 键盘避让：iOS 原生 automaticallyAdjustKeyboardInsets 滚聚焦框；
          Android edge-to-edge 下 KeyboardAvoidingScrollView 手动避让 */}
      <KeyboardAvoidingScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 132 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 头像区：当前头像 + 相机角标 + 更换头像 */}
        <View style={styles.avatarBlock}>
          <PressableScale
            onPress={() => (saving ? undefined : setSourceSheet(true))}
            scaleTo={0.97}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="更换头像"
            style={styles.avatarHit}
          >
            <View pointerEvents="none">
              {pendingAvatar ? (
                <Image source={{ uri: pendingAvatar }} style={styles.avatarImage} />
              ) : (
                <ProfileAvatar size={104} avatarUrl={displayAvatar} />
              )}
              <View style={styles.cameraBadge}>
                <AppIcon name="camera" size={15} color="#FFFFFF" />
              </View>
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => (saving ? undefined : setSourceSheet(true))}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="更换头像"
          >
            <Text style={styles.changeAvatarText}>更换头像</Text>
          </PressableScale>
        </View>

        {/* 表单卡：账号只读行 + 昵称行 */}
        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <Text style={styles.rowLabel}>账号</Text>
            <Text style={styles.accountValue} numberOfLines={1}>
              {session?.username ?? '—'}
            </Text>
            <View style={styles.lockBadge}>
              <Text style={styles.lockBadgeText}>不可修改</Text>
            </View>
          </View>
          <View style={styles.rowDivider} />

          <View style={styles.formRow}>
            <Text style={styles.rowLabel}>昵称</Text>
            <TextInput
              ref={inputRef}
              style={styles.nicknameInput}
              value={nicknameDraft}
              /* 安全上限远高于 20 码点业务上限，不替代可见校验（契约 §8） */
              onChangeText={(text) => setNicknameDraft(text.slice(0, 100))}
              placeholder="请输入昵称"
              placeholderTextColor="#9AACB5"
              returnKeyType="done"
              editable={!saving}
              onFocus={() =>
                requestAnimationFrame(() =>
                  ensureInputVisible(TextInput.State.currentlyFocusedInput()),
                )
              }
              selectionColor={coreColors.morningGold}
              onSubmitEditing={() => inputRef.current?.blur()}
              accessibilityLabel="昵称"
            />
            {nicknameDraft.length > 0 && !saving ? (
              <PressableScale
                onPress={() => setNicknameDraft('')}
                style={styles.clearHit}
                accessibilityRole="button"
                accessibilityLabel="清空昵称"
              >
                <AppIcon name="clear_field" size={18} color="rgba(116,136,151,0.7)" />
              </PressableScale>
            ) : null}
          </View>
          {/* 计数与行内错误：计数显示当前草稿长度（校验用 trim 后码点） */}
          <View style={styles.metaRow}>
            <Text style={[styles.fieldError, !nicknameError && styles.transparent]}>
              {nicknameError ?? ' '}
            </Text>
            <Text style={styles.counter}>{codePointCount(nicknameDraft)} / 20</Text>
          </View>
        </View>

        {/* 页面反馈（成功/失败，克制无弹窗） */}
        {feedback ? (
          <Text
            style={[
              styles.feedback,
              feedback.kind === 'error' ? styles.feedbackError : styles.feedbackSuccess,
            ]}
            accessibilityLiveRegion="polite"
          >
            {feedback.text}
          </Text>
        ) : null}

        <PrimaryButton
          label="保存修改"
          onPress={() => void handleSave()}
          disabled={!saveEnabled}
          loading={saving}
          style={styles.saveButton}
        />
      </KeyboardAvoidingScrollView>

      {/* 底部水岸草丛（页面前景装饰，不遮挡 CTA） */}
      <FooterGrass height={Math.round(72)} />

      {/* 头像来源 Sheet：拍照 / 从相册选择 / 取消 */}
      <BottomSheet visible={sourceSheet} onClose={() => setSourceSheet(false)}>
        <SourceRow icon="camera" label="拍照" onPress={() => void openCamera()} />
        <SourceRow icon="gallery" label="从相册选择" onPress={openPicker} />
        <PrimaryButton
          label="取消"
          variant="secondaryMuted"
          onPress={() => setSourceSheet(false)}
          style={styles.sourceCancel}
        />
      </BottomSheet>

      {/* 未保存确认：继续编辑（保留草稿）/ 放弃修改（清空草稿返回） */}
      <BottomSheet visible={discardSheet} onClose={() => setDiscardSheet(false)} title="放弃未保存的修改？">
        <Text style={styles.discardText}>当前修改还没有保存。</Text>
        <PrimaryButton
          label="继续编辑"
          onPress={() => setDiscardSheet(false)}
          style={styles.sheetButton}
        />
        <PrimaryButton
          label="放弃修改"
          variant="danger"
          onPress={() => {
            setDiscardSheet(false);
            navigation.goBack();
          }}
          style={styles.sheetButton}
        />
      </BottomSheet>

      {/* 1:1 裁切覆盖层：确认只生成本地 Pending Preview，不上传 */}
      <AvatarCropView
        visible={cropUri !== null}
        imageUri={cropUri}
        onConfirm={(uri) => {
          setCropUri(null);
          setPendingAvatar(uri);
        }}
        onReselect={() => {
          setCropUri(null);
          setSourceSheet(true);
        }}
        onCancel={() => setCropUri(null)}
      />
    </View>
  );
};

function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || error.bizCode === 'A0230');
}

const SourceRow: React.FC<{ icon: AppIconName; label: string; onPress: () => void }> = ({
  icon,
  label,
  onPress,
}) => (
  <PressableScale onPress={onPress} scaleTo={0.99} accessibilityRole="button" accessibilityLabel={label}>
    <View style={styles.sourceRow}>
      <AppIcon name={icon} size={20} color={coreColors.lakeBlue} />
      <Text style={styles.sourceLabel}>{label}</Text>
    </View>
  </PressableScale>
);

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
  avatarBlock: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  } as ViewStyle,
  avatarHit: {
    minHeight: 44,
  } as ViewStyle,
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
  } as ImageStyle,
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F7A78',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  changeAvatarText: {
    color: '#168B88',
    fontSize: fs(14),
    fontWeight: '600',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    textAlign: 'center',
    textAlignVertical: 'center',
  } as TextStyle,
  formCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: 'rgba(11,45,75,0.10)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  } as ViewStyle,
  formRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  } as ViewStyle,
  rowLabel: {
    width: 52,
    fontSize: fs(14),
    fontWeight: '600',
    color: coreColors.lakeBlue,
  } as TextStyle,
  accountValue: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  lockBadge: {
    backgroundColor: 'rgba(116,136,151,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  } as ViewStyle,
  lockBadgeText: {
    fontSize: fs(11),
    fontWeight: '500',
    color: coreColors.mistBlueGray,
  } as TextStyle,
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(11,45,75,0.08)',
  } as ViewStyle,
  nicknameInput: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
    paddingVertical: spacing.md,
    minHeight: 44,
  } as ViewStyle,
  clearHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    marginTop: -4,
  } as ViewStyle,
  fieldError: {
    flex: 1,
    fontSize: fs(11),
    color: '#C25B4E',
  } as TextStyle,
  transparent: {
    color: 'transparent',
  } as TextStyle,
  counter: {
    fontSize: fs(11),
    color: coreColors.mistBlueGray,
    marginLeft: spacing.sm,
  } as TextStyle,
  feedback: {
    fontSize: fs(13),
    marginTop: spacing.md,
    textAlign: 'center',
  } as TextStyle,
  feedbackSuccess: {
    color: '#3E7A5E',
  } as TextStyle,
  feedbackError: {
    color: '#C25B4E',
  } as TextStyle,
  saveButton: {
    marginTop: spacing.lg,
  } as ViewStyle,
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 16,
    minHeight: 52,
    paddingHorizontal: spacing.xs,
  } as ViewStyle,
  sourceLabel: {
    fontSize: fs(15),
    fontWeight: '500',
    color: coreColors.deepLakeBlue,
  } as TextStyle,
  sourceCancel: {
    marginTop: spacing.sm,
  } as ViewStyle,
  discardText: {
    fontSize: fs(14),
    lineHeight: 21,
    color: coreColors.lakeBlue,
    marginBottom: spacing.md,
  } as TextStyle,
  sheetButton: {
    marginTop: spacing.sm,
  } as ViewStyle,
});
