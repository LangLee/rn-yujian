/**
 * 首页反馈服务 —— 按资源包《Audio_Spec》《Home_Haptic_Spec》接入音效与触感。
 *
 * 音效（react-native-sound，Ambient 分类：遵循系统静音、不抢占用户正在播放的音乐）：
 *  - home_water_loop.mp3  首页可见且用户开启环境声时循环，音量 10%
 *  - camera_capture.wav   拍照反馈，40%
 *  - card_swipe.wav       鱼获卡切换，22%
 *  - profile_open.wav     打开个人中心，15%
 *
 * 触感（Vibration，遵循系统触觉开关；无触觉硬件时静默降级）：
 *  - 拍照 Medium 45ms / 切卡 Light 22ms / 个人中心 Soft 18ms / 收藏 Success 30+55+25ms
 */
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sound from 'react-native-sound';
import cameraCaptureSrc from '../assets/home/audio/camera_capture.wav';
import cardSwipeSrc from '../assets/home/audio/card_swipe.wav';
import homeWaterLoopSrc from '../assets/home/audio/home_water_loop.mp3';
import profileOpenSrc from '../assets/home/audio/profile_open.wav';

const AMBIENT_KEY = '@yujian/home_ambient_sound';

Sound.setCategory('Ambient', true);

type SfxName = 'capture' | 'swipe' | 'profile';

const VOLUMES: Record<SfxName, number> = {
  capture: 0.4,
  swipe: 0.22,
  profile: 0.15,
};

const SOURCES: Record<SfxName, number> = {
  capture: cameraCaptureSrc,
  swipe: cardSwipeSrc,
  profile: profileOpenSrc,
};

const cache: Partial<Record<SfxName, Sound>> = {};

const playSfx = (name: SfxName) => {
  try {
    const sound =
      cache[name] ??
      new Sound(SOURCES[name], (error) => {
        if (error) {
          delete cache[name];
        }
      });
    cache[name] = sound;
    if (sound.isPlaying()) {
      sound.stop();
    }
    sound.setVolume(VOLUMES[name]);
    sound.play();
  } catch {
    // 音频失败不阻塞业务
  }
};

let ambient: Sound | null = null;

export const homeFeedback = {
  /** 环境水声是否开启（默认关闭，Audio_Spec：仅用户主动开启时循环） */
  isAmbientEnabled: async (): Promise<boolean> => {
    try {
      return (await AsyncStorage.getItem(AMBIENT_KEY)) === '1';
    } catch {
      return false;
    }
  },

  setAmbientEnabled: async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(AMBIENT_KEY, enabled ? '1' : '0');
    } catch {
      // 忽略持久化失败
    }
    if (!enabled) {
      homeFeedback.stopAmbient();
    }
  },

  startAmbient: () => {
    if (ambient) {
      return;
    }
    try {
      ambient = new Sound(homeWaterLoopSrc, (error) => {
        if (error || !ambient) {
          ambient = null;
          return;
        }
        ambient.setNumberOfLoops(-1);
        ambient.setVolume(0.1); // 8–12%
        ambient.play();
      });
    } catch {
      ambient = null;
    }
  },

  stopAmbient: () => {
    if (ambient) {
      try {
        ambient.stop();
        ambient.release();
      } catch {
        // 忽略释放失败
      }
      ambient = null;
    }
  },

  playCapture: () => playSfx('capture'),
  playCardSwipe: () => playSfx('swipe'),
  playProfileOpen: () => playSfx('profile'),

  /* ── 触感 ─────────────────────────────────────────────── */

  hapticCapture: () => {
    Vibration.vibrate(45);
  },
  hapticSwipe: () => {
    Vibration.vibrate(22);
  },
  hapticProfile: () => {
    Vibration.vibrate(18);
  },
  hapticSuccess: () => {
    Vibration.vibrate([0, 30, 55, 25]);
  },
};

/** 兜底释放（App 后台时不强制释放，保持 Ambient 声音轻量） */
export const homeFeedbackAndroidRelease = () => {
  if (Platform.OS === 'android') {
    homeFeedback.stopAmbient();
  }
};
