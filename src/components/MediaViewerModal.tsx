import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageStyle,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { fs, motion, radius, spacing } from '../constants/tokens';
import { palette } from '../constants/colors';
import { RemoteImage } from './RemoteImage';
import { BottomSheet } from './ui/BottomSheet';
import { IconButton } from './ui/IconButton';
import { PrimaryButton } from './ui/PrimaryButton';
import { haptics } from '../utils/haptics';
import { formatMediaDuration } from '../utils/formatters';

export interface ViewerMedia {
  uri: string;
  /** 远程图片需要的 Bearer token */
  authToken?: string | null;
  /** 视频项展示封面 + 时长（V1 暂缺在线播放） */
  kind?: 'photo' | 'video';
  durationSec?: number;
}

interface MediaViewerModalProps {
  visible: boolean;
  media: ViewerMedia[];
  initialIndex?: number;
  onClose: () => void;
  /** 提供后显示「··· → 从本次鱼获移除」 */
  onRemove?: (index: number) => void;
}

/**
 * 沉浸式媒体查看器（8.5）：
 * 照片接近全屏，左右滑动同一 Catch Memory 的全部媒体；
 * 深色 Scrim 突出真实媒体（不是全局深色主题）。
 */
export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  media,
  initialIndex = 0,
  onClose,
  onRemove,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.normal,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialIndex, progress]);

  if (!visible) {
    return null;
  }

  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const current = media[index];
  const canRemove = Boolean(onRemove) && current != null;

  const confirmRemove = () => {
    setConfirmOpen(false);
    setMenuOpen(false);
    haptics.critical();
    onRemove?.(index);
  };

  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <Animated.View style={[styles.fill, { opacity }]}>
        {/* 顶部栏 */}
        <View style={styles.topBar}>
          <View style={styles.circleButtonWrap}>
            <IconButton
              icon="chevron-back"
              size={40}
              iconSize={20}
              iconColor="#FFFFFF"
              backgroundColor="rgba(255,255,255,0.14)"
              onPress={onClose}
            />
          </View>
          <Text style={styles.counter}>
            {media.length > 0 ? `${index + 1} / ${media.length}` : ''}
          </Text>
          {canRemove ? (
            <View style={styles.circleButtonWrap}>
              <IconButton
                icon="ellipsis-horizontal"
                size={40}
                iconSize={18}
                iconColor="#FFFFFF"
                backgroundColor="rgba(255,255,255,0.14)"
                onPress={() => setMenuOpen(true)}
              />
            </View>
          ) : (
            <View style={styles.circleButtonWrap} />
          )}
        </View>
        {/* 媒体横向滑动（左右 Swipe 跟手，无额外触觉） */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / WIDTH);
            if (next !== index && next >= 0 && next < media.length) {
              setIndex(next);
            }
          }}
        >
          {media.map((item, i) => (
            <View key={`${item.uri}-${i}`} style={styles.page}>
              {item.kind === 'video' ? (
                <View style={styles.videoPage}>
                  {/* iOS 可直接显示视频首帧；Android 无封面时保留深色底 */}
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.videoPoster}
                    resizeMode="cover"
                  />
                  <View style={styles.videoScrim} />
                  <View style={styles.videoBadge}>
                    <Icon name="play" size={34} color="#FFFFFF" />
                    {item.durationSec ? (
                      <Text style={styles.videoDuration}>
                        {formatMediaDuration(item.durationSec)}
                      </Text>
                    ) : null}
                    <Text style={styles.videoHint}>视频回放即将上线</Text>
                  </View>
                </View>
              ) : (
                <RemoteImage
                  url={item.uri}
                  authToken={item.authToken ?? null}
                  style={styles.image}
                  resizeMode="contain"
                />
              )}
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ··· 菜单 */}
      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={undefined}>
        <PrimaryButton
          label="从本次鱼获移除"
          variant="ghost"
          onPress={() => setConfirmOpen(true)}
          style={styles.menuButton}
        />
        <PrimaryButton
          label="取消"
          variant="ghost"
          onPress={() => setMenuOpen(false)}
          style={styles.menuButton}
        />
      </BottomSheet>

      {/* 移除确认（危险操作确认 Sheet，17.17） */}
      <BottomSheet visible={confirmOpen} onClose={() => setConfirmOpen(false)} title="从本次鱼获移除这张照片？">
        <Text style={styles.confirmText}>
          照片会从这次鱼获的记忆里移除，手机相册里的原文件不受影响。
        </Text>
        <PrimaryButton
          label="移除"
          variant="danger"
          onPress={confirmRemove}
          style={styles.menuButton}
        />
        <PrimaryButton
          label="先保留"
          variant="ghost"
          onPress={() => setConfirmOpen(false)}
          style={styles.menuButton}
        />
      </BottomSheet>
    </Modal>
  );
};

// 横向分页需要屏宽
const { width: WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: 'rgba(6,18,23,0.96)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl + 24,
    paddingHorizontal: spacing.md,
  },
  circleButtonWrap: {
    minWidth: 44,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  counter: {
    color: '#FFFFFF',
    fontSize: fs(14),
    fontWeight: '600',
  } as TextStyle,
  page: {
    width: WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: WIDTH,
    height: '100%',
  },
  videoPage: {
    width: WIDTH,
    flex: 1,
    backgroundColor: 'rgba(10,28,34,0.9)',
  } as ViewStyle,
  videoPoster: {
    ...StyleSheet.absoluteFillObject,
  } as ImageStyle,
  videoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,18,23,0.45)',
  } as ViewStyle,
  videoBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  } as ViewStyle,
  videoDuration: {
    color: '#FFFFFF',
    fontSize: fs(15),
    fontWeight: '600',
    letterSpacing: 1,
  } as TextStyle,
  videoHint: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: fs(12),
    marginTop: 2,
  } as TextStyle,
  menuButton: {
    marginTop: spacing.sm,
  },
  confirmText: {
    color: palette.mutedInk,
    fontSize: fs(14),
    lineHeight: 22,
    marginBottom: spacing.lg,
  } as TextStyle,
});
