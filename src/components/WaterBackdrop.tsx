import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MorningLakeScene } from './coreui/MorningLakeScene';

/**
 * WaterBackdrop —— 页面背景层（保留旧名称以兼容既有调用方）。
 *
 * 背景系统 V1 冻结后：全部湖景页面共用 Morning_Lake_Master_V1 母版，
 * 仅以 BG_ENV_HERO / BG_CONTENT / BG_DATA 三档存在感区分；
 * 禁止页面私有湖景、夕阳橙红与夜晚 HUD 等第三湖景世界。
 * 本组件一律渲染 BG_CONTENT 档（识别结果/详情/账号/表单等次级页）。
 */
export const WaterBackdrop: React.FC = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <MorningLakeScene level="content" />
  </View>
);
