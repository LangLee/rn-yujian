import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Dimensions, ScrollView, StyleProp, View, ViewStyle } from 'react-native';

/**
 * 全局统一轮播方案：中间原大主卡，两侧卡片缩小 + 下沉 + 变淡。
 * 首页渔获卡与鱼鉴详情页 Fish Knowledge 卡共用同一套几何与滚动逻辑，
 * 业务方只负责 renderItem（通过 render prop 拿到 scrollX 做插值动画）。
 */

/** 命令式句柄：邻卡点击仅居中（Fish Guide 动效合同 2.4）等场景使用 */
export interface CardCarouselHandle {
  /** 平滑滚动到指定卡片并居中（越界自动收敛） */
  scrollToIndex: (index: number, animated?: boolean) => void;
}

export interface CardCarouselRenderInfo {
  index: number;
  isActive: boolean;
  /** 轮播横向滚动位置，可用于 scale / opacity / translateX 插值 */
  scrollX: Animated.Value;
  /** 相邻卡片间距步长（卡宽 + gap） */
  step: number;
  /** 缩放补偿位移：侧卡向外推贴住屏幕边缘 */
  sidePush: number;
  sideScale: number;
  sideDrop: number;
  sideOpacity: number;
}

interface CardCarouselProps {
  count: number;
  /** 主卡宽度（首末卡也能居中：内容区两侧自动补 (屏宽 - 卡宽) / 2） */
  cardWidth: number;
  cardHeight: number;
  gap?: number;
  /** 两侧卡片缩放 / 下沉 / 透明度，形成中间高、两侧低的立体层次 */
  sideScale?: number;
  sideDrop?: number;
  sideOpacity?: number;
  /** 缩放补偿位移：侧卡向外推贴住屏幕边缘（0 表示不做补偿） */
  sidePush?: number;
  /** 初始居中卡片（冷启动定位；返回恢复由屏幕常驻挂载自然承担） */
  initialIndex?: number;
  onChange?: (index: number) => void;
  renderItem: (info: CardCarouselRenderInfo) => React.ReactNode;
  /** 滚动内容区额外样式（如上边距） */
  contentStyle?: StyleProp<ViewStyle>;
  /** 命令式句柄（React 19 ref-as-prop） */
  ref?: React.Ref<CardCarouselHandle>;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
  count,
  cardWidth,
  cardHeight,
  gap = 18,
  sideScale = 0.86,
  sideDrop = 22,
  sideOpacity = 0.6,
  sidePush = 0,
  initialIndex = 0,
  onChange,
  renderItem,
  contentStyle,
  ref,
}) => {
  const step = cardWidth + gap;
  const clampedInitial = Math.max(0, Math.min(count - 1, initialIndex));
  const [activeIndex, setActiveIndex] = useState(clampedInitial);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);  const screenWidth = Dimensions.get('window').width;
  // 首末卡也能居中：内容区两侧留出 (屏宽 - 卡宽) / 2
  const sidePadding = Math.max(0, (screenWidth - cardWidth) / 2);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number, animated = true) => {
        const clamped = Math.max(0, Math.min(count - 1, index));
        scrollViewRef.current?.scrollTo({ x: clamped * step, animated });
        setActiveIndex(clamped);
        onChange?.(clamped);
      },
    }),
    [count, onChange, step],
  );

  /* 冷启动定位到 initialIndex（Android 不支持 contentOffset 初始渲染） */
  useEffect(() => {
    if (clampedInitial > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ x: clampedInitial * step, animated: false });
      });
    }
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMomentumEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / step);
      const clamped = Math.max(0, Math.min(count - 1, next));
      if (clamped !== activeIndex) {
        setActiveIndex(clamped);
        onChange?.(clamped);
      }
    },
    [activeIndex, count, onChange, step],
  );

  if (count === 0) return null;

  return (
    <Animated.ScrollView
      ref={scrollViewRef}
      horizontal
      snapToInterval={step}
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        {
          gap,
          paddingHorizontal: sidePadding,
          marginBottom: sideDrop,
          overflow: 'visible' as const,
        },
        contentStyle,
      ]}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
      })}
      scrollEventThrottle={16}
      onMomentumScrollEnd={handleMomentumEnd}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ width: cardWidth, height: cardHeight }}>
          {renderItem({
            index,
            isActive: index === activeIndex,
            scrollX,
            step,
            sidePush,
            sideScale,
            sideDrop,
            sideOpacity,
          })}
        </View>
      ))}
    </Animated.ScrollView>
  );
};

/** 主卡缩放/下沉插值：业务卡片用它对齐全局轮播几何 */
export const useCarouselCardTransform = (
  index: number,
  scrollX: Animated.Value,
  step: number,
  sideScale: number,
  sideDrop: number,
  sideOpacity: number,
  sidePush: number,
) => {
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step];
  const config = { inputRange, extrapolate: 'clamp' as const };
  return {
    scale: scrollX.interpolate({ ...config, outputRange: [sideScale, 1, sideScale] }),
    opacity: scrollX.interpolate({ ...config, outputRange: [sideOpacity, 1, sideOpacity] }),
    translateY: scrollX.interpolate({ ...config, outputRange: [sideDrop, 0, sideDrop] }),
    translateX: scrollX.interpolate({ ...config, outputRange: [-sidePush, 0, sidePush] }),
  };
};
