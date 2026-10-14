import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { palette } from '../constants/colors';
import { catchService } from '../services/catchService';
import { getApiAccessToken } from '../services/apiClient';

interface RemoteImageProps {
  url?: string | null;
  authToken?: string | null;
  style?: object;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  placeholder?: React.ReactNode;
  /** 偶发失败（弱网/大图超时）的自动重试次数；默认 2 */
  maxRetries?: number;
}

/** 加载指示延迟：短于该时长的加载不显示 spinner（避免小图闪烁） */
const SPINNER_DELAY_MS = 500;
/** 重试退避：第 n 次重试前等待 RETRY_BASE_MS * 2^n */
const RETRY_BASE_MS = 900;

/**
 * 远程图片：支持相对路径自动拼接 API 域名 + Bearer 鉴权头；
 * 空 URL / 加载失败时展示占位内容（照片加载失败不白屏，15 异常状态）。
 *
 * 相对路径（/api/... 媒体接口）读取需要登录令牌：调用方未显式传 authToken 时，
 * 自动使用统一 API 客户端的当前会话令牌；绝对地址（如 MinIO 公共图）不带鉴权头。
 *
 * 大图（鱼鉴插画单张 2MB+）弱网下首字节慢且易超时：
 * - 加载超过 500ms 显示轻量 spinner（而不是空白占位，避免被误读为「图挂了」）；
 * - onError 自动退避重试（Image key 变化强制重建请求），重试耗尽才落占位。
 */
export const RemoteImage: React.FC<RemoteImageProps> = ({
  url,
  authToken,
  style,
  resizeMode = 'cover',
  placeholder,
  maxRetries = 2,
}) => {
  const resolved = catchService.resolveUrl(url);
  const isApiRelative = Boolean(url && url.trim().startsWith('/'));
  const token = authToken ?? (isApiRelative ? getApiAccessToken() : null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(Boolean(resolved));
  const [showSpinner, setShowSpinner] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL 变化时重置状态（列表复用组件场景）
  useEffect(() => {
    setFailed(false);
    setRetry(0);
    setLoading(Boolean(resolved));
    setShowSpinner(false);
  }, [resolved]);

  // 卸载/URL 变化时清理待执行的重试
  useEffect(() => {
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [resolved]);

  // 加载耗时超过阈值 → 显示 spinner（onLoad/onLoadEnd 关闭）
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, resolved, retry]);

  const handleError = () => {
    if (retry < maxRetries) {
      const nextRetry = retry + 1;
      const delay = RETRY_BASE_MS * Math.pow(2, retry);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        setLoading(true);
        setRetry(nextRetry);
      }, delay);
      return;
    }
    setFailed(true);
    setLoading(false);
  };

  if (!resolved || failed) {
    return <View style={[style, styles.placeholder]}>{placeholder ?? null}</View>;
  }
  return (
    <View style={[style, styles.container]}>
      <Image
        key={`${resolved}#${retry}`}
        source={{
          uri: resolved,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }}
        style={styles.fill}
        resizeMode={resizeMode}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={handleError}
      />
      {showSpinner ? (
        <View style={styles.spinnerLayer} pointerEvents="none">
          <ActivityIndicator size="small" color={palette.waterTeal} />
        </View>
      ) : null}
    </View>
  );
};

/**
 * 预取远程图片到磁盘缓存（仅绝对 http(s) 地址——
 * 相对路径媒体需 Bearer 头，Image.prefetch 不支持请求头，跳过）。
 * 鱼鉴插画单张 2MB+，进入页面即预取，翻卡/滑动时直接命中缓存。
 */
export function prefetchRemoteImages(urls: (string | null | undefined)[]): void {
  for (const url of urls) {
    const value = (url ?? '').trim();
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      continue;
    }
    // 测试环境 Image.prefetch 可能未实现，Promise.resolve 兜底
    Promise.resolve(Image.prefetch(value)).catch(() => undefined);
  }
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  /** 占位容器：图标类 placeholder 需垂直水平居中（头像/鱼形图等） */
  placeholder: {
    backgroundColor: palette.softWater,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
