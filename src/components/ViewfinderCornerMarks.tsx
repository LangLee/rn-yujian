import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * 四角取景范围线（viewfinder corner marks）。
 *
 * 视觉权威：首次拍照教学冻结稿 Hero 的四角取景角标
 * （design/pages/recognition/first_use_camera_guide/frozen/P01-P03）。
 * 拍照取景页（IdentifyScreen）与教学引导页（FirstUseCameraGuide）共用本组件，
 * 两处框线同款同比例：
 *  - 白色 L 角标、圆头端点、圆角转角、无发光/扫描等科技效果；
 *  - 臂长 ≈ 48px / 826px 框宽（冻结稿测量 ≈5.8%）；
 *  - 线宽 ≈ 3px / 826px 框宽（渲染下限 1.2pt，避免小尺寸时消失）；
 *  - 角标外挑框边（不内缩）。
 *
 * 框的占屏几何（框顶/宽/高）由 GUIDE_FRAME 冻结比例提供，两页共用，
 * 保证拍照页取景框与引导页示范框同款同位置。
 */

/** 冻结稿角标测量比例（相对框宽） */
const ARM_RATIO = 0.058;
const STROKE_RATIO = 0.0037;

/**
 * 冻结稿 Hero 框几何（941×1671 画板，框 x58-884 / y198-768）：
 * 拍照取景页与教学引导页共用的同一组占屏比例。
 */
export const GUIDE_FRAME = {
  /** 框顶占屏高比例（y198 / 1672 ≈ 11.8%） */
  topRatio: 198 / 1672,
  /** 框宽占屏宽比例（826 / 941 ≈ 87.8%） */
  widthRatio: 826 / 941,
  /** 框高占屏高比例（570 / 1672 ≈ 34.1%） */
  heightRatio: 570 / 1672,
  /** 角标臂长比例（相对框宽，冻结稿测量） */
  armRatio: ARM_RATIO,
} as const;

interface ViewfinderCornerMarksProps {
  width: number;
  height: number;
  /** 线色（默认设计稿白） */
  color?: string;
  /** 角标臂长比例（相对框宽）；默认冻结稿测量值 */
  armRatio?: number;
  /** 角标内缩比例（相对框宽）；冻结稿角标外挑框边，默认 0 */
  insetRatio?: number;
}

export const ViewfinderCornerMarks: React.FC<ViewfinderCornerMarksProps> = ({
  width,
  height,
  color = 'rgba(253,254,253,0.95)',
  armRatio = ARM_RATIO,
  insetRatio = 0,
}) => {
  const arm = width * armRatio;
  const stroke = Math.max(1.2, width * STROKE_RATIO);
  const inset = width * insetRatio;

  // 单个角的 L 线：拐角在 (cx, cy)，两臂向外伸 arm 长
  const cornerPath = (cx: number, cy: number, dx: number, dy: number) =>
    `M ${cx + dx * arm} ${cy} L ${cx} ${cy} L ${cx} ${cy + dy * arm}`;

  const left = inset;
  const right = width - inset;
  const top = inset;
  const bottom = height - inset;

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={[
            cornerPath(left, top, 1, 1),
            cornerPath(right, top, -1, 1),
            cornerPath(left, bottom, 1, -1),
            cornerPath(right, bottom, -1, -1),
          ].join(' ')}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
};
