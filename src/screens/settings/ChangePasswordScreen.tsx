import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { StackNavigationProp, RootStackParamList } from '../../navigation/types';
import { accountService, changePasswordErrorMessage } from '../../services/accountService';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import {
  PASSWORD_MAX_LENGTH,
  validateChangePassword,
} from '../../utils/accountRules';
import {
  LakeContentBackdrop,
  accountPageContentTop,
} from '../../components/coreui/LakeContentBackdrop';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenHeader } from '../../components';

type ChangePasswordNavigationProp = StackNavigationProp<RootStackParamList, 'ChangePassword'>;

/**
 * 修改密码 · Spec V1（FROZEN）：
 * 当前密码 / 新密码 / 确认新密码 + 「新密码至少 6 位」+ 保存。
 * 本地校验（非空/6–72/一致/新旧不同）非法即禁用保存；错误贴近字段；
 * 服务端为最终权威（403→当前密码错误 / 400·422→新密码不符合要求 /
 * 401→登录状态已失效）。成功显示「密码已修改」，清空表单并留在本页。
 */
export const ChangePasswordScreen: React.FC = () => {
  const navigation = useNavigation<ChangePasswordNavigationProp>();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const draft = useMemo(
    () => ({ currentPassword, newPassword, confirmPassword }),
    [currentPassword, newPassword, confirmPassword],
  );
  const { valid, fieldError } = validateChangePassword(draft);
  const saveEnabled = valid && !saving;

  /* 任一新编辑清除上一条成功反馈 */
  React.useEffect(() => {
    if (currentPassword || newPassword || confirmPassword) {
      setSuccess(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleSave = useCallback(async () => {
    if (!saveEnabled) {
      return;
    }
    setSaving(true);
    setPageError(null);
    try {
      await accountService.changePassword(currentPassword, newPassword);
      /* 成功：清空字段、保存回到禁用、留在本页 */
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (error) {
      setPageError(changePasswordErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [saveEnabled, currentPassword, newPassword]);

  return (
    <View style={styles.screen}>
      <LakeContentBackdrop />
      <ScreenHeader title="修改密码" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: accountPageContentTop(insets.top, windowH), paddingBottom: 48 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formCard}>
            <PasswordField
              label="当前密码"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              visible={visible.current}
              onToggleVisibility={() =>
                setVisible((state) => ({ ...state, current: !state.current }))
              }
              returnKeyType="next"
            />
            <View style={styles.rowDivider} />
            <PasswordField
              label="新密码"
              value={newPassword}
              onChangeText={setNewPassword}
              visible={visible.next}
              onToggleVisibility={() => setVisible((state) => ({ ...state, next: !state.next }))}
              returnKeyType="next"
              supportingText="新密码至少 6 位"
            />
            <View style={styles.rowDivider} />
            <PasswordField
              label="确认新密码"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              visible={visible.confirm}
              onToggleVisibility={() =>
                setVisible((state) => ({ ...state, confirm: !state.confirm }))
              }
              returnKeyType="done"
              errorText={fieldError}
              onSubmitEditing={() => void handleSave()}
            />
          </View>

          {success ? (
            <Text style={styles.successText} accessibilityLiveRegion="polite">
              密码已修改
            </Text>
          ) : null}
          {pageError ? (
            <Text style={styles.pageError} accessibilityLiveRegion="polite">
              {pageError}
            </Text>
          ) : null}

          <PrimaryButton
            label="保存"
            onPress={() => void handleSave()}
            disabled={!saveEnabled}
            loading={saving}
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

/** 密码字段：默认掩码 + 右缘可见切换（Icon Action V1 / CONTEXT），单行 */
const PasswordField: React.FC<{
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  returnKeyType?: 'done' | 'next';
  supportingText?: string;
  errorText?: string | null;
  onSubmitEditing?: () => void;
}> = ({
  label,
  value,
  onChangeText,
  visible,
  onToggleVisibility,
  returnKeyType,
  supportingText,
  errorText,
  onSubmitEditing,
}) => (
  <View style={styles.fieldBlock}>
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={PASSWORD_MAX_LENGTH}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        selectionColor={coreColors.morningGold}
        accessibilityLabel={label}
      />
      <Pressable
        onPress={onToggleVisibility}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? `隐藏${label}` : `显示${label}`}
      >
        <Icon
          name={visible ? 'eye-outline' : 'eye-off-outline'}
          size={19}
          color="rgba(11,45,75,0.62)"
        />
      </Pressable>
    </View>
    {errorText ? (
      <Text style={styles.fieldError}>{errorText}</Text>
    ) : supportingText ? (
      <Text style={styles.supporting}>{supportingText}</Text>
    ) : null}
  </View>
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
    marginTop: spacing.sm,
  } as ViewStyle,
  fieldBlock: {
    paddingVertical: spacing.sm,
  } as ViewStyle,
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
  } as ViewStyle,
  fieldLabel: {
    width: 88,
    fontSize: fs(14),
    fontWeight: '600',
    color: coreColors.lakeBlue,
  } as TextStyle,
  fieldInput: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
    paddingVertical: spacing.sm,
  } as ViewStyle,
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(11,45,75,0.08)',
  } as ViewStyle,
  supporting: {
    fontSize: fs(11),
    color: coreColors.mistBlueGray,
    marginTop: 2,
    marginLeft: 100,
  } as TextStyle,
  fieldError: {
    fontSize: fs(11),
    color: '#C25B4E',
    marginTop: 2,
    marginLeft: 100,
  } as TextStyle,
  successText: {
    fontSize: fs(13),
    color: '#3E7A5E',
    textAlign: 'center',
    marginTop: spacing.md,
  } as TextStyle,
  pageError: {
    fontSize: fs(13),
    color: '#C25B4E',
    textAlign: 'center',
    marginTop: spacing.md,
  } as TextStyle,
  saveButton: {
    marginTop: spacing.lg,
  } as ViewStyle,
});
