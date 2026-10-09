import React from 'react';
import { Image, ImageStyle, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { RemoteImage } from '../RemoteImage';

/**
 * Shared Default Profile Avatar V1 · FROZEN
 * （design/system/components/profile_avatar_v1/default_profile_avatar_contract.json）
 *
 * 语义：登录用户有真实头像 → 真实头像；缺失/加载失败 → 本默认头像；
 * 未登录游客是另一个状态，不属于本组件。各消费面与真实头像同尺寸。
 * 视觉：96×96 视口；外盘 r43 fill #6BFFFFFF / stroke #9EFFFFFF·2；
 * 人像 stroke #30485A·4：头圆心 (48,37) r13 + 圆头肩线。
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

/** 默认头像字形（合同矢量：外盘 + 人像线稿） */
export const DefaultAvatarGlyph: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96">
    <Circle cx={48} cy={48} r={43} fill="#6BFFFFFF" stroke="#9EFFFFFF" strokeWidth={2} />
    <Circle cx={48} cy={37} r={13} fill="none" stroke="#30485A" strokeWidth={4} />
    <Path
      d="M 22 82 C 24 62 36 56 48 56 C 60 56 72 62 74 82"
      fill="none"
      stroke="#30485A"
      strokeWidth={4}
      strokeLinecap="round"
    />
  </Svg>
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
