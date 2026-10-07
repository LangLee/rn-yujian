import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { palette } from '../constants/colors';
import { catchService } from '../services/catchService';
import { getApiAccessToken } from '../services/apiClient';

interface RemoteImageProps {
  url?: string | null;
  authToken?: string | null;
  style?: object;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  placeholder?: React.ReactNode;
}

/**
 * 远程图片：支持相对路径自动拼接 API 域名 + Bearer 鉴权头；
 * 空 URL / 加载失败时展示占位内容（照片加载失败不白屏，15 异常状态）。
 *
 * 相对路径（/api/... 媒体接口）读取需要登录令牌：调用方未显式传 authToken 时，
 * 自动使用统一 API 客户端的当前会话令牌；绝对地址（如 MinIO 公共图）不带鉴权头。
 */
export const RemoteImage: React.FC<RemoteImageProps> = ({
  url,
  authToken,
  style,
  resizeMode = 'cover',
  placeholder,
}) => {
  const resolved = catchService.resolveUrl(url);
  const isApiRelative = Boolean(url && url.trim().startsWith('/'));
  const token = authToken ?? (isApiRelative ? getApiAccessToken() : null);
  const [failed, setFailed] = useState(false);

  // URL 变化时重置失败状态（列表复用组件场景）
  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return <View style={[style, styles.placeholder]}>{placeholder ?? null}</View>;
  }
  return (
    <Image
      source={{
        uri: resolved,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: palette.softWater,
  },
});
