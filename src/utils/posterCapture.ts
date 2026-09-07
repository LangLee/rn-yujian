import { Platform, Share } from 'react-native';
import { Alert } from './alert';

/**
 * 海报捕获与保存（分享与成长模块）。
 * react-native-view-shot / react-native-share 为原生依赖：
 * JS 侧运行时探测，模块缺失时降级为系统分享文案，不白屏不崩溃；
 * 原生包随下次构建生效后，保存到相册 / 带图分享自动可用。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
let ViewShot: any = null;
let CameraRoll: any = null;
let RNShare: any = null;
try {
  // 可选原生模块：未链接时 require 抛错，走降级路径
  ViewShot = require('react-native-view-shot');
} catch {
  ViewShot = null;
}
try {
  CameraRoll = require('@react-native-community/cameraroll');
} catch {
  CameraRoll = null;
}
try {
  RNShare = require('react-native-share');
} catch {
  RNShare = null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const posterCaptureAvailable = (): boolean => Boolean(ViewShot);

type RefLike = { current: any };

async function capturePosterUri(ref: RefLike): Promise<string | null> {
  if (!ViewShot || !ref.current) {
    return null;
  }
  try {
    return await ViewShot.captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmp-file',
      snapshotContentContainer: false,
    });
  } catch {
    return null;
  }
}

export type SavePosterResult = 'saved' | 'opened-share' | 'unavailable' | 'failed';

/** 保存海报：优先存入相册；无相册能力时打开系统分享面板（面板内可保存图片）。 */
export async function savePosterToAlbum(ref: RefLike): Promise<SavePosterResult> {
  const uri = await capturePosterUri(ref);
  if (!uri) {
    return posterCaptureAvailable() ? 'failed' : 'unavailable';
  }
  if (CameraRoll) {
    try {
      const save = CameraRoll.save ?? CameraRoll.saveToCameraRoll;
      await save(uri, { album: '渔见', type: 'photo' });
      return 'saved';
    } catch {
      // 相册写入失败（权限等），继续尝试系统分享面板
    }
  }
  if (RNShare?.default) {
    try {
      await RNShare.default.open({
        url: Platform.OS === 'android' ? `file://${uri}` : uri,
        type: 'image/png',
        subject: '渔见 · 鱼获分享',
        failOnCancel: false,
      });
      return 'opened-share';
    } catch {
      return 'failed';
    }
  }
  if (Platform.OS === 'ios') {
    try {
      await Share.share({ url: uri, message: '渔见 · 鱼获分享' });
      return 'opened-share';
    } catch {
      return 'failed';
    }
  }
  return 'unavailable';
}

/** 系统分享海报：能截图则带图分享，否则分享文案。 */
export async function sharePoster(ref: RefLike, message: string): Promise<void> {
  const uri = await capturePosterUri(ref);
  if (uri && RNShare?.default) {
    try {
      await RNShare.default.open({
        url: Platform.OS === 'android' ? `file://${uri}` : uri,
        type: 'image/png',
        subject: '渔见 · 鱼获分享',
        message,
        failOnCancel: false,
      });
    } catch {
      // 用户取消分享不提示
    }
    return;
  }
  try {
    if (uri && Platform.OS === 'ios') {
      await Share.share({ url: uri, message });
    } else {
      await Share.share({ message });
    }
  } catch {
    // 用户取消分享不提示
  }
}

export function alertSaveResult(result: SavePosterResult): void {
  if (result === 'saved') {
    Alert.alert('已保存', '作品已保存到系统相册的「渔见」');
    return;
  }
  if (result === 'opened-share') {
    return;
  }
  if (result === 'failed') {
    Alert.alert('没有保存成功', '存储权限可能没有打开，可以在系统设置里授权后重试。');
    return;
  }
  Alert.alert(
    '保存即将可用',
    '当前安装包还没有包含保存组件，重新构建 App 后即可一键保存到相册。',
  );
}
