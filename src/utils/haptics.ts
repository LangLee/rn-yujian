import { Vibration } from 'react-native';

/**
 * 渔见触觉分级（17.2 / 17.35 / 17.22 Haptic Event Matrix）。
 * S0 Silent：普通浏览、滚动、页面切换、普通卡片点击 —— 不震。
 * S1 Subtle：候选鱼种选择、轻量模式切换。
 * S2 Confirm：拍照、识别完成、保存鱼获成功等核心确认。
 * S3 Critical：删除 / 注销等危险操作最终确认；极少使用。
 *
 * 使用系统短振动映射，不自造长 waveform；一次业务事件只触发一次。
 */
function vibrate(pattern: number | number[]): void {
  try {
    Vibration.vibrate(pattern, false);
  } catch {
    // 无振动能力的设备静默降级
  }
}

export const haptics = {
  /** S1 Subtle —— 极轻 selection feedback */
  selection: () => vibrate(8),
  /** S2 Confirm —— 短促一次确认 */
  confirm: () => vibrate(26),
  /** S3 Critical —— 危险操作最终确认，一次中等力度 */
  critical: () => vibrate([0, 55, 45, 55]),
  /** 明确取消振动（页面离开时） */
  cancel: () => {
    try {
      Vibration.cancel();
    } catch {
      // ignore
    }
  },
};

export type HapticLevel = 's1' | 's2' | 's3';

export function hapticForLevel(level: HapticLevel): void {
  if (level === 's1') {
    haptics.selection();
  } else if (level === 's2') {
    haptics.confirm();
  } else {
    haptics.critical();
  }
}
