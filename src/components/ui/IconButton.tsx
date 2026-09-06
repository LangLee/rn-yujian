import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PressableScale } from './PressableScale';

interface IconButtonProps {
  icon: string;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  backgroundColor?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * 圆形图标按钮（参考稿样式：半透明玻璃圆底 + 居中图标）。
 * 显式圆形容器实现，避免 Icon.Button 在 Android 上的方形容器问题。
 */
export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 40,
  iconSize = 20,
  iconColor = '#EAF4F2',
  backgroundColor = 'rgba(255,255,255,0.14)',
  onPress,
  disabled,
  style,
}) => (
  <PressableScale onPress={onPress} disabled={disabled} scaleTo={0.92} style={style}>
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}
    >
      <Icon name={icon} size={iconSize} color={iconColor} />
    </View>
  </PressableScale>
);

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
