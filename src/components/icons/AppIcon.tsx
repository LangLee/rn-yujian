import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { ICON_DEFS, IconDef } from './iconDefs';
import { ICON_EXT_DEFS } from './iconExtDefs';

/** 全量图标注册表：43 张冻结母版 + 项目扩展字形 */
const ALL_ICONS = { ...ICON_DEFS, ...ICON_EXT_DEFS } as const satisfies Record<string, IconDef>;

export type AppIconName = keyof typeof ALL_ICONS;

export const APP_ICON_NAMES = Object.keys(ALL_ICONS) as AppIconName[];

export function isAppIconName(value: string): value is AppIconName {
  return Object.prototype.hasOwnProperty.call(ALL_ICONS, value);
}

export interface AppIconProps {
  /** 图标语义名，见 icon_library_v0_1（如 back / chevron_right / species） */
  name: AppIconName;
  /** 渲染边长（dp），图标在 24×24 母版内等比缩放 */
  size?: number;
  /** 线条颜色（母版 currentColor 的 tint） */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 渔见统一图标组件 —— 渲染设计系统冻结 SVG 母版（react-native-svg）。
 * 视觉合同：viewBox 0 0 24 24 · stroke 1.75 · 圆角线帽线节。
 */
export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 22,
  color = '#0B2D4B',
  style,
  testID,
}) => {
  // 读取走 IconDef 宽类型，避开 as const 字面量联合上可选属性 f 的窄化
  const def = ALL_ICONS[name] as IconDef;
  if (!def) {
    return null;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} testID={testID}>
      <G stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {def.elements.map((el, index) => {
          const key = `${name}-${index}`;
          if (el.t === 'p') {
            return el.f ? (
              <Path key={key} d={el.d} fill={color} stroke="none" />
            ) : (
              <Path key={key} d={el.d} />
            );
          }
          if (el.t === 'c') {
            return el.f ? (
              <Circle key={key} cx={el.cx} cy={el.cy} r={el.r} fill={color} stroke="none" />
            ) : (
              <Circle key={key} cx={el.cx} cy={el.cy} r={el.r} />
            );
          }
          return el.f ? (
            <Rect
              key={key}
              x={el.x}
              y={el.y}
              width={el.w}
              height={el.h}
              rx={el.rx}
              fill={color}
              stroke="none"
            />
          ) : (
            <Rect key={key} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} />
          );
        })}
      </G>
    </Svg>
  );
};
