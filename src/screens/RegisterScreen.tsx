import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
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

type RegisterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Register'>;

/**
 * 注册页（设计文档 05.2 + 高保真参考稿）：
 * 字段：账号 / 用户名、密码、确认密码；主 CTA：注册并进入渔见。
 * 注册成功后直接建立登录态并进入首页，不显示「注册成功」中间页；
 * 协议文案只保留 CTA 下方一处。
 */
export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    username.trim().length > 0 &&
    password.length >= 6 &&
    password === confirmPassword;

  const mismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleRegister = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 注册成功后自动登录，session 更新即进入主界面；昵称默认取用户名。
      await register(username.trim(), password, username.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, register, username, password]);

  return (
    <AuthLayout title="渔见" subtitle="拍照收藏每次渔获">
      <AuthField
        label="账号 / 用户名"
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
        supportingText="至少 6 位"
      />
      <AuthField
        label="确认密码"
        icon="lock-closed-outline"
        value={confirmPassword}
        onChangeText={(text) => setConfirmPassword(text.slice(0, 128))}
        maxLength={128}
        secureTextEntry
      />
      <AuthError message={mismatch ? '两次输入的密码不一致' : error} />
      <AuthPrimaryButton
        label="注册并进入渔见"
        onPress={handleRegister}
        disabled={!canSubmit}
        loading={loading}
      />
      {/* 协议文案只保留这一处（5.2） */}
      <View style={styles.agreementRow}>
        <Text style={styles.agreementText}>注册即表示同意</Text>
        <Text style={styles.agreementLink}>《用户协议》</Text>
        <Text style={styles.agreementLink}>《隐私政策》</Text>
      </View>
      <AuthTextButton
        label="已有账号？"
        actionLabel="登录"
        onPress={() => navigation.goBack()}
        disabled={loading}
      />
      <AuthFooterLinks />
    </AuthLayout>
  );
};

const styles = {
  agreementRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  agreementText: {
    color: '#8AA0A6',
    fontSize: fs(12),
  },
  agreementLink: {
    color: '#4D9EA1',
    fontSize: fs(12),
    fontWeight: '500',
  },
} as const;
