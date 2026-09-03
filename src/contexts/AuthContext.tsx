import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { authService, ApiError } from '../services/authService';
import { sessionService } from '../services/sessionService';
import { recognitionService } from '../services/recognitionService';
import { UserSession } from '../types/models';

interface AuthContextType {
  session: UserSession | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const current = await sessionService.current();
      if (mounted) {
        setSession(current);
        setInitializing(false);
      }
      // 启动时冲刷离线反馈/推理队列（与原 App LaunchedEffect(flushQueued) 一致）。
      recognitionService.flushQueued().catch(() => undefined);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const loggedIn = await authService.login(username, password);
    await sessionService.save(loggedIn);
    setSession(loggedIn);
  }, []);

  const register = useCallback(
    async (username: string, password: string, nickname: string) => {
      await authService.register(username, password, nickname);
      // 注册成功后自动登录（与原 App 行为一致）。
      await login(username, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await sessionService.clear();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      initializing,
      login,
      register,
      logout,
    }),
    [session, initializing, login, register, logout],
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
