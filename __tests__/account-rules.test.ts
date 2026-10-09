/**
 * 账号与隐私冻结校验契约单测：
 * - Nickname_Edit_V1：trim 后 1–20 Unicode 码点（1 合法 / 20 合法 / 21 非法 /
 *   空与纯空格非法 / emoji 按码点计数）；
 * - Change_Password_Spec_V1：非空 / 6–72 / 一致 / 新旧不同；
 * - Register V2：账号 3–32 位字母数字_-。
 */
import {
  codePointCount,
  normalizeNickname,
  validateChangePassword,
  validateNickname,
  validateUsername,
} from '../src/utils/accountRules';

describe('昵称校验（Nickname_Edit_V1 冻结合同）', () => {
  test('1 个字符合法（不要求 2-3 个最小长度）', () => {
    expect(validateNickname('钓')).toBeNull();
  });

  test('20 个字符合法（上限含）', () => {
    expect(validateNickname('鱼'.repeat(20))).toBeNull();
  });

  test('21 个字符非法', () => {
    expect(validateNickname('鱼'.repeat(21))).toBe('昵称不能超过 20 个字符');
  });

  test('空与纯空格非法', () => {
    expect(validateNickname('')).toBe('昵称不能为空');
    expect(validateNickname('   ')).toBe('昵称不能为空');
  });

  test('emoji 按码点计数（代理对算 1）', () => {
    expect(codePointCount('🐟🐟')).toBe(2);
    expect(validateNickname('🐟'.repeat(20))).toBeNull();
    expect(validateNickname('🐟'.repeat(21))).toBe('昵称不能超过 20 个字符');
  });

  test('前后空格 trim 后参与比较', () => {
    expect(normalizeNickname('  钓友  ')).toBe('钓友');
    expect(validateNickname('  ')).toBe('昵称不能为空');
  });
});

describe('修改密码本地校验（Change_Password_Spec_V1）', () => {
  const draft = (over: Partial<Parameters<typeof validateChangePassword>[0]> = {}) => ({
    currentPassword: 'old123',
    newPassword: 'new456',
    confirmPassword: 'new456',
    ...over,
  });

  test('全部合法 → valid', () => {
    expect(validateChangePassword(draft()).valid).toBe(true);
  });

  test('当前密码为空 → 禁用保存（无行内错误提示）', () => {
    const result = validateChangePassword(draft({ currentPassword: '' }));
    expect(result.valid).toBe(false);
    expect(result.fieldError).toBeNull();
  });

  test('新密码 6 位以下非法（5 位）', () => {
    const result = validateChangePassword(draft({ newPassword: '12345', confirmPassword: '12345' }));
    expect(result.valid).toBe(false);
    expect(result.fieldError).toBe('新密码需为 6–72 位');
  });

  test('新密码超过 72 位非法', () => {
    const long = 'a'.repeat(73);
    const result = validateChangePassword(draft({ newPassword: long, confirmPassword: long }));
    expect(result.valid).toBe(false);
  });

  test('确认不一致 → 贴近字段错误', () => {
    const result = validateChangePassword(draft({ confirmPassword: 'other' }));
    expect(result.valid).toBe(false);
    expect(result.fieldError).toBe('两次输入的密码不一致');
  });

  test('新密码与当前密码相同 → 非法', () => {
    const result = validateChangePassword(draft({ newPassword: 'old123', confirmPassword: 'old123' }));
    expect(result.valid).toBe(false);
    expect(result.fieldError).toBe('新密码需与当前密码不同');
  });
});

describe('注册账号规则（Register V2）', () => {
  test('合法账号', () => {
    expect(validateUsername('yujian_2025')).toBeNull();
    expect(validateUsername('abc')).toBeNull();
    expect(validateUsername('a-b')).toBeNull();
  });

  test('非法账号：过短 / 非法字符 / 过长 / 空', () => {
    expect(validateUsername('ab')).toContain('3–32');
    expect(validateUsername('钓鱼大师')).toContain('3–32');
    expect(validateUsername('a'.repeat(33))).toContain('3–32');
    expect(validateUsername('')).toBe('请输入账号');
  });
});
