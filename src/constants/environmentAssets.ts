import { ImageRequireSource } from 'react-native';
import { EnvironmentId } from './environments';
import morningBg from '../assets/bg/morning.jpg';
import dayBg from '../assets/bg/day.jpg';
import sunsetBg from '../assets/bg/sunset.jpg';
import nightBg from '../assets/bg/night.jpg';

/**
 * Environment Profile → 背景照片资产（18.4 Theme Profile Contract：
 * backgroundAsset = 同一场景 master 的对应环境资产；资产随包内置，无加载失败路径）。
 */
export const environmentBackgrounds: Record<EnvironmentId, ImageRequireSource> = {
  morning: morningBg,
  day: dayBg,
  sunset: sunsetBg,
  night: nightBg,
};
