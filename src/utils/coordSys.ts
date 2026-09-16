/**
 * 坐标系转换：WGS-84（GPS / 原生定位）↔ GCJ-02（高德系火星坐标）。
 *
 * 地图选点页用高德瓦片（国内网络可达 + 中文标注），瓦片按 GCJ-02 绘制；
 * 存储统一用 WGS-84，仅在显示 / 请求高德服务时转换。
 * GCJ-02 逆变换用定点迭代（3 次收敛到毫米级）。
 */

const SEMI_MAJOR = 6378245.0;
const ECCENTRICITY_SQ = 0.00669342162296594323;

const transformLat = (x: number, y: number): number => {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320.0 * Math.sin((y * Math.PI) / 30.0)) * 2.0) /
    3.0;
  return ret;
};

const transformLon = (x: number, y: number): number => {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) /
    3.0;
  return ret;
};

/** 粗略国界框：境外无 GCJ 偏移，直接原样返回 */
export const outOfChina = (latitude: number, longitude: number): boolean =>
  longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;

export interface LatLon {
  latitude: number;
  longitude: number;
}

export const wgs84ToGcj02 = (latitude: number, longitude: number): LatLon => {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  let dLat = transformLat(longitude - 105.0, latitude - 35.0);
  let dLon = transformLon(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY_SQ * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((SEMI_MAJOR * (1 - ECCENTRICITY_SQ)) / (magic * sqrtMagic) * Math.PI);
  dLon = (dLon * 180.0) / ((SEMI_MAJOR / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { latitude: latitude + dLat, longitude: longitude + dLon };
};

/** 定点迭代逆变换（收敛到毫米级），GCJ → WGS 误差满足钓点记录 */
export const gcj02ToWgs84 = (latitude: number, longitude: number): LatLon => {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  let wgsLat = latitude;
  let wgsLon = longitude;
  for (let i = 0; i < 3; i += 1) {
    const shifted = wgs84ToGcj02(wgsLat, wgsLon);
    wgsLat += latitude - shifted.latitude;
    wgsLon += longitude - shifted.longitude;
  }
  return { latitude: wgsLat, longitude: wgsLon };
};
