import { version } from '../../package.json';

/**
 * 应用运行时信息：版本号来自构建产物 package.json（关于页 /
 * 反馈附带版本等），不在页面硬编码假版本（About_YuJian_Spec_V1 §3）。
 */
export const appVersion: string = version;
export const appName: string = '渔见';
