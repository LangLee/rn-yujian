import { ApiError, requestApi } from './apiClient';
import { UserSession } from '../types/models';

export { ApiError, apiBaseUrl } from './apiClient';

/**
 * 渔见自建用户服务（新后端 81.71.1.11）：
 *  - POST /api/v1/auth/login        LoginForm{username,password} → AuthenticationToken
 *  - POST /api/v1/auth/register     FishRegisterForm{username,password,nickname} → FishRegisterVO
 *  - POST /api/v1/auth/refresh-token?refreshToken=...             → AuthenticationToken
 *  - DELETE /api/v1/auth/logout     （Bearer）
 *
 * 登录响应不含用户资料（无 user 对象），userId / username 从 JWT payload 解出：
 * payload 为 { sub: <username>, userId: <number>, exp, ... }。
 */

interface AuthenticationTokenJson {
  tokenType?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface RegisterResultJson {
  user_id?: string | number;
  username?: string;
}

function base64UrlDecode(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  // atob 在 RN (Hermes) 上可用；中文用户名按 UTF-8 字节还原
  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  const binary = atobFn ? atobFn(padded) : '';
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return decodeURIComponent(
    Array.from(bytes)
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

/** 解码 JWT payload（不校验签名，仅读取 userId/username 展示字段）。 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }
  try {
    return JSON.parse(base64UrlDecode(segments[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sessionFromToken(
  token: AuthenticationTokenJson,
  fallback: { username: string; nickname?: string },
): UserSession {
  const accessToken = (token.accessToken ?? '').trim();
  if (!accessToken) {
    throw new ApiError(0, '登录响应缺少访问令牌');
  }
  const claims = decodeJwtPayload(accessToken) ?? {};
  const userId = claims.userId !== undefined ? String(claims.userId) : '';
  if (!userId) {
    throw new ApiError(0, '登录响应缺少用户 ID');
  }
  const username = typeof claims.sub === 'string' && claims.sub ? claims.sub : fallback.username;
  return {
    accessToken,
    refreshToken: (token.refreshToken ?? '').trim() || undefined,
    expiresAt: token.expiresIn && token.expiresIn > 0
      ? Date.now() + token.expiresIn * 1000
      : undefined,
    userId,
    username,
    nickname: fallback.nickname ?? username,
  };
}

export const authService = {
  async login(username: string, password: string, nickname?: string): Promise<UserSession> {
    const data = await requestApi<AuthenticationTokenJson>('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username, password }),
      authOptional: true,
    });
    return sessionFromToken(data ?? {}, { username, nickname });
  },

  /** 注册成功返回后端生成的 user_id / username（HTTP 201）。 */
  async register(
    username: string,
    password: string,
    nickname: string,
  ): Promise<{ userId: string; username: string }> {
    const data = await requestApi<RegisterResultJson>('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username, password, nickname }),
      authOptional: true,
    });
    const userId = (data?.user_id ?? '').toString().trim();
    if (!userId) {
      throw new ApiError(0, '注册响应缺少用户 ID');
    }
    return { userId, username: (data?.username ?? '').trim() || username };
  },

  /** 用 refreshToken 换新的访问令牌（查询参数传递）。 */
  async refreshToken(refreshToken: string): Promise<UserSession> {
    const data = await requestApi<AuthenticationTokenJson>(
      `/api/v1/auth/refresh-token?refreshToken=${encodeURIComponent(refreshToken)}`,
      { method: 'POST', authOptional: true },
    );
    return sessionFromToken(data ?? {}, { username: '' });
  },

  /** 服务端登出（吊销令牌）；失败不阻断本地登出。 */
  async logout(accessToken: string): Promise<void> {
    try {
      await requestApi<void>('/api/v1/auth/logout', {
        method: 'DELETE',
        skipAuthRefresh: true,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // 网络失败时仍继续本地清理
    }
  },

  /** 图形验证码（当前注册/登录表单未要求，预留给后续风控）。 */
  async captcha(): Promise<{ captchaId: string; captchaBase64: string }> {
    const data = await requestApi<{ captchaId?: string; captchaBase64?: string }>(
      '/api/v1/auth/captcha',
      { authOptional: true },
    );
    return {
      captchaId: data?.captchaId ?? '',
      captchaBase64: data?.captchaBase64 ?? '',
    };
  },
};
