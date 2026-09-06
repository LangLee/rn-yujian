import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
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
import { palette } from '../constants/colors';
import { font } from '../constants/tokens';
import { WaterBackdrop } from './WaterBackdrop';

const GOLD = '#C9A96A';
const SOFT_TEAL = '#8FBDBB';
const INK = '#2E5D68';

/**
 * 登录 / 注册公共布局（高保真参考稿）：
 * 全屏湖面环境背景，居中衬线品牌区（渔见 + 金点副标题），
 * 白玻璃输入框直接落在背景上（无大白卡）。
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <WaterBackdrop />
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
          showsVerticalScrollIndicator={false}
        >
          {/* 品牌区 */}
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>{title}</Text>
            <View style={styles.brandSubRow}>
              <View style={styles.goldDot} />
              <Text style={styles.subtitle}>{subtitle}</Text>
              <View style={styles.goldDot} />
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

/** 白玻璃输入框（左侧图标 + 密码可见切换，参考稿样式）。 */
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
        <Icon name={icon} size={17} color="#7C959C" style={styles.inputIcon} />
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
          placeholderTextColor="#8AA0A6"
          selectionColor={palette.waterTeal}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setVisible((value2) => !value2)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
          >
            <Icon name={visible ? 'eye-outline' : 'eye-off-outline'} size={18} color="#7C959C" />
          </Pressable>
        ) : null}
      </View>
      {supportingText ? <Text style={styles.supporting}>{supportingText}</Text> : null}
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

/** 雾青主按钮（参考稿：柔和湖青、白字、大圆角）。 */
export const AuthPrimaryButton: React.FC<AuthPrimaryButtonProps> = ({
  label,
  onPress,
  disabled = false,
  loading = false,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [
      styles.primaryButton,
      (disabled || loading) && styles.primaryButtonDisabled,
      pressed && !disabled && !loading && { opacity: 0.88 },
    ]}
    accessibilityRole="button"
  >
    {loading ? (
      <ActivityIndicator size="small" color="#FFFFFF" />
    ) : (
      <Text style={styles.primaryButtonText}>{label}</Text>
    )}
  </Pressable>
);

/** 文本切换行：「还没有账号？ 注册」灰字 + 湖青强调。 */
export const AuthTextButton: React.FC<{
  label: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, actionLabel, onPress, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}
    hitSlop={8}
    accessibilityRole="button"
  >
    <Text style={styles.linkMuted}>{label}</Text>
    <Text style={styles.linkAction}>{actionLabel}</Text>
  </Pressable>
);

/** 底部协议轻链接（用户协议 · 隐私政策）。 */
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
    paddingHorizontal: 28,
  } as ViewStyle,
  brandBlock: {
    alignItems: 'center',
    marginBottom: 46,
  } as ViewStyle,
  brand: {
    fontFamily: font.serif,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 14,
    color: INK,
    marginLeft: 14, // 抵消 letterSpacing 右偏，保持视觉居中
  } as TextStyle,
  brandSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  } as ViewStyle,
  goldDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GOLD,
  } as ViewStyle,
  subtitle: {
    fontSize: 13,
    letterSpacing: 4,
    color: '#5E7A82',
  } as TextStyle,
  fields: {
    gap: 16,
  } as ViewStyle,
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    height: 52,
    shadowColor: '#173B4B',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  } as ViewStyle,
  inputIcon: {
    marginRight: 10,
  } as ViewStyle,
  input: {
    flex: 1,
    fontSize: 15,
    color: INK,
    paddingVertical: 0,
  } as TextStyle,
  supporting: {
    color: '#8AA0A6',
    fontSize: 11,
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
    color: palette.qualityInvalid,
    fontSize: 12,
    lineHeight: 18,
  } as TextStyle,
  primaryButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: SOFT_TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#4D9EA1',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  } as ViewStyle,
  primaryButtonDisabled: {
    opacity: 0.5,
  } as ViewStyle,
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 2,
  } as TextStyle,
  linkWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
  } as ViewStyle,
  linkMuted: {
    color: '#6A7D86',
    fontSize: 14,
  } as TextStyle,
  linkAction: {
    color: palette.waterTeal,
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: '#9AACB0',
  } as ViewStyle,
  footerLink: {
    color: '#9AACB0',
    fontSize: 12,
  } as TextStyle,
});
