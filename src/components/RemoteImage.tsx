import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { palette } from '../constants/colors';

interface RemoteImageProps {
  url?: string | null;
  authToken?: string | null;
  style?: object;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  placeholder?: React.ReactNode;
}

/**
 * 远程图片（对应原 RemoteImage.kt）：支持 Bearer 鉴权头，
 * 失败或空 URL 时展示占位内容。
 */
export const RemoteImage: React.FC<RemoteImageProps> = ({
  url,
  authToken,
  style,
  resizeMode = 'cover',
  placeholder,
}) => {
  const resolved = (url ?? '').trim();
  if (!resolved) {
    return <View style={[style, styles.placeholder]}>{placeholder ?? null}</View>;
  }
  return (
    <Image
      source={{
        uri: resolved,
        headers: authToken
          ? { Authorization: `Bearer ${authToken}` }
          : undefined,
      }}
      style={style}
      resizeMode={resizeMode}
      defaultSource={undefined}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: palette.softWater,
  },
});
