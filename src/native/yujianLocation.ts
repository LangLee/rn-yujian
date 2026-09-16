import { NativeModules, Platform } from 'react-native';

/**
 * 定位原生模块封装（Android: LocationManager；iOS 契约预留，与识别链路一致）。
 *
 * 原生侧文件：
 *   android/.../com/yujian/ai/rn/LocationModule.kt —— 服务状态 / 一次性定位 / 最后已知位置
 * 运行时权限由 locationService 经 PermissionsAndroid 处理。
 */
export interface NativePosition {
  latitude: number;
  longitude: number;
  /** 米 */
  accuracy?: number;
  /** epoch 毫秒 */
  timestamp: number;
}

interface YujianLocationNative {
  isLocationServiceEnabled(): Promise<boolean>;
  getLastKnownPosition(): Promise<NativePosition | null>;
  getCurrentPosition(timeoutMs: number): Promise<NativePosition>;
}

const native = NativeModules.YujianLocation as YujianLocationNative | undefined;

export const yujianLocation = {
  /** 原生模块是否存在（iOS / 未编译新原生层时为 false） */
  get available(): boolean {
    return Platform.OS === 'android' && !!native;
  },

  /** 系统定位服务（GPS/网络）是否开启；模块缺失时视为关闭 */
  async isServiceEnabled(): Promise<boolean> {
    if (!native) {
      return false;
    }
    try {
      return await native.isLocationServiceEnabled();
    } catch {
      return false;
    }
  },

  /** 最后已知位置（10 分钟内）；无 / 过旧 / 失败返回 null */
  async getLastKnownPosition(): Promise<NativePosition | null> {
    if (!native) {
      return null;
    }
    try {
      return await native.getLastKnownPosition();
    } catch {
      return null;
    }
  },

  /**
   * 一次性定位（默认 10s 超时，超时回落最后已知位置）。
   * 失败抛错：code 见 E_PERMISSION / E_SERVICE_OFF / E_NO_FIX / E_UNAVAILABLE。
   */
  getCurrentPosition(timeoutMs = 10_000): Promise<NativePosition> {
    if (!native) {
      return Promise.reject(new Error('E_UNAVAILABLE'));
    }
    return native.getCurrentPosition(timeoutMs);
  },
};
