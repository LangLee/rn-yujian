import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { palette } from '../constants/colors';
import { NormalizedFishBox } from '../types/models';

const CROP_OVERLAY_ORANGE = '#F29C38';

interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DetectorOverlayImageProps {
  /** 本地归一化图片路径（file://）或远程 URL。 */
  imagePath: string;
  /** EXIF 校正后的原图宽高（归一化坐标基准）。 */
  sourceWidth: number;
  sourceHeight: number;
  detectorBox?: NormalizedFishBox | null;
  cropBox?: NormalizedFishBox | null;
  style?: object;
}

/**
 * 检测框叠加（对应原 DetectorOverlay.kt）：
 * 以 FIT_CENTER(contain) 布局计算绘制区域，再把归一化 bbox/cropBox
 * 转换为绝对坐标的描边框。
 */
export const DetectorOverlayImage: React.FC<DetectorOverlayImageProps> = ({
  imagePath,
  sourceWidth,
  sourceHeight,
  detectorBox,
  cropBox,
  style,
}) => {
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null);

  const onLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      setContainer((previous) =>
        previous?.width === width && previous?.height === height ? previous : { width, height },
      );
    },
    [],
  );

  const computeRect = useCallback(
    (box: NormalizedFishBox): BoxRect | null => {
      if (!container || sourceWidth <= 0 || sourceHeight <= 0) {
        return null;
      }
      const scale = Math.min(container.width / sourceWidth, container.height / sourceHeight);
      const drawnWidth = sourceWidth * scale;
      const drawnHeight = sourceHeight * scale;
      const offsetX = (container.width - drawnWidth) / 2;
      const offsetY = (container.height - drawnHeight) / 2;
      const x1 = Math.min(box.x1, box.x2);
      const x2 = Math.max(box.x1, box.x2);
      const y1 = Math.min(box.y1, box.y2);
      const y2 = Math.max(box.y1, box.y2);
      return {
        left: offsetX + x1 * drawnWidth,
        top: offsetY + y1 * drawnHeight,
        width: (x2 - x1) * drawnWidth,
        height: (y2 - y1) * drawnHeight,
      };
    },
    [container, sourceWidth, sourceHeight],
  );

  const cropRect = cropBox ? computeRect(cropBox) : null;
  const detectorRect = detectorBox ? computeRect(detectorBox) : null;

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      <Image
        source={{ uri: imagePath }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
      />
      {cropRect ? (
        <View
          style={[
            styles.boxOutline,
            {
              left: cropRect.left,
              top: cropRect.top,
              width: cropRect.width,
              height: cropRect.height,
              borderColor: CROP_OVERLAY_ORANGE,
              borderWidth: 2,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}
      {detectorRect ? (
        <View
          style={[
            styles.boxOutline,
            {
              left: detectorRect.left,
              top: detectorRect.top,
              width: detectorRect.width,
              height: detectorRect.height,
              borderColor: palette.waterTeal,
              borderWidth: 3,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
};

interface DetectorOverlayLegendProps {
  showCrop: boolean;
}

export const DetectorOverlayLegend: React.FC<DetectorOverlayLegendProps> = ({ showCrop }) => (
  <View style={styles.legendRow}>
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: palette.waterTeal }]} />
    </View>
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: CROP_OVERLAY_ORANGE }]} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.softWater,
    overflow: 'hidden',
  },
  boxOutline: {
    position: 'absolute',
    borderRadius: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 7,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
  },
});
