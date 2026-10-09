import React, { ReactNode } from 'react';
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
import Icon from 'react-native-vector-icons/Ionicons';
import { coreColors } from '../../constants/coreUi';
import { fs } from '../../constants/tokens';
import { LakeContentBackdrop, CONTENT_FIELD } from '../coreui/LakeContentBackdrop';
import { FooterGrass } from '../ui/FooterGrass';

/**
 * 登录 / 注册 V2 共享壳（Login V2.1 + Register V2 冻结稿）。
 *
 * 三视觉区：顶部无太阳晨湖环境区（约 1/3，无任何文字/口号）→
 * 大面积白/MistWhite 主内容场（标题/表单/动作，表单不加整卡玻璃）→
 * 低存在感水岸草丛贴页面绝对底边。湖景自然渐隐入白场。
 * 输入 18dp 圆角；主按钮复用 Action Button V1 / PRIMARY；
 * 文本动作 MUTED #748897 13sp·500 / STRONG。
 */

interface AuthV2ShellProps {
  /** 页面标题（欢迎回来 / 创建账号）——第一个文字焦点 */
  title: string;
  subtitle: string;
  children: ReactNode;
}

export const AuthV2Shell: React.FC<AuthV2ShellProps> = ({ title, subtitle, children }) => {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  /* 标题落在湖景渐变结束后的白场（顶部环境区约 32% + 过渡余量） */
  const contentTop = Math.round(windowH * 0.32) + insets.top;
  return (
    /* 仅根 View 持底色（位于绝对定位背景层之下）；KAV/ScrollView 必须透明，
       否则不透明兄弟节点会整屏盖住 LakeContentBackdrop 的湖景 */
    <View style={styles.root}>
      <LakeContentBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: contentTop, paddingBottom: 120 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.fields}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 底部水岸草丛：页面自有前景装饰，不遮挡文字与 CTA */}
      <FooterGrass />
    </View>
  );
};

interface AuthV2FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  secureTextEntry?: boolean;
  /** 输入框下辅助文案（注册：3–32 位… / 至少 6 位） */
  supportingText?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  icon?: string;
  /** 密码可见切换（Icon Action V1 / CONTEXT / ON_LIGHT） */
  onToggleVisibility?: () => void;
  visible?: boolean;
  /** 右侧清空动作 */
  onClear?: () => void;
  errorText?: string | null;
  returnKeyType?: 'done' | 'next' | 'go';
  onSubmitEditing?: () => void;
  /** 失焦回调（错误提示时机：输入期不打扰，失焦后显示） */
  onBlur?: () => void;
  autoFocus?: boolean;
  accessible?: boolean;
}

/** V2 输入框：标签在上方；白面 18dp 圆角；可选前导图标与右缘动作。 */
export const AuthV2Field: React.FC<AuthV2FieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  secureTextEntry = false,
  supportingText,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  icon,
  onToggleVisibility,
  visible,
  onClear,
  errorText,
  returnKeyType,
  onSubmitEditing,
  onBlur,
  autoFocus,
  accessible,
}) => (
  <View>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.inputWrap, errorText ? styles.inputWrapError : null]}>
      {icon ? (
        <Icon name={icon} size={18} color="rgba(11,45,75,0.55)" style={styles.inputIcon} />
      ) : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#9AACB5"
        maxLength={maxLength}
        secureTextEntry={secureTextEntry && visible !== true}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        selectionColor={coreColors.morningGold}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
        autoFocus={autoFocus}
        importantForAutofill={accessible ? 'no' : undefined}
      />
      {onToggleVisibility ? (
        <Pressable
          onPress={onToggleVisibility}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? '隐藏密码' : '显示密码'}
        >
          <Icon
            name={visible ? 'eye-outline' : 'eye-off-outline'}
            size={19}
            color="rgba(11,45,75,0.62)"
          />
        </Pressable>
      ) : null}
      {!onToggleVisibility && onClear && value.length > 0 ? (
        <Pressable
          onPress={onClear}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`清空${label}`}
        >
          <Icon name="close-circle" size={18} color="rgba(116,136,151,0.7)" />
        </Pressable>
      ) : null}
    </View>
    {errorText ? (
      <Text style={styles.fieldError}>{errorText}</Text>
    ) : supportingText ? (
      <Text style={styles.supporting}>{supportingText}</Text>
    ) : null}
  </View>
);

/** 页面级错误条（表单下方，网络/服务端错误） */
export const AuthV2Error: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <Text style={styles.errorBar}>{message}</Text> : null;

const styles = StyleSheet.create({
  /** 根 View：底色仅作兜底（背景层自身已填 CONTENT_FIELD） */
  root: {
    flex: 1,
    backgroundColor: CONTENT_FIELD,
  } as ViewStyle,
  /** KAV / ScrollView：透明容器，不得携带背景色盖住背景层 */
  flex: {
    flex: 1,
  } as ViewStyle,
  content: {
    flexGrow: 1,
    /* Action Button V1.1 §7：内容左右边距 24dp */
    paddingHorizontal: 24,
  } as ViewStyle,
  title: {
    fontSize: fs(28),
    lineHeight: fs(36),
    fontWeight: '700',
    color: coreColors.deepLakeBlue,
    letterSpacing: 1,
  } as TextStyle,
  subtitle: {
    fontSize: fs(14),
    lineHeight: fs(20),
    color: coreColors.mistBlueGray,
    marginTop: 6,
    marginBottom: 30,
  } as TextStyle,
  fields: {
    gap: 18,
  } as ViewStyle,
  fieldLabel: {
    fontSize: fs(13),
    fontWeight: '600',
    color: coreColors.lakeBlue,
    marginBottom: 7,
    marginLeft: 2,
  } as TextStyle,
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(11,45,75,0.10)',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 54,
  } as ViewStyle,
  inputWrapError: {
    borderColor: 'rgba(194,91,78,0.55)',
  } as ViewStyle,
  inputIcon: {} as ViewStyle,
  input: {
    flex: 1,
    fontSize: fs(15),
    color: coreColors.deepLakeBlue,
    paddingVertical: 0,
  } as TextStyle,
  supporting: {
    fontSize: fs(11),
    color: coreColors.mistBlueGray,
    marginTop: 6,
    marginLeft: 2,
  } as TextStyle,
  fieldError: {
    fontSize: fs(11),
    color: '#C25B4E',
    marginTop: 6,
    marginLeft: 2,
  } as TextStyle,
  errorBar: {
    backgroundColor: 'rgba(194,91,78,0.10)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#C25B4E',
    fontSize: fs(12),
    lineHeight: 18,
    overflow: 'hidden',
  } as TextStyle,
});
