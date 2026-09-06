import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ImageStyle, StyleSheet, View } from 'react-native';
import { environmentBackgrounds } from '../constants/environmentAssets';
import { EnvironmentProfile } from '../constants/environments';
import { THEME_CROSSFADE_MS, useTheme } from '../contexts/ThemeContext';

/**
 * WaterBackdrop —— 环境照片背景（3.2 / 3.4 / 17.33 / 18.4）：
 * - 底图：每个 Environment Profile 一张真实湖面照片（静态 JPEG，随包内置），cover 铺满；
 * - Profile 切换时旧背景 Alpha 1→0、新背景 0→1 交叉淡入，页面不换掉；
 * - 顶部/底部轻 Scrim 保证浅色玻璃与文字可读性（夜晚深 Scrim，非全局深色主题）；
 * - 不做任何常驻环境动画，保持页面安静（内容阅读优先）。
 */

export const WaterBackdrop: React.FC = () => {
  const { profile, reduceMotion } = useTheme();
  const [layers, setLayers] = useState<{ base: EnvironmentProfile; fading?: EnvironmentProfile }>({
    base: profile,
  });
  const fade = useRef(new Animated.Value(1)).current;
  const currentIdRef = useRef(profile.id);

  // Profile 切换 → 新照片 0→1 交叉淡入（17.33：环境在变化，页面没有换掉）
  useEffect(() => {
    if (currentIdRef.current === profile.id) {
      return;
    }
    const base = layers.base.id === currentIdRef.current ? layers.base : profile;
    currentIdRef.current = profile.id;
    setLayers({ base, fading: profile });
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotion ? 0 : THEME_CROSSFADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setLayers({ base: profile });
      }
    });
  }, [profile, fade, layers.base, reduceMotion]);

  const isDark = profile.isDark;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 环境照片底图（切换时双图层交叉淡入；cover 铺满） */}
      <Image
        source={environmentBackgrounds[layers.base.id]}
        style={styles.backdropImage}
        resizeMode="cover"
        resizeMethod="scale"
      />
      {layers.fading ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Image
            source={environmentBackgrounds[layers.fading.id]}
            style={styles.backdropImage}
            resizeMode="cover"
            resizeMethod="scale"
          />
        </Animated.View>
      ) : null}

      {/* 可读性 Scrim：白天轻白纱，夜晚深色遮罩（不是全局深色主题） */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(4,14,20,0.44)' : 'rgba(255,255,255,0.2)' },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  backdropImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: '100%',
    height: '100%',
  } as ImageStyle,
});
