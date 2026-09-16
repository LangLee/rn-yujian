import { NativeModules, Platform } from 'react-native';

/**
 * AR 自动量尺原生模块封装（Android: ARCore；iOS 契约预留，识别链路目前仅 Android）。
 *
 * 原生侧文件：
 *   android/.../com/yujian/ai/ar/ARMeasureView.kt     —— ARCore 会话 + GL 相机背景 + hitTest
 *   android/.../com/yujian/ai/rn/ARMeasureModule.kt   —— 支持度探测 / 安装引导 / hitTest 转发
 */
export type ARSupportLevel = 'supported' | 'installable' | 'unsupported';

interface ARMeasureNative {
  /** 'supported' | 'installable' | 'unsupported' | 'unknown'（unknown = 检测中） */
  isARSupported(): Promise<string>;
  /** 引导安装 Google Play Services for AR；true = 已就绪 */
  requestARCoreInstall(): Promise<boolean>;
  /** dp 屏幕坐标 → 世界坐标（米）；null = 未命中平面 */
  hitTest(x: number, y: number): Promise<{ x: number; y: number; z: number; plane: boolean } | null>;
}

const native = NativeModules.YujianARMeasure as ARMeasureNative | undefined;

/** unknown（异步探测中）时轮询的间隔与总时长 */
const PROBE_INTERVAL_MS = 300;
const PROBE_TOTAL_MS = 1800;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const arMeasure = {
  /** 原生模块是否存在（iOS / 未编译新原生层时为 false） */
  get available(): boolean {
    return Platform.OS === 'android' && !!native;
  },

  /**
   * 探测本机 AR 支持度（带轮询：部分 GMS 机型首查返回 unknown）。
   * 无原生模块 / 非 Android 一律 unsupported，由调用方回落手动量尺。
   */
  async probeSupport(): Promise<ARSupportLevel> {
    if (!native) {
      return 'unsupported';
    }
    const deadline = Date.now() + PROBE_TOTAL_MS;
    let level = 'unknown';
    while (true) {
      try {
        level = await native.isARSupported();
      } catch {
        return 'unsupported';
      }
      if (level !== 'unknown' || Date.now() >= deadline) {
        break;
      }
      await sleep(PROBE_INTERVAL_MS);
    }
    if (level === 'supported' || level === 'installable') {
      return level;
    }
    return 'unsupported';
  },

  /** 引导安装/更新 ARCore；resolve false = 未就绪（等待安装或用户取消） */
  async requestInstall(): Promise<boolean> {
    if (!native) {
      return false;
    }
    try {
      return await native.requestARCoreInstall();
    } catch {
      return false;
    }
  },

  /** 屏幕坐标（dp）→ 世界坐标（米）；null = 未命中平面；失败抛错 */
  hitTest(x: number, y: number): Promise<{ x: number; y: number; z: number; plane: boolean } | null> {
    if (!native) {
      return Promise.reject(new Error('AR 模块不可用'));
    }
    return native.hitTest(x, y);
  },
};
