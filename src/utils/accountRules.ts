/**
 * 账号与隐私 · 冻结校验规则（无副作用纯函数，页面与测试共用）。
 *
 * 权威来源：
 *  - Register V2：账号 3–32 位字母、数字、_ 或 -；密码至少 6 位；昵称 1–20。
 *  - Change_Password_Spec_V1：当前密码非空；新密码 6–72；确认一致；新旧不同。
 *  - Nickname_Edit_V1_Development_Contract：trim 后 1–20 个 Unicode 码点
 *    （按 code point 计数，emoji/增补平面与后端语义一致）。
 */

/** Unicode 码点计数（与后端 codePointCount 对齐，UTF-16 代理对算 1）。 */
export function codePointCount(text: string): number {
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _ of text) {
    count += 1;
  }
  return count;
}

/** 账号（注册 V2）：3–32 位，仅字母、数字、下划线或连字符。 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) {
    return '请输入账号';
  }
  if (!USERNAME_PATTERN.test(value)) {
    return '3–32 位字母、数字、_ 或 -';
  }
  return null;
}

/** 注册/登录密码：至少 6 位（登录只要求非空）。 */
export function validateLoginPassword(password: string): string | null {
  return password.length === 0 ? '请输入密码' : null;
}

export function validateRegisterPassword(password: string): string | null {
  if (password.length === 0) {
    return '请输入密码';
  }
  if (password.length < 6) {
    return '至少 6 位';
  }
  return null;
}

/** 昵称（编辑资料 / 注册）：trim 后 1–20 个 Unicode 码点。 */
export function validateNickname(nickname: string): string | null {
  const normalized = nickname.trim();
  if (!normalized) {
    return '昵称不能为空';
  }
  if (codePointCount(normalized) > 20) {
    return '昵称不能超过 20 个字符';
  }
  return null;
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim();
}

/** 修改密码 · 本地校验（本地非法禁用保存；服务端仍为最终权威）。 */
export interface ChangePasswordDraft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function validateChangePassword(draft: ChangePasswordDraft): {
  valid: boolean;
  /** 贴近具体字段的错误（用于行内提示；valid 时为 null） */
  fieldError: string | null;
} {
  if (!draft.currentPassword) {
    return { valid: false, fieldError: null };
  }
  if (draft.newPassword.length < 6 || draft.newPassword.length > 72) {
    return { valid: false, fieldError: draft.newPassword ? '新密码需为 6–72 位' : null };
  }
  if (draft.confirmPassword !== draft.newPassword) {
    return {
      valid: false,
      fieldError: draft.confirmPassword ? '两次输入的密码不一致' : null,
    };
  }
  if (draft.newPassword === draft.currentPassword) {
    return { valid: false, fieldError: '新密码需与当前密码不同' };
  }
  return { valid: true, fieldError: null };
}

/** 修改密码输入不超过 72 字符（Change_Password_Spec_V1 §3）。 */
export const PASSWORD_MAX_LENGTH = 72;
