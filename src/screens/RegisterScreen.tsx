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

type RegisterScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Register'>;

/** 注册页（对应原 AuthScreens.kt RegisterScreen，注册成功自动登录）。 */
export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    username.trim().length > 0 &&
    password.length >= 6 &&
    nickname.trim().length > 0;

  const handleRegister = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 注册成功后自动登录，session 更新即进入主界面。
      await register(username.trim(), password, nickname.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败，请稍后重试');
      setLoading(false);
    }
  }, [canSubmit, register, username, password, nickname]);

  return (
    <AuthLayout title="创建账号" subtitle="用一个账号，留住你的钓鱼轨迹">
      <AuthField
        label="账号"
        value={username}
        onChangeText={(text) => setUsername(text.slice(0, 32))}
        maxLength={32}
        autoCapitalize="none"
        supportingText="3–32 位字母、数字、下划线或连字符"
      />
      <AuthField
        label="密码"
        value={password}
        onChangeText={(text) => setPassword(text.slice(0, 128))}
        maxLength={128}
        secureTextEntry
        supportingText="至少 6 位"
      />
      <AuthField
        label="昵称"
        value={nickname}
        onChangeText={(text) => setNickname(text.slice(0, 32))}
        maxLength={32}
      />
      <AuthError message={error} />
      <AuthPrimaryButton
        label={loading ? '注册中…' : '注册并登录'}
        onPress={handleRegister}
        disabled={!canSubmit}
        loading={loading}
      />
      <AuthTextButton
        label="已有账号？去登录"
        onPress={() => navigation.goBack()}
        disabled={loading}
      />
    </AuthLayout>
  );
};
