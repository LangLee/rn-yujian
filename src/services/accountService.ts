import { ApiError, requestApi } from './apiClient';

/**
 * 账号与隐私服务（账号与安全 / 数据与隐私 Active Path）。
 * 端点契约与 Android 端 AuthRepository 保持同一后端：
 *  - GET    /api/v1/me                                   → 账号资料
 *  - PATCH  /api/v1/me/profile        {nickname}         → 账号资料
 *  - POST   /api/v1/me/avatar         multipart `file`   → 账号资料
 *  - POST   /api/v1/auth/change-password {current_password, new_password}
 *  - GET    /api/v1/me/privacy                           → AI 模型改进授权状态
 *  - PUT    /api/v1/me/privacy/ai-model-improvement      → 授权状态
 */

export interface AccountProfile {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
}

interface ProfileResponse {
  id?: string | number;
  username?: string;
  nickname?: string;
  avatar_url?: string;
  avatarUrl?: string;
}

export interface AiModelImprovementSettings {
  enabled: boolean;
  updatedAt: string | null;
  consentVersion: string | null;
}

interface PrivacyResponse {
  ai_model_improvement?: {
    enabled?: boolean;
    updated_at?: string;
    consent_version?: string;
  };
}

function profileFrom(data: ProfileResponse | null): AccountProfile {
  const id = (data?.id ?? '').toString().trim();
  if (!id) {
    throw new ApiError(0, '用户响应缺少 ID');
  }
  const avatarUrl = (data?.avatar_url ?? data?.avatarUrl ?? '').trim();
  return {
    id,
    username: (data?.username ?? '').trim(),
    nickname: (data?.nickname ?? '').trim(),
    avatarUrl: avatarUrl || null,
  };
}

function privacyFrom(data: PrivacyResponse | null): AiModelImprovementSettings {
  const value = data?.ai_model_improvement;
  if (!value || typeof value !== 'object') {
    throw new ApiError(0, '隐私响应缺少授权状态');
  }
  return {
    enabled: value.enabled === true,
    updatedAt: value.updated_at?.trim() || null,
    consentVersion: value.consent_version?.trim() || null,
  };
}

/** 修改密码失败 → 冻结文案映射（Change_Password_Spec_V1 §5）。 */
export function changePasswordErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return '登录状态已失效，请重新登录';
    }
    if (error.statusCode === 403) {
      return '当前密码错误';
    }
    if (error.statusCode === 400 || error.statusCode === 422) {
      return '新密码不符合要求';
    }
    return error.message || '修改密码失败，请重试';
  }
  return error instanceof Error && error.message ? error.message : '修改密码失败，请重试';
}

export const accountService = {
  /** 当前账号资料（编辑资料初始值 / 头像权威来源）。 */
  async getProfile(): Promise<AccountProfile> {
    const data = await requestApi<ProfileResponse>('/api/v1/me');
    return profileFrom(data);
  },

  /** 更新昵称（PATCH /api/v1/me/profile，服务端响应为最终资料权威）。 */
  async updateNickname(nickname: string): Promise<AccountProfile> {
    const data = await requestApi<ProfileResponse>('/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ nickname }),
    });
    return profileFrom(data);
  },

  /** 上传 1:1 头像（multipart 字段 file），返回携带新 avatar_url 的资料。 */
  async uploadAvatar(filePath: string, mimeType = 'image/jpeg'): Promise<AccountProfile> {
    const form = new FormData();
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    form.append('file', {
      uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
      name: `avatar-${Date.now()}.${ext}`,
      type: mimeType,
    } as unknown as Blob);
    const data = await requestApi<ProfileResponse>('/api/v1/me/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: form,
      timeoutMs: 30000,
    });
    return profileFrom(data);
  },

  /** 修改密码（服务端为最终权威；错误经 changePasswordErrorMessage 映射）。 */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await requestApi<unknown>('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },

  /** AI 模型改进授权状态（数据与隐私行「读取中…/已开启/已关闭」）。 */
  async getAiModelImprovement(): Promise<AiModelImprovementSettings> {
    const data = await requestApi<PrivacyResponse>('/api/v1/me/privacy');
    return privacyFrom(data);
  },

  /** 更新 AI 模型改进授权（仅在用户显式确认后调用；失败保留原状态）。 */
  async setAiModelImprovement(
    enabled: boolean,
    source: string,
  ): Promise<AiModelImprovementSettings> {
    const data = await requestApi<PrivacyResponse>('/api/v1/me/privacy/ai-model-improvement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        enabled,
        consent_version: 'AI_MODEL_IMPROVEMENT_V1',
        source,
      }),
    });
    return privacyFrom(data);
  },
};
