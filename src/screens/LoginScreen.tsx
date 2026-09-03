import React, { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import {
  AuthError,
  AuthField,
  AuthLayout,
  AuthPrimaryButton,
  AuthTextButton,
} from '../components/AuthLayout';
import { RootStackParamList } from '../navigation/types';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

/** 登录页（对应原 AuthScreens.kt LoginScreen）。 */
export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !loading && username.trim().length > 0 && password.length > 0;

  const handleLogin = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 登录成功后 AuthContext 更新 session，导航器自动切换到主界面。
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, login, username, password]);

  return (
    <AuthLayout title="登录渔见" subtitle="保存每一次真实鱼获">
      <AuthField
        label="账号"
        value={username}
        onChangeText={(text) => setUsername(text.slice(0, 32))}
        maxLength={32}
        autoCapitalize="none"
      />
      <AuthField
        label="密码"
        value={password}
        onChangeText={(text) => setPassword(text.slice(0, 128))}
        maxLength={128}
        secureTextEntry
      />
      <AuthError message={error} />
      <AuthPrimaryButton
        label={loading ? '登录中…' : '登录'}
        onPress={handleLogin}
        disabled={!canSubmit}
        loading={loading}
      />
      <AuthTextButton
        label="还没有账号？去注册"
        onPress={() => navigation.navigate('Register')}
        disabled={loading}
      />
    </AuthLayout>
  );
};
