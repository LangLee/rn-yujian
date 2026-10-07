import React from 'react';
import Svg, { Circle, G, Path, Polyline, Rect } from 'react-native-svg';

/**
 * 鱼获记忆空状态线稿（FishRecordDetail_State_No_Uploaded_Memory_V1 冻结稿）：
 * 相框（山 + 太阳）线稿 + 右下角叠加的播放圆标；纯线稿、无填充、圆头描边。
 */
export const MemoryFrameGlyph: React.FC<{ size?: number }> = ({ size = 112 }) => (
  <Svg width={size} height={size * (112 / 132)} viewBox="0 0 132 112" fill="none">
    {/* 相框 */}
    <Rect x="10" y="6" width="100" height="84" rx="12" stroke="#5E7A8E" strokeWidth={3} />
    {/* 山 + 太阳（收在相框内） */}
    <G>
      <Circle cx="36" cy="32" r="8" stroke="#5E7A8E" strokeWidth={3} />
      <Polyline
        points="16,88 46,46 66,72 84,54 104,88"
        stroke="#5E7A8E"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
    {/* 播放圆标（白底压住相框边线，叠在右下角） */}
    <Circle cx="102" cy="88" r="20" fill="#FFFFFF" stroke="#5E7A8E" strokeWidth={3} />
    <Path d="M96.5 80.5 L96.5 95.5 L109 88 Z" fill="#5E7A8E" />
  </Svg>
);
