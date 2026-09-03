/**
 * 原生层返回的绝对路径（/data/...）转 RN <Image> 可用的 file:// URI。
 * 桥接模块的 cropPreviewPath/modelInputPath 已带前缀，此工具做统一兼容。
 */
export const toFileUri = (path?: string | null): string | null => {
  const value = (path ?? '').trim();
  if (!value) {
    return null;
  }
  return value.startsWith('file://') ? value : `file://${value}`;
};
