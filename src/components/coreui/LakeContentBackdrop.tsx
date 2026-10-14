import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { MorningLakeScene } from './MorningLakeScene';

/**
 * 账号与隐私 · 内容页背景（Active Path 共享背景实现）。
 *
 * 视觉权威：Morning_Lake_Master_V1 / BG_CONTENT + 各页冻结稿构图 ——
 * 顶部晨雾湖景按设计稿近全强度呈现（仅 ~8% 轻纱保证头部可读），
 * 上部保持清晰、靠下方才自然渐隐入干净的白/MistWhite 内容场；
 * 不复刻旧稿强日出/金色倒影（Active_Path_Visual_Adjustment_Authority_V1）。
 * 页面内容浮在白场上；本组件只负责环境层，不承载任何文字。
 */

/** 内容场基色（lakeWhite 邻域；卡片为白，页面白偏雾） */
export const CONTENT_FIELD = '#F6FAFA';

/** 顶部湖景轻纱：设计稿照片近全强度，仅 5-10% 白纱（较 content 层默认 25% 更透） */
const LAKE_VEIL_SALIENCE = 0.92;

/**
 * 设置页首卡顶部留白：让第一张卡落在湖景渐变完成的白场
 * （顶部环境区约 32%，扣除 BACK_TITLE 头部高度后的余量）。
 */
export function accountPageContentTop(insetsTop: number, windowH: number): number {
  const zoneBottom = Math.round(windowH * 0.32);
  const headerH = insetsTop + 72;
  return Math.max(8, zoneBottom - headerH);
}

interface LakeContentBackdropProps {
  style?: ViewStyle;
  /** 顶部湖景区高度（默认约屏高 32%） */
  topHeight?: number;
}

export const LakeContentBackdrop: React.FC<LakeContentBackdropProps> = ({
  style,
  topHeight,
}) => {
  const zoneHeight = topHeight ?? undefined;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, style]} pointerEvents="none">
      {/* 顶部湖景区：上部保持清晰，约 45% 起才向内容场白渐变（无独立分割线） */}
      <View style={[styles.topZone, zoneHeight !== undefined ? { height: zoneHeight } : null]}>
        <MorningLakeScene level="content" salience={LAKE_VEIL_SALIENCE} />
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="lake-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={CONTENT_FIELD} stopOpacity="0" />
              <Stop offset="0.45" stopColor={CONTENT_FIELD} stopOpacity="0.06" />
              <Stop offset="0.75" stopColor={CONTENT_FIELD} stopOpacity="0.5" />
              <Stop offset="1" stopColor={CONTENT_FIELD} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#lake-fade)" />
        </Svg>
      </View>
      {/* 湖景区正下方起为连续白内容场（与渐变终点 1.0 无缝衔接） */}
      <View
        style={[
          styles.rest,
          zoneHeight !== undefined ? { top: zoneHeight } : null,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    backgroundColor: CONTENT_FIELD,
  } as ViewStyle,
  topZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '32%',
    overflow: 'hidden',
  } as ViewStyle,
  rest: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CONTENT_FIELD,
  } as ViewStyle,
});
