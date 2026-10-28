import React from 'react';
import { Image, ImageStyle, StyleSheet, View, ViewStyle } from 'react-native';
import defaultAvatar from '../../assets/coreui/default_avatar.png';
import { RemoteImage } from '../RemoteImage';

/**
 * Shared Default Profile Avatar V2
 *
 * 语义：登录用户有真实头像 → 真实头像；缺失/加载失败 → 本默认头像；
 * 未登录游客是另一个状态，不属于本组件。各消费面与真实头像同尺寸。
 * 视觉：assets/coreui/default_avatar.png（钓者湖山默认头像，320×320 圆形透明底）。
 *
 * 远程头像（http(s)/相对路径）经 RemoteImage：相对路径自动带鉴权头，
 * 加载失败回退默认头像；本地 data:/file: URI 直接展示。
 */

interface ProfileAvatarProps {
  /** 显示尺寸（正圆直径） */
  size: number;
  /** 真实头像 URL（远程或本地 URI）；空/加载失败回退默认头像 */
  avatarUrl?: string | null;
  style?: ViewStyle;
}

interface ProfileAvatarState {
  failed: boolean;
}

export class ProfileAvatar extends React.Component<ProfileAvatarProps, ProfileAvatarState> {
  state: ProfileAvatarState = { failed: false };

  componentDidUpdate(prevProps: ProfileAvatarProps): void {
    if (prevProps.avatarUrl !== this.props.avatarUrl && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): React.ReactNode {
    const { size, avatarUrl, style } = this.props;
    const url = (avatarUrl ?? '').trim();
    const isLocalUri = url.startsWith('data:') || url.startsWith('file');
    const showReal = url.length > 0 && !this.state.failed;
    return (
      <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }, style]}>
        {showReal && isLocalUri ? (
          <Image
            source={{ uri: url }}
            style={styles.photo}
            onError={() => this.setState({ failed: true })}
          />
        ) : showReal ? (
          <RemoteImage
            url={url}
            style={styles.photo}
            placeholder={<DefaultAvatarGlyph size={size} />}
          />
        ) : (
          <DefaultAvatarGlyph size={size} />
        )}
      </View>
    );
  }
}

/** 默认头像（钓者湖山图，圆形透明底，按展示尺寸铺满头像框） */
export const DefaultAvatarGlyph: React.FC<{ size: number }> = ({ size }) => (
  <Image
    source={defaultAvatar}
    style={{ width: size, height: size }}
    resizeMode="cover"
  />
);

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  photo: {
    width: '100%',
    height: '100%',
  } as ImageStyle,
});
