/**
 * Web Mercator 瓦片数学（地图选点页拖动 / 缩放换算，纯函数便于测试）：
 * 经纬度 ↔ 全局瓦片坐标（tile X/Y，单位：张）。
 */
export const TILE_SIZE = 256;

export const lonToTileX = (longitude: number, zoom: number): number =>
  ((longitude + 180) / 360) * 2 ** zoom;

export const latToTileY = (latitude: number, zoom: number): number => {
  // Web Mercator 纬度上限 ±85.05°，超出直接收敛到边界
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
};

export const tileXToLon = (tileX: number, zoom: number): number =>
  (tileX / 2 ** zoom) * 360 - 180;

export const tileYToLat = (tileY: number, zoom: number): number => {
  const n = Math.PI - (2 * Math.PI * tileY) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
