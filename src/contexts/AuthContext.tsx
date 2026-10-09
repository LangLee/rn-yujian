import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { authService } from '../services/authService';
import { accountService } from '../services/accountService';
import {
  ApiError,
  onApiSessionExpired,
  onApiSessionRefreshed,
  setApiSession,
} from '../services/apiClient';
import { sessionService } from '../services/sessionService';
import { recognitionService } from '../services/recognitionService';
import { UserSession } from '../types/models';

interface AuthContextType {
  session: UserSession | null;
  initializing: boolean;
  login: (username: string, password: string, nickname?: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * 以服务端确认结果合并当前会话资料（编辑资料保存成功后调用；
   * 令牌不变，仅更新 nickname/avatarUrl 并同步持久化与消费方）。
   */
  applyProfile: (patch: { nickname?: string; avatarUrl?: string | null }) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  // 令牌续期回调需要读取最新会话，避免闭包捕获旧状态
  const sessionRef = useRef<UserSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const current = await sessionService.current();
      if (mounted) {
        setSession(current);
        setInitializing(false);
      }
      // 统一 API 客户端与原生反馈上传共用同一令牌；令牌就绪后再冲刷离线队列
      setApiSession(
        current ? { accessToken: current.accessToken, refreshToken: current.refreshToken } : null,
      );
      recognitionService.setAuthToken(current?.accessToken ?? null);
      recognitionService.flushQueued().catch(() => undefined);
      // 恢复会话后同步服务端资料（昵称/头像为服务端权威；失败静默，不阻塞启动）
      if (current) {
        try {
          const profile = await accountService.getProfile();
          if (mounted && profile.nickname) {
            applyProfile({
              nickname: profile.nickname,
              avatarUrl: profile.avatarUrl,
            });
          }
        } catch {
          // 资料拉取失败不阻断启动；页面按会话缓存渲染
        }
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 访问令牌刷新失败（refreshToken 也失效）时全局登出
  useEffect(() => {
    onApiSessionExpired(() => {
      void logout();
    });
    return () => {
      onApiSessionExpired(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apiClient 自动续期成功后：同步 React 会话与本地持久化，图片等鉴权消费方拿到新令牌
  useEffect(() => {
    onApiSessionRefreshed((refreshed) => {
      const previous = sessionRef.current;
      if (!previous || previous.accessToken === refreshed.accessToken) {
        return;
      }
      const next: UserSession = {
        ...previous,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? previous.refreshToken,
      };
      sessionRef.current = next;
      void sessionService.save(next);
      recognitionService.setAuthToken(next.accessToken);
      setSession(next);
    });
    return () => {
      onApiSessionRefreshed(null);
    };
  }, []);

  const login = useCallback(async (username: string, password: string, nickname?: string) => {
    const loggedIn = await authService.login(username, password, nickname);
    await sessionService.save(loggedIn);
    setApiSession({
      accessToken: loggedIn.accessToken,
      refreshToken: loggedIn.refreshToken,
    });
    recognitionService.setAuthToken(loggedIn.accessToken);
    recognitionService.flushQueued().catch(() => undefined);
    setSession(loggedIn);
    // 登录后拉取服务端资料（昵称/头像）；失败不阻断登录流程
    try {
      const profile = await accountService.getProfile();
      if (profile.nickname || profile.avatarUrl) {
        const next: UserSession = {
          ...loggedIn,
          nickname: profile.nickname || loggedIn.nickname,
          avatarUrl: profile.avatarUrl,
        };
        await sessionService.save(next);
        setSession(next);
      }
    } catch {
      // 后端暂未提供 /me 时保持登录响应资料
    }
  }, []);

  const register = useCallback(
    async (username: string, password: string, nickname: string) => {
      await authService.register(username, password, nickname);
      // 注册成功后自动登录（与原 App 行为一致）；昵称随登录带入会话
      await login(username, password, nickname);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const current = await sessionService.current();
    if (current) {
      // 服务端吊销令牌；失败不阻断本地清理
      await authService.logout(current.accessToken);
    }
    setApiSession(null);
    recognitionService.setAuthToken(null);
    await sessionService.clear();
    setSession(null);
  }, []);

  const applyProfile = useCallback(
    (patch: { nickname?: string; avatarUrl?: string | null }) => {
      setSession((previous) => {
        if (!previous) {
          return previous;
        }
        const next: UserSession = {
          ...previous,
          ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        };
        sessionRef.current = next;
        void sessionService.save(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      initializing,
      login,
      register,
      logout,
      applyProfile,
    }),
    [session, initializing, login, register, logout, applyProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const isUnauthorizedError = (error: unknown): boolean =>
  error instanceof ApiError && error.statusCode === 401;
