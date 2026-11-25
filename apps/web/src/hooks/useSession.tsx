import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../api/client.js';
import type { Me } from '../api/types.js';

interface SessionValue {
  readonly me: Me | null;
  readonly loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('GET', '/api/v1/auth/me'));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      me,
      loading,
      refresh,
      async login(email, password) {
        await api('POST', '/api/v1/auth/login', { email, password });
        await refresh();
      },
      async logout() {
        await api('POST', '/api/v1/auth/logout');
        setMe(null);
      },
    }),
    [me, loading, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
};
