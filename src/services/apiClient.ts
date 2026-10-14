import Config from 'react-native-config';

/**
 * 统一 API 客户端 —— 对接新后端（https://81.71.1.11/doc.html）的公共约定：
 *  - 所有业务响应统一包裹为 Result：`{ code, msg, data }`，成功码为字符串 "00000"；
 *  - 错误码形如 "A0210"（客户端错误）、"B0600"（服务端错误），msg 为用户可读文案；
 *  - 需鉴权的接口走 JWT Bearer（Authorization 头），令牌过期返回 HTTP 401 + code A0230；
 *  - 刷新令牌：POST /api/v1/auth/refresh-token?refreshToken=...（查询参数）。
 */

/** 与原工程 ApiException 对应：携带状态码与业务码，401 触发全局登出。 */
export class ApiError extends Error {
  readonly statusCode: number;
  /** 后端 Result.code（如 A0230）；网络/解析层错误时为空。 */
  readonly bizCode?: string;

  constructor(statusCode: number, message: string, bizCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.bizCode = bizCode;
  }
}

export const SUCCESS_CODE = '00000';
/** 访问令牌无效或已过期。 */
export const TOKEN_INVALID_CODE = 'A0230';

const DEFAULT_BASE_URL = 'https://81.71.1.11';
const DEFAULT_TIMEOUT_MS = 20000;

export const apiBaseUrl = (): string => {
  const url = (Config.YUJIAN_API_BASE_URL ?? '').trim();
  return url || DEFAULT_BASE_URL;
};

// ---------------------------------------------------------------------------
// 会话令牌（模块级持有，供所有请求与 RemoteImage 鉴权头复用）
// ---------------------------------------------------------------------------

export interface ApiSession {
  accessToken: string;
  refreshToken?: string | null;
}

let currentSession: ApiSession | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let sessionRefreshedHandler: ((session: ApiSession) => void) | null = null;

export const setApiSession = (session: ApiSession | null): void => {
  currentSession = session;
};

export const getApiAccessToken = (): string | null =>
  currentSession?.accessToken ?? null;

/** 刷新失败（refreshToken 也失效）时回调，AuthContext 用于全局登出。 */
export const onApiSessionExpired = (handler: (() => void) | null): void => {
  sessionExpiredHandler = handler;
};

/** 访问令牌自动续期后回调，AuthContext 用于持久化并刷新页面会话状态。 */
export const onApiSessionRefreshed = (handler: ((session: ApiSession) => void) | null): void => {
  sessionRefreshedHandler = handler;
};

// ---------------------------------------------------------------------------
// Result 包裹解析
// ---------------------------------------------------------------------------

interface ResultEnvelope {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
}

/**
 * 解析响应体：带 code 字段的按 Result 约定校验并返回 data；
 * 不带 code 的（媒体流等）原样返回解析结果。
 */
export function parseResultBody(text: string, statusCode: number): unknown {
  if (!text) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(statusCode, `响应格式错误: ${text.slice(0, 120)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }
  const envelope = parsed as ResultEnvelope;
  if (typeof envelope.code !== 'string') {
    return parsed;
  }
  if (envelope.code !== SUCCESS_CODE) {
    const msg = typeof envelope.msg === 'string' && envelope.msg.trim()
      ? envelope.msg.trim()
      : `请求失败 (${envelope.code})`;
    throw new ApiError(statusCode, msg, envelope.code);
  }
  return envelope.data;
}

// ---------------------------------------------------------------------------
// 请求
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit_;
  timeoutMs?: number;
  /** 跳过 401 刷新重试（刷新请求自身使用）。 */
  skipAuthRefresh?: boolean;
  /** 401 时不触发刷新直接抛错。 */
  authOptional?: boolean;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const root = apiBaseUrl().replace(/\/+$/, '');
  if (!root) {
    throw new ApiError(0, '用户服务未配置');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const token = getApiAccessToken();
    return await fetch(root + path, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(token && !options.authOptional
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(options.headers ?? {}),
      },
      body: options.body,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, '请求超时，请检查网络后重试');
    }
    throw new ApiError(0, error instanceof Error ? error.message : '网络请求失败');
  } finally {
    clearTimeout(timeout);
  }
}

async function isUnauthorized(response: Response, bodyText: string): Promise<boolean> {
  if (response.status === 401) {
    return true;
  }
  // 个别网关可能以 200 + A0230 表达令牌失效
  try {
    const parsed = JSON.parse(bodyText) as ResultEnvelope;
    return parsed?.code === TOKEN_INVALID_CODE;
  } catch {
    return false;
  }
}

/** 刷新访问令牌；成功则更新模块会话并返回新 accessToken。 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = currentSession?.refreshToken?.trim();
  if (!refreshToken) {
    throw new ApiError(401, '登录已过期，请重新登录', TOKEN_INVALID_CODE);
  }
  const response = await rawRequest(
    `/api/v1/auth/refresh-token?refreshToken=${encodeURIComponent(refreshToken)}`,
    { method: 'POST', skipAuthRefresh: true, authOptional: true },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(response.status, '登录已过期，请重新登录', TOKEN_INVALID_CODE);
  }
  const data = parseResultBody(text, response.status) as
    | { accessToken?: string; refreshToken?: string }
    | null;
  const accessToken = (data?.accessToken ?? '').trim();
  if (!accessToken) {
    throw new ApiError(401, '登录已过期，请重新登录', TOKEN_INVALID_CODE);
  }
  currentSession = {
    accessToken,
    refreshToken: (data?.refreshToken ?? '').trim() || refreshToken,
  };
  sessionRefreshedHandler?.(currentSession);
  return accessToken;
}

/**
 * 发起 JSON 请求并解包 Result.data。
 * 访问令牌过期时自动用 refreshToken 刷新并重试一次；刷新失败触发全局登出回调。
 */
export async function requestApi<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await rawRequest(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw error instanceof Error ? error : new ApiError(0, '网络请求失败');
  }
  let text = await response.text();
  if (await isUnauthorized(response, text)) {
    if (options.skipAuthRefresh || !currentSession) {
      const message = extractMsg(text) || '登录已过期，请重新登录';
      throw new ApiError(response.status, message, TOKEN_INVALID_CODE);
    }
    try {
      await refreshAccessToken();
    } catch {
      currentSession = null;
      sessionExpiredHandler?.();
      throw new ApiError(401, '登录已过期，请重新登录', TOKEN_INVALID_CODE);
    }
    // refreshAccessToken 已更新模块会话，rawRequest 会自动携带新令牌重放
    response = await rawRequest(path, options);
    text = await response.text();
  }
  if (!response.ok) {
    // TODO(debug): 临时日志，排查 409 用，定位后删除
    console.log(
      `[api] ${options.method ?? 'GET'} ${path} → HTTP ${response.status} ` +
        `body=${text.slice(0, 500)}`,
    );
    const message = extractMsg(text);
    let bizCode: string | undefined;
    try {
      const parsed = JSON.parse(text) as ResultEnvelope;
      if (typeof parsed?.code === 'string') {
        bizCode = parsed.code;
      }
    } catch {
      // 非 JSON 错误体
    }
    throw new ApiError(response.status, message || `请求失败 (${response.status})`, bizCode);
  }
  return parseResultBody(text, response.status) as T;
}

function extractMsg(text: string): string {
  try {
    const parsed = JSON.parse(text) as ResultEnvelope;
    return typeof parsed?.msg === 'string' ? parsed.msg.trim() : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 相对媒体路径 → 绝对地址（鱼获图片等 /api/... 相对路径拼接）
// ---------------------------------------------------------------------------

export function resolveMediaUrl(path?: string | null): string | null {
  const value = (path ?? '').trim();
  if (!value) {
    return null;
  }
  // 已带协议的 URI 原样返回：http(s) 远程地址、file:///content:// 本地文件。
  // file:// 若走下方拼接会变成「API域名/file://...」导致媒体查看器加载失败落白色占位。
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return value;
  }
  const root = apiBaseUrl().replace(/\/+$/, '');
  if (!root) {
    return null;
  }
  return value.startsWith('/') ? `${root}${value}` : `${root}/${value}`;
}
