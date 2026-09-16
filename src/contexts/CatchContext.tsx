import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useAuth, isUnauthorizedError } from './AuthContext';
import { catchService } from '../services/catchService';
import { CatchStatistics, RemoteCatch } from '../types/models';

interface CatchArchiveState {
  catches: RemoteCatch[];
  statistics: CatchStatistics;
  loading: boolean;
  error: string | null;
}

const initialState: CatchArchiveState = {
  catches: [],
  statistics: { totalCatches: 0, speciesCount: 0, topSpecies: [] },
  loading: false,
  error: null,
};

interface CatchContextType extends CatchArchiveState {
  reload: () => void;
}

const CatchContext = createContext<CatchContextType | undefined>(undefined);

interface CatchProviderProps {
  children: ReactNode;
}

/** 鱼获档案编排（对应原 YujianApp.kt 的 CatchArchiveState 与 401 登出逻辑）。 */
export const CatchProvider: React.FC<CatchProviderProps> = ({ children }) => {
  const { session, logout } = useAuth();
  const [state, setState] = useState<CatchArchiveState>(initialState);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!session) {
        if (mounted) {
          setState(initialState);
        }
        return;
      }
      if (mounted) {
        setState((previous) => ({ ...previous, loading: true, error: null }));
      }
      try {
        const [catches, statistics] = await Promise.all([
          catchService.listCatches(session.accessToken),
          catchService.statistics(session.accessToken),
        ]);
        if (mounted) {
          setState({ catches, statistics, loading: false, error: null });
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        if (isUnauthorizedError(error)) {
          await logout();
          return;
        }
        // 先在 catch 块内取出消息再进 setState 更新器：
        // 更新器在渲染阶段才执行，Hermes 0.14(RN 0.83)的 lazy 编译
        // 对跨 catch 块存活的闭包捕获 catch 参数存在 bug，会抛
        // "Property 'error' doesn't exist" 导致整个 App 崩溃。
        const message =
          error instanceof Error ? error.message : '鱼获数据加载失败';
        setState((previous) => ({
          ...previous,
          loading: false,
          error: message,
        }));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session?.accessToken, reloadToken, logout]);

  const value = useMemo<CatchContextType>(
    () => ({ ...state, reload }),
    [state, reload],
  );

  return <CatchContext.Provider value={value}>{children}</CatchContext.Provider>;
};

export const useCatchArchive = (): CatchContextType => {
  const context = useContext(CatchContext);
  if (context === undefined) {
    throw new Error('useCatchArchive must be used within a CatchProvider');
  }
  return context;
};
