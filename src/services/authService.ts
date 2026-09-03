import Config from 'react-native-config';
import { UserSession } from '../types/models';

/** 与原工程 ApiException 对应：携带状态码，401 触发全局登出。 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const DEFAULT_BASE_URL = 'https://yujian-model-factory-console-571785698442.asia-east1.run.app';

export const apiBaseUrl = (): string => {
  const url = (Config.YUJIAN_API_BASE_URL ?? '').trim();
  return url || DEFAULT_BASE_URL;
};

const DEFAULT_TIMEOUT_MS = 20000;

async function requestJson<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const root = apiBaseUrl().replace(/\/+$/, '');
  if (!root) {
    throw new ApiError(0, '用户服务未配置');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(root + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = '';
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail ?? '';
      } catch {
        detail = '';
      }
      throw new ApiError(
        response.status,
        detail || `请求失败 (${response.status})`,
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, '请求超时，请检查网络后重试');
    }
    throw new ApiError(0, error instanceof Error ? error.message : '网络请求失败');
  }
}

interface LoginResponse {
  access_token?: string;
  user?: { id?: string; username?: string; nickname?: string };
}

/** 渔见自研用户 API（对应原 AuthRepository）。 */
export const authService = {
  async register(username: string, password: string, nickname: string): Promise<void> {
    await requestJson('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username, password, nickname }),
    });
  },

  async login(username: string, password: string): Promise<UserSession> {
    const response = await requestJson<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username, password }),
    });
    const user = response.user ?? {};
    const accessToken = (response.access_token ?? '').trim();
    const userId = (user.id ?? '').trim();
    if (!accessToken) {
      throw new ApiError(0, '登录响应缺少 access token');
    }
    if (!userId) {
      throw new ApiError(0, '登录响应缺少用户 ID');
    }
    return {
      accessToken,
      userId,
      username: user.username ?? '',
      nickname: user.nickname ?? '',
    };
  },
};
