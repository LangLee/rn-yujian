import React, { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, AppIconName } from '../icons/AppIcon';
import { coreColors } from '../../constants/coreUi';
import { fs } from '../../constants/tokens';
import { LakeContentBackdrop, CONTENT_FIELD } from '../coreui/LakeContentBackdrop';
import { FooterGrass } from '../ui/FooterGrass';
import {
  KeyboardAvoidingScrollView,
  useEnsureInputVisible,
} from '../ui/KeyboardAvoidingScrollView';

/**
 * 登录 / 注册 V2 共享壳（Login V2.1 + Register V2 冻结稿）。
 *
 * 三视觉区（冻结稿实测比例）：顶部无太阳晨湖环境区约至 42% 屏高（无任何
 * 文字/口号）→ 大面积白/MistWhite 主内容场，标题落在约 44% 屏高处
 * （表单不加整卡玻璃）→ 低存在感水岸草丛贴页面绝对底边（约 8.5% 高）。
 * 输入 18dp 圆角；主按钮复用 Action Button V1 / PRIMARY；
 * 文本动作 MUTED #748897 13sp·500 / STRONG。
 * 键盘避让：iOS 原生 automaticallyAdjustKeyboardInsets；Android edge-to-edge
 * 下由 KeyboardAvoidingScrollView 手动补内边距并滚动聚焦框。
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
  /* 冻结稿：湖景渐隐完成约 42% 屏高；标题 43.9–45.3%，取 44% 白场 */
  const lakeHeight = Math.round(windowH * 0.42);
  const contentTop = Math.round(windowH * 0.44);
  return (
    /* 仅根 View 持底色（位于绝对定位背景层之下）；ScrollView 必须透明，
       否则不透明兄弟节点会整屏盖住 LakeContentBackdrop 的湖景 */
    <View style={styles.root}>
      <LakeContentBackdrop topHeight={lakeHeight} />
      <KeyboardAvoidingScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          /* 底部链接压在草丛上缘之上（冻结稿：链接 ~92.8%，草顶 ~93%） */
          { paddingTop: contentTop, paddingBottom: Math.round(windowH * 0.085) + 8 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.fields}>{children}</View>
      </KeyboardAvoidingScrollView>
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
  icon?: AppIconName;
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
  /** 暴露内部 TextInput（表单内回车键流转焦点用） */
  inputRef?: React.RefObject<TextInput | null>;
  /** 回车只触发 onSubmitEditing 不失焦（next 键跳下一栏时避免键盘闪缩） */
  blurOnSubmit?: boolean;
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
  inputRef,
  blurOnSubmit,
}) => {
  /* Android 键盘已开时回车跳下一栏不触发键盘事件：聚焦时主动请求滚动 */
  const ensureInputVisible = useEnsureInputVisible();
  return (
  <View>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.inputWrap, errorText ? styles.inputWrapError : null]}>
      {icon ? (
        <AppIcon name={icon} size={18} color="rgba(11,45,75,0.55)" style={styles.inputIcon} />
      ) : null}
      <TextInput
        ref={inputRef}
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
        blurOnSubmit={blurOnSubmit}
        onBlur={onBlur}
        onFocus={() =>
          requestAnimationFrame(() =>
            ensureInputVisible(TextInput.State.currentlyFocusedInput()),
          )
        }
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
          <AppIcon
            name={visible ? 'visibility' : 'visibility_off'}
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
          <AppIcon name="clear_field" size={18} color="rgba(116,136,151,0.7)" />
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
};

/** 页面级错误条（表单下方，网络/服务端错误） */
export const AuthV2Error: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <Text style={styles.errorBar}>{message}</Text> : null;

const styles = StyleSheet.create({
  /** 根 View：底色仅作兜底（背景层自身已填 CONTENT_FIELD） */
  root: {
    flex: 1,
    backgroundColor: CONTENT_FIELD,
  } as ViewStyle,
  /** ScrollView：透明容器，不得携带背景色盖住背景层 */
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
    /* 冻结稿节奏：副标题底部到首栏标签 ~4.7% 屏高（含行高） */
    marginBottom: 20,
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
