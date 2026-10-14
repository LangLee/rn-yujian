/**
 * 媒体地址解析（apiClient.resolveMediaUrl）单测：
 * - 相对路径拼接 API 域名（服务端 /api/... 媒体）
 * - 带 协议的 URI 原样返回 —— 回归：记忆媒体的 file:// 曾被误拼成
 *   「API域名/file://...」，导致媒体查看器第二张起加载失败落白色占位卡
 */
import { resolveMediaUrl } from '../src/services/apiClient';

// jest.setup 的 react-native-config 桩无环境变量 → 回落默认域名
const BASE = 'https://81.71.1.11';

describe('resolveMediaUrl', () => {
  test('空值返回 null', () => {
    expect(resolveMediaUrl(null)).toBeNull();
    expect(resolveMediaUrl(undefined)).toBeNull();
    expect(resolveMediaUrl('   ')).toBeNull();
  });

  test('服务端相对路径拼接 API 域名', () => {
    expect(resolveMediaUrl('/api/v1/media/fish.jpg')).toBe(
      `${BASE}/api/v1/media/fish.jpg`,
    );
    expect(resolveMediaUrl('uploads/fish.jpg')).toBe(
      `${BASE}/uploads/fish.jpg`,
    );
  });

  test('远程绝对地址原样返回', () => {
    expect(resolveMediaUrl('https://minio.example.com/bucket/fish.jpg')).toBe(
      'https://minio.example.com/bucket/fish.jpg',
    );
    expect(resolveMediaUrl('http://cdn.example.com/a.png')).toBe(
      'http://cdn.example.com/a.png',
    );
  });

  test('本地 file:///content:// URI 原样返回（不拼接 API 域名）', () => {
    expect(resolveMediaUrl('file:///data/user/0/cache/img.jpg')).toBe(
      'file:///data/user/0/cache/img.jpg',
    );
    expect(resolveMediaUrl('content://media/external/images/12')).toBe(
      'content://media/external/images/12',
    );
  });
});
