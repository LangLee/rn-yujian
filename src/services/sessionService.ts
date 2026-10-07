import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSession } from '../types/models';

const STORAGE_KEY = 'yujian_user_session';

/** AsyncStorage 版 UserSessionManager（与原 SharedPreferences 行为一致）。 */
export const sessionService = {
  async current(): Promise<UserSession | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const session = JSON.parse(raw) as UserSession;
      if (!session.accessToken || !session.userId) {
        return null;
      }
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: typeof session.expiresAt === 'number' ? session.expiresAt : undefined,
        userId: session.userId,
        username: session.username ?? '',
        nickname: session.nickname ?? '',
      };
    } catch {
      return null;
    }
  },

  async save(session: UserSession): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
