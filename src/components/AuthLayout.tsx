import React, { ReactNode, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { font, fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';
import { MorningLakeScene } from './coreui/MorningLakeScene';
import { PrimaryButton } from './ui/PrimaryButton';

/**
 * 登录 / 注册公共布局（Core Visual System V1）：
 * - 背景：BG_CONTENT —— Morning_Lake_Master_V1 同一清晨湖世界（15% 雾白存在感），
 *   不再使用页面私有的 auth 湖景资产（背景系统 V1 禁止第三湖景世界）；
 * - 品牌区：BRAND 角色（衬线品牌字 + MorningGold 菱形装饰，金仅用于品牌）；
 * - 输入框：GLASS_A 白玻璃；
 * - 主按钮：Action Button V1.1 / PRIMARY（56dp/28dp/#0F7A78）；
 * - 文本动作：Text Action V1（STRONG #168B88 / MUTED #748897）；
 * - 页面左右内容边距 24dp（Action Button V1.1 §7）。
 */

/** Text Action V1 · LIGHT 冻结色 */
const TEXT_ACTION_STRONG = '#168B88';
const TEXT_ACTION_MUTED = '#748897';

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  children,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      {/* BG_CONTENT：同一清晨湖畔世界，背景存在感 ~75% */}
      <MorningLakeScene level="content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 64, paddingBottom: 32 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌区（BRAND 角色：品牌/情绪书法字，金色仅此一处） */}
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>{title}</Text>
            <View style={styles.brandSubRow}>
              <View style={styles.goldDiamond} />
              <Text style={styles.subtitle}>{subtitle}</Text>
              <View style={styles.goldDiamond} />
            </View>
          </View>
          <View style={styles.fields}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

interface AuthLayoutProps {
  /** 品牌字（渔见） */
  title: string;
  /** 品牌副标题（拍照收藏每次渔获） */
  subtitle: string;
  children: ReactNode;
}

interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  secureTextEntry?: boolean;
  supportingText?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  icon?: string;
}

/** 白玻璃输入框（GLASS_A 主内容面 + 左侧 Context 图标 + 密码可见切换）。 */
export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  value,
  onChangeText,
  maxLength,
  secureTextEntry = false,
  supportingText,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  icon = 'person-outline',
}) => {
  const [visible, setVisible] = useState(!secureTextEntry);
  return (
    <View>
      <View style={styles.inputWrap}>
        <Icon name={icon} size={18} color="rgba(11,45,75,0.88)" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry && !visible}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          placeholder={label}
          placeholderTextColor={coreColors.mistBlueGray}
          selectionColor={coreColors.morningGold}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setVisible((value2) => !value2)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
          >
            <Icon
              name={visible ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color="rgba(11,45,75,0.88)"
            />
          </Pressable>
        ) : null}
      </View>
      {supportingText ? (
        <Text style={styles.supporting}>{supportingText}</Text>
      ) : null}
    </View>
  );
};

/** 错误提示条。 */
export const AuthError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  ) : null;

interface AuthPrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/** 主按钮：Action Button V1.1 / PRIMARY（登录/注册全宽单按钮冻结用法）。 */
export const AuthPrimaryButton: React.FC<AuthPrimaryButtonProps> = ({
  label,
  onPress,
  disabled = false,
  loading = false,
}) => (
  <PrimaryButton
    label={label}
    onPress={onPress}
    disabled={disabled}
    loading={loading}
    style={styles.primaryButton}
  />
);

/** 文本切换行（Text Action V1）：伴随文案 LakeBlue + STRONG 13sp/600 #168B88。 */
export const AuthTextButton: React.FC<{
  label: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, actionLabel, onPress, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.linkWrap, pressed && styles.linkWrapPressed]}
    accessibilityRole="button"
    accessibilityLabel={actionLabel}
  >
    <Text style={styles.linkMuted}>{label}</Text>
    <Text style={styles.linkAction}>{actionLabel}</Text>
  </Pressable>
);

/** 底部协议轻链接（Text Action V1 / MUTED 13sp·500·#748897）。 */
export const AuthFooterLinks: React.FC = () => (
  <View style={styles.footerRow}>
    <Text style={styles.footerLink}>用户协议</Text>
    <View style={styles.footerDot} />
    <Text style={styles.footerLink}>隐私政策</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    flexGrow: 1,
    /* Action Button V1.1 §7：登录/注册页内容左右边距 24dp */
    paddingHorizontal: 24,
  } as ViewStyle,
  brandBlock: {
    alignItems: 'center',
    marginBottom: 46,
  } as ViewStyle,
  brand: {
    fontFamily: font.serif,
    fontSize: fs(44),
    fontWeight: '700',
    letterSpacing: 14,
    color: coreColors.deepLakeBlue,
    marginLeft: 14, // 抵消 letterSpacing 右偏，保持视觉居中
  } as TextStyle,
  brandSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  } as ViewStyle,
  goldDiamond: {
    width: 5,
    height: 5,
    backgroundColor: coreColors.morningGold,
    transform: [{ rotate: '45deg' }],
  } as ViewStyle,
  subtitle: {
    fontSize: fs(13),
    letterSpacing: 4,
    color: coreColors.lakeBlue,
  } as TextStyle,
  fields: {
    gap: 16,
  } as ViewStyle,
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    /* GLASS_A：主内容面 white 0.72-0.80 + 1px 轻白边 */
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderRadius: 27,
    paddingHorizontal: 18,
    height: 54,
    shadowColor: coreColors.deepLakeBlue,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  } as ViewStyle,
  inputIcon: {
    marginRight: 10,
  } as ViewStyle,
  input: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
    paddingVertical: 0,
  } as TextStyle,
  supporting: {
    color: coreColors.mistBlueGray,
    fontSize: fs(11),
    marginTop: 5,
    marginLeft: 4,
  } as TextStyle,
  errorBox: {
    backgroundColor: 'rgba(194,91,78,0.1)',
    borderColor: 'rgba(194,91,78,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  } as ViewStyle,
  errorText: {
    color: '#C25B4E',
    fontSize: fs(12),
    lineHeight: 18,
  } as TextStyle,
  primaryButton: {
    marginTop: 10,
  } as ViewStyle,
  linkWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
  } as ViewStyle,
  /* Text Action 按压：仅色调/透明度变化，无缩放 */
  linkWrapPressed: {
    opacity: 0.72,
  } as ViewStyle,
  linkMuted: {
    color: coreColors.lakeBlue,
    fontSize: fs(14),
  } as TextStyle,
  linkAction: {
    /* STRONG：13sp·600·#168B88，无下划线 */
    color: TEXT_ACTION_STRONG,
    fontSize: fs(13),
    fontWeight: '600',
  } as TextStyle,
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  } as ViewStyle,
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: coreColors.mistBlueGray,
  } as ViewStyle,
  footerLink: {
    /* MUTED：13sp·500·#748897 */
    color: TEXT_ACTION_MUTED,
    fontSize: fs(13),
    fontWeight: '500',
  } as TextStyle,
});
