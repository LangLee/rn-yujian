import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { AppIcon } from '../../components/icons/AppIcon';
import { coreColors } from '../../constants/coreUi';
import { fs, spacing } from '../../constants/tokens';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { PressableScale } from '../../components/ui/PressableScale';

/**
 * 调整头像 · 1:1 裁切（Avatar_Change_V1 冻结契约）：
 * - 输出为正方形图像（圆形仅是 UI 遮罩）；图片必须始终覆盖裁切区，无空白边；
 * - 单指拖动 + 双指捏合缩放，目标 1.0x–3.0x；
 * - 「使用此头像」仅生成本地临时图（Pending Preview），不上传；
 * - 「重新选择」回到来源选择；返回不提交裁切结果。
 *
 * 实现：PanResponder + Animated.Value（无逐帧 React 渲染）；
 * captureRef 对裁切方块取景输出（所见即所得，≤1024 源图保证目标尺寸）。
 */

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

interface AvatarCropViewProps {
  visible: boolean;
  imageUri: string | null;
  onConfirm: (tmpFileUri: string) => void;
  onReselect: () => void;
  onCancel: () => void;
}

export const AvatarCropView: React.FC<AvatarCropViewProps> = ({
  visible,
  imageUri,
  onConfirm,
  onReselect,
  onCancel,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cropSize = Math.min(screenW - 56, 340);

  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!visible || !imageUri) {
      setImageDims(null);
      return;
    }
    Image.getSize(
      imageUri,
      (w, h) => setImageDims({ w, h }),
      () => setImageDims({ w: 1024, h: 1024 }),
    );
  }, [visible, imageUri]);

  /* 基础 cover 布局：等比铺满裁切框 */
  const base = useMemo(() => {
    if (!imageDims || imageDims.w <= 0 || imageDims.h <= 0) {
      return null;
    }
    const scale = Math.max(cropSize / imageDims.w, cropSize / imageDims.h);
    return { w: imageDims.w * scale, h: imageDims.h * scale };
  }, [imageDims, cropSize]);

  /* 变换源真值（JS 数值镜像）+ Animated 输出（无重渲染） */
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const state = useRef({ tx: 0, ty: 0, zoom: 1 });
  const gestureStart = useRef<{
    tx: number;
    ty: number;
    zoom: number;
    x?: number;
    y?: number;
    dist?: number;
    midX?: number;
    midY?: number;
  }>({ tx: 0, ty: 0, zoom: 1 });

  useEffect(() => {
    state.current = { tx: 0, ty: 0, zoom: 1 };
    tx.setValue(0);
    ty.setValue(0);
    zoom.setValue(1);
  }, [imageUri, tx, ty, zoom]);

  const clampToBounds = (nextTx: number, nextTy: number, nextZoom: number) => {
    if (!base) {
      return { tx: 0, ty: 0 };
    }
    const maxX = Math.max(0, (base.w * nextZoom - cropSize) / 2);
    const maxY = Math.max(0, (base.h * nextZoom - cropSize) / 2);
    return {
      tx: Math.max(-maxX, Math.min(maxX, nextTx)),
      ty: Math.max(-maxY, Math.min(maxY, nextTy)),
    };
  };

  const applyTransform = (nextTx: number, nextTy: number, nextZoom: number) => {
    const clamped = clampToBounds(nextTx, nextTy, nextZoom);
    state.current = { tx: clamped.tx, ty: clamped.ty, zoom: nextZoom };
    tx.setValue(clamped.tx);
    ty.setValue(clamped.ty);
    zoom.setValue(nextZoom);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const [a, b] = touches;
          gestureStart.current = {
            ...state.current,
            dist: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
            midX: (a.pageX + b.pageX) / 2,
            midY: (a.pageY + b.pageY) / 2,
          };
        } else {
          gestureStart.current = {
            ...state.current,
            x: touches[0].pageX,
            y: touches[0].pageY,
          };
        }
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        const start = gestureStart.current;
        if (touches.length >= 2) {
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          const midX = (a.pageX + b.pageX) / 2;
          const midY = (a.pageY + b.pageY) / 2;
          if ((start.dist ?? 0) > 0 && start.midX !== undefined && start.midY !== undefined) {
            const nextZoom = Math.max(
              ZOOM_MIN,
              Math.min(ZOOM_MAX, start.zoom * (dist / (start.dist as number))),
            );
            /* 缩放围绕双指中点：中点位移并入平移，随后按新倍率夹取 */
            applyTransform(start.tx + (midX - start.midX), start.ty + (midY - start.midY), nextZoom);
          }
        } else if (touches.length === 1 && start.x !== undefined && start.y !== undefined) {
          applyTransform(
            start.tx + (touches[0].pageX - start.x),
            start.ty + (touches[0].pageY - start.y),
            state.current.zoom,
          );
        }
      },
      onPanResponderRelease: () => {
        /* 归位夹取（缩放回弹后可能超出边界） */
        const { tx: cTx, ty: cTy } = clampToBounds(
          state.current.tx,
          state.current.ty,
          state.current.zoom,
        );
        applyTransform(cTx, cTy, state.current.zoom);
      },
    }),
  ).current;

  const cropRef = useRef<View>(null);
  const [confirming, setConfirming] = useState(false);

  const handleUse = async () => {
    if (!visible || confirming) {
      return;
    }
    setConfirming(true);
    try {
      const uri = await captureRef(cropRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      onConfirm(uri);
    } finally {
      setConfirming(false);
    }
  };

  if (!visible || !imageUri || !base) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      {/* 顶栏：返回 + 标题「调整头像」 */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={onCancel} style={styles.backHit} accessibilityLabel="返回">
          <AppIcon name="back" size={24} color="#FFFFFF" />
        </PressableScale>
        <Text style={styles.title}>调整头像</Text>
        <View style={styles.backHit} />
      </View>

      {/* 裁切取景框：框外为暗幕，框内所见即 1:1 输出（圆形仅为 UI 遮罩） */}
      <View style={styles.cropWrap} {...panResponder.panHandlers}>
        <View
          ref={cropRef}
          style={[styles.cropFrame, { width: cropSize, height: cropSize }]}
          collapsable={false}
        >
          <Animated.Image
            source={{ uri: imageUri }}
            style={{
              position: 'absolute',
              left: (cropSize - base.w) / 2,
              top: (cropSize - base.h) / 2,
              width: base.w,
              height: base.h,
              transform: [{ translateX: tx }, { translateY: ty }, { scale: zoom }],
            }}
            resizeMode="stretch"
            fadeDuration={0}
          />
        </View>
        <View
          style={[
            styles.circleMask,
            {
              width: cropSize - 24,
              height: cropSize - 24,
              borderRadius: (cropSize - 24) / 2,
            },
          ]}
          pointerEvents="none"
        />
      </View>

      {/* 底部动作 */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        <PrimaryButton
          label="使用此头像"
          onPress={() => void handleUse()}
          loading={confirming}
        />
        <PressableScale onPress={onReselect} style={styles.reselectHit} accessibilityRole="button" accessibilityLabel="重新选择">
          <Text style={styles.reselectText}>重新选择</Text>
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C1A20',
    zIndex: 40,
  } as ViewStyle,
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  } as ViewStyle,
  backHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  title: {
    fontSize: fs(17),
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 2,
  } as TextStyle,
  cropWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  cropFrame: {
    overflow: 'hidden',
    backgroundColor: '#101E24',
  } as ViewStyle,
  circleMask: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  } as ViewStyle,
  actions: {
    paddingHorizontal: spacing.page,
  } as ViewStyle,
  reselectHit: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  } as ViewStyle,
  reselectText: {
    color: coreColors.mistBlueGray,
    fontSize: fs(14),
    fontWeight: '500',
  } as TextStyle,
});
