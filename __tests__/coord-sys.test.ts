/**
 * 坐标系转换（WGS-84 ↔ GCJ-02）单测：
 * - 境内偏移方向与量级（数百米）
 * - 逆变换往返误差（米级）
 * - 境外原样返回（无偏移）
 */
import { gcj02ToWgs84, outOfChina, wgs84ToGcj02 } from '../src/utils/coordSys';

/** 两点间近似距离（米），用于断言偏移量级 */
const distanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const dLat = (a.latitude - b.latitude) * 111_320;
  const dLon = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};

describe('outOfChina 国界粗判', () => {
  test('北京 / 杭州在境内；东京 / 纽约 / 悉尼在境外', () => {
    expect(outOfChina(39.9075, 116.39723)).toBe(false);
    expect(outOfChina(30.2741, 120.1551)).toBe(false);
    expect(outOfChina(35.6895, 139.6917)).toBe(true);
    expect(outOfChina(40.7128, -74.006)).toBe(true);
    expect(outOfChina(-33.8688, 151.2093)).toBe(true);
  });
});

describe('wgs84ToGcj02 / gcj02ToWgs84', () => {
  test('境内坐标有数百米偏移，境外原样返回', () => {
    const beijing = { latitude: 39.9075, longitude: 116.39723 };
    const gcj = wgs84ToGcj02(beijing.latitude, beijing.longitude);
    const offset = distanceMeters(beijing, gcj);
    expect(offset).toBeGreaterThan(200);
    expect(offset).toBeLessThan(1000);

    const tokyo = { latitude: 35.6895, longitude: 139.6917 };
    expect(wgs84ToGcj02(tokyo.latitude, tokyo.longitude)).toEqual(tokyo);
  });

  test('GCJ → WGS 往返误差在米级（<2m）', () => {
    const points = [
      { latitude: 39.9075, longitude: 116.39723 }, // 北京
      { latitude: 30.2741, longitude: 120.1551 }, // 杭州
      { latitude: 29.6047, longitude: 119.0314 }, // 淳安·千岛湖
      { latitude: 43.8171, longitude: 125.3235 }, // 长春
    ];
    for (const wgs of points) {
      const gcj = wgs84ToGcj02(wgs.latitude, wgs.longitude);
      const back = gcj02ToWgs84(gcj.latitude, gcj.longitude);
      expect(distanceMeters(wgs, back)).toBeLessThan(2);
    }
  });

  test('gcj02ToWgs84 境外原样返回', () => {
    const ny = { latitude: 40.7128, longitude: -74.006 };
    expect(gcj02ToWgs84(ny.latitude, ny.longitude)).toEqual(ny);
  });
});
