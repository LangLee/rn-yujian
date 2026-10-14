import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { fs, motion, radius, spacing } from '../../constants/tokens';
import { useTheme } from '../../contexts/ThemeContext';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 高度尽量紧凑（4.3 Bottom Sheet 规范） */
  maxHeightRatio?: number;
}

/**
 * Bottom Sheet（4.3 / 17.18）：权限引导、危险操作、筛选。
 * TranslationY + Fade，260-340ms；Scrim Alpha 0 → 0.18-0.28，避免强黑遮罩。
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.72,
}) => {
  const { profile } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.normal,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.fast,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, progress, mounted]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => handler.remove();
  }, [visible, onClose]);

  if (!mounted) {
    return null;
  }

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.24],
    extrapolate: 'clamp',
  });
  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.fill}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]} />
        </TouchableWithoutFeedback>
        {/* 键盘避让：Sheet 内含输入框（昵称、量尺校准等）时整体上抬到键盘上方。
            Android 弹窗窗口已随键盘 resize（RN Modal 强制 ADJUST_RESIZE），KAV 再叠
            padding 会双重补偿且收起后可能残留底部空隙，故仅 iOS 启用 */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoid}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: `${Math.round(
                  maxHeightRatio * 100
                )}%` as `${number}%`,
                backgroundColor: profile.isDark ? '#12333D' : '#FDFEFD',
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.handleWrap}>
              <View
                style={[
                  styles.handle,
                  { backgroundColor: profile.surface.glassBorder },
                ]}
              />
            </View>
            {title ? (
              <Text
                style={[styles.title, { color: profile.surface.textPrimary }]}
              >
                {title}
              </Text>
            ) : null}
            {children}
            <View style={{ height: spacing.xl }} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  } as ViewStyle,
  avoid: {
    flex: 1,
    justifyContent: 'flex-end',
  } as ViewStyle,
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A161B',
  } as ViewStyle,
  sheet: {
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
  } as ViewStyle,
  handleWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  } as ViewStyle,
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  } as ViewStyle,
  title: {
    fontSize: fs(17),
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  } as TextStyle,
});
