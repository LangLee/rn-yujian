import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import {
  AuthError,
  AuthField,
  AuthFooterLinks,
  AuthLayout,
  AuthPrimaryButton,
  AuthTextButton,
} from '../components/AuthLayout';
import { RootStackParamList } from '../navigation/types';
import { fs } from '../constants/tokens';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

/**
 * 登录页（设计文档 05.1 + 高保真参考稿）：
 * 字段：登录账号、密码；主 CTA：登录；弱入口：还没有账号？注册。
 * 忘记密码在参考稿中展示，能力未开放前仅作轻提示，不假装可找回。
 */
export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotNote, setForgotNote] = useState(false);

  const canSubmit = !loading && username.trim().length > 0 && password.length > 0;

  const handleLogin = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 登录成功后 AuthContext 更新 session；Login 是从 Empty Home 推入的
      // 普通页面（Login/Guest 不决定 Empty/Normal），返回即可看到刷新后的首页。
      await login(username.trim(), password);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, login, username, password, navigation]);

  return (
    <AuthLayout title="渔见" subtitle="拍照收藏每次渔获">
      <AuthField
        label="登录账号"
        icon="person-outline"
        value={username}
        onChangeText={(text) => setUsername(text.slice(0, 32))}
        maxLength={32}
        autoCapitalize="none"
      />
      <AuthField
        label="密码"
        icon="lock-closed-outline"
        value={password}
        onChangeText={(text) => setPassword(text.slice(0, 128))}
        maxLength={128}
        secureTextEntry
      />
      <AuthError message={error} />
      <AuthPrimaryButton
        label="登录"
        onPress={handleLogin}
        disabled={!canSubmit}
        loading={loading}
      />
      <Pressable
        onPress={() => setForgotNote((value) => !value)}
        style={({ pressed }) => [styles.forgotHit, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="忘记密码"
      >
        <Text style={styles.forgotText}>忘记密码？</Text>
      </Pressable>
      {forgotNote ? (
        <Text style={styles.forgotNote}>找回密码能力即将开放，当前可联系管理员重置</Text>
      ) : null}
      <AuthTextButton
        label="还没有账号？"
        actionLabel="创建账号"
        onPress={() => navigation.navigate('Register')}
        disabled={loading}
      />
      <AuthFooterLinks />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  forgotHit: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  /* Text Action V1 / MUTED：13sp·500·#748897 */
  forgotText: {
    color: '#748897',
    fontSize: fs(13),
    fontWeight: '500',
  },
  forgotNote: {
    textAlign: 'center',
    color: '#9AACB0',
    fontSize: fs(12),
    marginTop: -2,
  },
});
