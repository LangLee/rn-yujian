import { NativeModules, Platform } from 'react-native';

/**
 * AR 自动量尺原生模块封装（双引擎：Android GMS 走 ARCore，华为/荣耀 HMS 走 AR Engine；
 * iOS 契约预留，识别链路目前仅 Android）。
 *
 * 原生侧文件：
 *   android/.../com/yujian/ai/ar/ARMeasureView.kt        —— 容器：按 engine prop 挂控制器
 *   android/.../com/yujian/ai/ar/ArCoreController.kt     —— ARCore 会话 + GL 背景 + hitTest
 *   android/.../com/yujian/ai/ar/HuaweiARController.kt   —— 华为 AR Engine 同契约实现
 *   android/.../com/yujian/ai/rn/ARMeasureModule.kt      —— 双引擎探测 / 安装引导 / hitTest 转发
 */
export type AREngine = 'arcore' | 'huawei';

export type ARSupportLevel = {
  level: 'supported' | 'installable' | 'unsupported';
  /** level 非 unsupported 时给出应使用的引擎 */
  engine: AREngine | null;
};

interface ARMeasureNative {
  /** 'level:engine' 组合码 | 'unsupported' | 'unknown'（检测中） */
  isARSupported(): Promise<string>;
  /** 引导安装/更新对应引擎；true = 已就绪 */
  requestARCoreInstall(engine?: string): Promise<boolean>;
  /** dp 屏幕坐标 → 世界坐标（米）；null = 未命中平面 */
  hitTest(x: number, y: number): Promise<{ x: number; y: number; z: number; plane: boolean } | null>;
}

const native = NativeModules.YujianARMeasure as ARMeasureNative | undefined;

/** unknown（异步探测中）时轮询的间隔与总时长 */
const PROBE_INTERVAL_MS = 300;
const PROBE_TOTAL_MS = 1800;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 'supported:huawei' → { level: 'supported', engine: 'huawei' } */
const parseSupport = (code: string): ARSupportLevel => {
  const [level, engine] = code.split(':');
  if ((level === 'supported' || level === 'installable') && (engine === 'arcore' || engine === 'huawei')) {
    return { level, engine };
  }
  return { level: 'unsupported', engine: null };
};

export const arMeasure = {
  /** 原生模块是否存在（iOS / 未编译新原生层时为 false） */
  get available(): boolean {
    return Platform.OS === 'android' && !!native;
  },

  /**
   * 探测本机 AR 支持度（带轮询：部分机型首查返回 unknown）。
   * 引擎优先级由原生决定：ARCore（GMS）→ 华为 AR Engine（HMS）。
   * 无原生模块 / 非 Android 一律 unsupported，由调用方回落手动量尺。
   */
  async probeSupport(): Promise<ARSupportLevel> {
    if (!native) {
      return { level: 'unsupported', engine: null };
    }
    const deadline = Date.now() + PROBE_TOTAL_MS;
    let code = 'unknown';
    while (true) {
      try {
        code = await native.isARSupported();
      } catch {
        return { level: 'unsupported', engine: null };
      }
      if (code !== 'unknown' || Date.now() >= deadline) {
        break;
      }
      await sleep(PROBE_INTERVAL_MS);
    }
    return parseSupport(code);
  },

  /** 引导安装/更新引擎（ARCore → Play；AR Engine → 华为应用市场/系统组件）；false = 未就绪 */
  async requestInstall(engine: AREngine | null = null): Promise<boolean> {
    if (!native) {
      return false;
    }
    try {
      return await native.requestARCoreInstall(engine ?? undefined);
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
