import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { palette } from '../constants/colors';
import { catchService } from '../services/catchService';

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
 */
export const RemoteImage: React.FC<RemoteImageProps> = ({
  url,
  authToken,
  style,
  resizeMode = 'cover',
  placeholder,
}) => {
  const resolved = catchService.resolveUrl(url);
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
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
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
