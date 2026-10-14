import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import { AuthV2Error, AuthV2Field, AuthV2Shell } from '../components/auth/AuthV2Shell';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { RootStackParamList } from '../navigation/types';
import { fs } from '../constants/tokens';
import { coreColors } from '../constants/coreUi';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

/**
 * 登录页 · Login V2.1（FROZEN）：
 * 顶部无太阳晨湖环境区（无文字）→ 白内容场「欢迎回来 / 继续记录你的每一次渔获」→
 * 账号 / 密码 / 忘记密码？ / 登录 / 还没有账号？创建账号 → 底部水岸草丛。
 * 忘记密码为 DEFERRED 入口：能力未开放前仅作轻提示，不假装可找回。
 */
export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotNote, setForgotNote] = useState(false);
  /* 回车键焦点流转：账号 next → 密码 done → 提交 */
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = !loading && username.trim().length > 0 && password.length > 0;

  const handleLogin = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 登录成功后 AuthContext 更新 session；Login 是从 Empty Home 推入的
      // 普通页面，返回即可看到刷新后的首页。
      await login(username.trim(), password);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, login, username, password, navigation]);

  return (
    <AuthV2Shell title="欢迎回来" subtitle="继续记录你的每一次渔获">
      <AuthV2Field
        label="账号"
        icon="person"
        value={username}
        onChangeText={(text) => setUsername(text.slice(0, 32))}
        placeholder="请输入账号"
        maxLength={32}
        autoCapitalize="none"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthV2Field
        label="密码"
        icon="lock"
        inputRef={passwordRef}
        value={password}
        onChangeText={(text) => setPassword(text.slice(0, 128))}
        placeholder="请输入密码"
        maxLength={128}
        secureTextEntry
        visible={passwordVisible}
        onToggleVisibility={() => setPasswordVisible((value) => !value)}
        returnKeyType="done"
        onSubmitEditing={handleLogin}
      />
      <AuthV2Error message={error} />

      {/* 忘记密码？：Text Action V1 / MUTED 13sp·500；DEFERRED 轻提示 */}
      <Pressable
        onPress={() => setForgotNote((value) => !value)}
        style={({ pressed }) => [styles.forgotHit, pressed && styles.forgotPressed]}
        accessibilityRole="button"
        accessibilityLabel="忘记密码"
      >
        <Text style={styles.forgotText}>忘记密码？</Text>
      </Pressable>
      {forgotNote ? (
        <Text style={styles.forgotNote}>找回密码能力即将开放，当前可联系管理员重置</Text>
      ) : null}

      <PrimaryButton
        label="登录"
        onPress={handleLogin}
        disabled={!canSubmit}
        loading={loading}
        style={styles.primaryButton}
      />

      {/* 还没有账号？创建账号：创建账号 = Text Action V1 / STRONG */}
      <Pressable
        onPress={() => navigation.navigate('Register')}
        disabled={loading}
        style={({ pressed }) => [styles.switchHit, pressed && styles.switchPressed]}
        accessibilityRole="button"
        accessibilityLabel="创建账号"
      >
        <Text style={styles.switchMuted}>还没有账号？</Text>
        <Text style={styles.switchStrong}>创建账号</Text>
      </Pressable>
    </AuthV2Shell>
  );
};

const styles = StyleSheet.create({
  forgotHit: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginTop: -6,
  } as TextStyle,
  forgotPressed: {
    opacity: 0.7,
  } as TextStyle,
  /* Text Action V1 / MUTED：13sp·500·#748897 */
  forgotText: {
    color: coreColors.mistBlueGray,
    fontSize: fs(13),
    fontWeight: '500',
  } as TextStyle,
  forgotNote: {
    alignSelf: 'flex-end',
    color: '#9AACB0',
    fontSize: fs(11),
    marginTop: 4,
  } as TextStyle,
  primaryButton: {
    marginTop: 14,
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
  /* STRONG：#168B88·600 */
  switchStrong: {
    color: '#168B88',
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
});
