import React from 'react';
import { Image, type ImageRequireSource, View } from 'react-native';

/**
 * 空状态核心图案（new001 水彩贴纸插画，透明底 1254×1254 PNG）。
 * 固定配色，不再随主题注入颜色；撕纸边缘自带留白，直接叠在玻璃卡片上。
 */
export type EmptyStateVariant = 'home' | 'myCatch' | 'fishbook' | 'memory' | 'search' | 'today';

interface EmptyIllustrationProps {
  variant: EmptyStateVariant;
  /** 显示高度（宽随 1:1 原图比例），默认 140 */
  height?: number;
}

/** 插画与场景一一对应：首页待鱼 / 收藏陈列 / 图鉴吊牌 / 回忆照片 / 寻鱼放大镜 / 今日空网 */
const artFor: Record<EmptyStateVariant, ImageRequireSource> = {
  home: require('../../assets/empty/home.png'),
  myCatch: require('../../assets/empty/my-catch.png'),
  fishbook: require('../../assets/empty/fish-book.png'),
  memory: require('../../assets/empty/memory.png'),
  search: require('../../assets/empty/search.png'),
  today: require('../../assets/empty/today.png'),
};

export const EmptyIllustration: React.FC<EmptyIllustrationProps> = ({ variant, height = 140 }) => (
  <View style={{ width: '100%', height, alignItems: 'center' }} pointerEvents="none">
    <Image
      source={artFor[variant]}
      resizeMode="contain"
      // 原图为正方形，按高度等比展示
      style={{ width: height, height }}
    />
  </View>
);
