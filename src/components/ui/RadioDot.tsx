import React from 'react';
import { StyleSheet, View } from 'react-native';

interface RadioDotProps {
  selected: boolean;
  /** 选中态颜色（参考稿为淡金） */
  color: string;
  /** 未选中描边颜色 */
  idleColor: string;
  size?: number;
}

/** 圆形单选标记（参考稿样式：未选中细描边圆，选中金色环 + 金色内点）。 */
export const RadioDot: React.FC<RadioDotProps> = ({
  selected,
  color,
  idleColor,
  size = 22,
}) => (
  <View
    style={[
      styles.circle,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        borderColor: selected ? color : idleColor,
        borderWidth: selected ? 2 : 1.5,
      },
    ]}
  >
    {selected ? (
      <View
        style={[
          styles.dot,
          {
            width: size * 0.46,
            height: size * 0.46,
            borderRadius: size * 0.23,
            backgroundColor: color,
          },
        ]}
      />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
