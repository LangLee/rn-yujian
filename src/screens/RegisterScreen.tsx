import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import { AuthV2Error, AuthV2Field, AuthV2Shell } from '../components/auth/AuthV2Shell';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { RootStackParamList } from '../navigation/types';
import { fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';
import { validateNickname, validateRegisterPassword, validateUsername } from '../utils/accountRules';

type RegisterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Register'>;

/**
 * 注册页 · Register V2（FROZEN）：
 * 与登录同款三视觉区；标题「创建账号 / 用一个账号，留住你的钓鱼轨迹」。
 * 冻结业务字段恰为 账号 / 密码 / 昵称 —— 不加手机号、验证码或确认密码。
 * 注册成功直接建立登录态回到首页，不显示「注册成功」中间页。
 */
export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ username: false, password: false, nickname: false });

  /* 错误时机：输入期间不打扰；失焦/提交后显示，合法即清除 */
  const usernameError = touched.username ? validateUsername(username) : null;
  const passwordError = touched.password ? validateRegisterPassword(password) : null;
  const nicknameError = touched.nickname ? validateNickname(nickname) : null;

  const canSubmit =
    !loading &&
    !validateUsername(username) &&
    !validateRegisterPassword(password) &&
    !validateNickname(nickname);

  const handleRegister = useCallback(async () => {
    if (!canSubmit) {
      setTouched({ username: true, password: true, nickname: true });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 注册成功后自动登录（session 更新）；Register 从 Login 推入，
      // 直接回到栈底 Home（Login/Guest 不决定 Empty/Normal，见手册 4.1）。
      await register(username.trim(), password, nickname.trim());
      navigation.popTo('Home');
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, register, username, password, nickname, navigation]);

  return (
    <AuthV2Shell title="创建账号" subtitle="用一个账号，留住你的钓鱼轨迹">
      <AuthV2Field
        label="账号"
        icon="person-outline"
        value={username}
        onChangeText={(text) => setUsername(text.slice(0, 32))}
        onBlur={() => setTouched((t) => ({ ...t, username: true }))}
        placeholder="请输入账号"
        supportingText="3–32 位字母、数字、_ 或 -"
        errorText={usernameError}
        maxLength={32}
        autoCapitalize="none"
        returnKeyType="next"
      />
      <AuthV2Field
        label="密码"
        icon="lock-closed-outline"
        value={password}
        onChangeText={(text) => setPassword(text.slice(0, 128))}
        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        supportingText="至少 6 位"
        maxLength={128}
        secureTextEntry
        visible={passwordVisible}
        onToggleVisibility={() => setPasswordVisible((value) => !value)}
        errorText={passwordError}
        returnKeyType="next"
      />
      <AuthV2Field
        label="昵称"
        icon="happy-outline"
        value={nickname}
        /* 安全上限远高于 20 码点业务上限，不替代可见校验 */
        onChangeText={(text) => setNickname(text.slice(0, 100))}
        onBlur={() => setTouched((t) => ({ ...t, nickname: true }))}
        placeholder="请输入昵称"
        errorText={nicknameError}
        returnKeyType="done"
        onSubmitEditing={handleRegister}
      />
      <AuthV2Error message={error} />

      <PrimaryButton
        label="注册并登录"
        onPress={handleRegister}
        disabled={!canSubmit}
        loading={loading}
        style={styles.primaryButton}
      />

      {/* 已有账号？去登录：去登录 = Text Action V1 / STRONG */}
      <Pressable
        onPress={() => navigation.goBack()}
        disabled={loading}
        style={({ pressed }) => [styles.switchHit, pressed && styles.switchPressed]}
        accessibilityRole="button"
        accessibilityLabel="去登录"
      >
        <Text style={styles.switchMuted}>已有账号？</Text>
        <Text style={styles.switchStrong}>去登录</Text>
      </Pressable>
    </AuthV2Shell>
  );
};

const styles = StyleSheet.create({
  primaryButton: {
    marginTop: 8,
  } as TextStyle,
  switchHit: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    marginTop: 6,
  } as TextStyle,
  switchPressed: {
    opacity: 0.72,
  } as TextStyle,
  switchMuted: {
    color: coreColors.lakeBlue,
    fontSize: fs(14),
  } as TextStyle,
  switchStrong: {
    color: '#168B88',
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
});
