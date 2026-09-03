import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { palette } from '../constants/colors';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** 登录/注册公共布局（对应原 AuthScreens.kt AuthLayout：暖米白底 + 白色大圆角卡）。 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <KeyboardAvoidingView
    style={styles.flex}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.brand}>渔见 AI</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.fields}>{children}</View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
);

interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  secureTextEntry?: boolean;
  supportingText?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
}

/** 表单输入框（对应原 OutlinedTextField 圆角 18）。 */
export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  value,
  onChangeText,
  maxLength,
  secureTextEntry = false,
  supportingText,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}) => (
  <View>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      maxLength={maxLength}
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      keyboardType={keyboardType}
      placeholder={label}
      placeholderTextColor={palette.mutedInk}
      selectionColor={palette.waterTeal}
    />
    {supportingText ? <Text style={styles.supporting}>{supportingText}</Text> : null}
  </View>
);

/** 错误提示条（对应原 AuthError）。 */
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

/** 主按钮（对应原 Button：WaterTeal、高 54、圆角 27）。 */
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
      pressed && !disabled && !loading && { opacity: 0.85 },
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

/** 文本链接按钮（对应原 TextButton）。 */
export const AuthTextButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, onPress, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}
    hitSlop={8}
    accessibilityRole="button"
  >
    <Text style={styles.linkText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
  },
  card: {
    flex: 1,
    backgroundColor: palette.cardWhite,
    borderRadius: 30,
    padding: 24,
    marginTop: 64,
  },
  brand: {
    color: palette.waterTeal,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: palette.deepInk,
    fontSize: 30,
    fontWeight: '700',
    marginTop: 4,
  },
  subtitle: {
    color: palette.mutedInk,
    fontSize: 13,
    marginTop: 6,
  },
  fields: {
    marginTop: 18,
    gap: 14,
  },
  input: {
    backgroundColor: palette.cardWhite,
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: palette.deepInk,
  },
  supporting: {
    color: palette.mutedInk,
    fontSize: 11,
    marginTop: 5,
    marginLeft: 4,
  },
  errorBox: {
    backgroundColor: palette.softWater,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: palette.qualityInvalid,
    fontSize: 12,
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.waterTeal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: palette.waterTeal,
    fontSize: 14,
  },
});
