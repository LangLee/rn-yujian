/**
 * 定位服务（locationService）单测：
 * - 精度收敛标签构建（精准 / 水域区县）
 * - 坐标退化文案
 * - 瓦片数学（经纬度 ↔ tile 空间）
 * - 权限不可用（jest 默认 iOS）时的静默降级
 */
import {
  buildConcreteAddress,
  formatCoordLabel,
  locationService,
  precisionRequiresLocation,
} from '../src/services/locationService';
import {
  lonToTileX,
  latToTileY,
  tileXToLon,
  tileYToLat,
} from '../src/utils/tileMath';

describe('buildConcreteAddress 生成具体地址（坐标仅存储，展示用地址）', () => {
  test('优先使用服务端拼好的 formattedAddress', () => {
    const address = buildConcreteAddress({
      formattedAddress: '浙江省杭州市西湖区杨公堤1号附近',
      road: '杨公堤',
      suburb: '西湖街道',
      county: '西湖区',
      city: '杭州市',
      state: '浙江省',
    });
    expect(address).toBe('浙江省杭州市西湖区杨公堤1号附近');
  });

  test('无 formattedAddress 时按 省+市+区县+乡镇+道路 拼接', () => {
    const address = buildConcreteAddress({
      road: '杨公堤',
      suburb: '西湖街道',
      county: '西湖区',
      city: '杭州市',
      state: '浙江省',
    });
    expect(address).toBe('浙江省杭州市西湖区西湖街道杨公堤');
  });

  test('拼接时水域名优先于道路（钓点最相关）', () => {
    const address = buildConcreteAddress({
      water: '千岛湖',
      county: '淳安县',
      city: '杭州市',
      state: '浙江省',
    });
    expect(address).toBe('浙江省杭州市淳安县千岛湖');
  });

  test('只有部分字段时也能拼出可用地址', () => {
    expect(buildConcreteAddress({ state: '浙江省' })).toBe('浙江省');
    expect(buildConcreteAddress({ county: '淳安县' })).toBe('淳安县');
  });

  test('超长地址截断到 60 字（识别结果页输入框上限）', () => {
    const address = buildConcreteAddress({ formattedAddress: '某'.repeat(80) });
    expect(address).not.toBeNull();
    expect(address!.length).toBe(60);
  });

  test('编码失败（null）返回 null，由调用方退化为坐标文案', () => {
    expect(buildConcreteAddress(null)).toBeNull();
  });
});

describe('formatCoordLabel 坐标退化文案', () => {
  test('北纬东经', () => {
    expect(formatCoordLabel(30.2512, 120.1345)).toBe('30.25°N 120.13°E');
  });

  test('南纬西经', () => {
    expect(formatCoordLabel(-33.8688, -151.2093)).toBe('33.87°S 151.21°W');
  });
});

describe('瓦片数学（Web Mercator）', () => {
  test('z0 时全球为一张瓦片，中心为 (0.5, 0.5)', () => {
    expect(lonToTileX(0, 0)).toBeCloseTo(0.5);
    expect(latToTileY(0, 0)).toBeCloseTo(0.5);
  });

  test('经度往返：lon → tileX → lon 误差可忽略', () => {
    for (const lon of [-179.9, -60, 0, 108.32, 151.2]) {
      expect(tileXToLon(lonToTileX(lon, 12), 12)).toBeCloseTo(lon, 6);
    }
  });

  test('纬度往返：lat → tileY → lat 误差可忽略', () => {
    for (const lat of [-66.5, -10, 0, 34.0, 78.9]) {
      expect(tileYToLat(latToTileY(lat, 10), 10)).toBeCloseTo(lat, 6);
    }
  });

  test('向右拖动地图（dx>0）中心点西移：tileX 减小', () => {
    const before = lonToTileX(120, 10);
    const after = lonToTileX(120, 10) - 100 / 256;
    expect(after).toBeLessThan(before);
    expect(tileXToLon(after, 10)).toBeLessThan(120);
  });
});

describe('locationService 静默降级（jest 默认 iOS 平台）', () => {
  test('getPermissionStatus → unavailable', async () => {
    await expect(locationService.getPermissionStatus()).resolves.toBe('unavailable');
  });

  test('requestPermission → unavailable（不发系统弹窗）', async () => {
    await expect(locationService.requestPermission()).resolves.toBe('unavailable');
  });

  test('resolveCurrentLocation 权限不可用时返回 null，不抛错', async () => {
    await expect(locationService.resolveCurrentLocation('precise')).resolves.toBeNull();
  });
});

describe('precisionRequiresLocation', () => {
  test('precise / waterbody_county 需要定位，none 不记录', () => {
    expect(precisionRequiresLocation('precise')).toBe(true);
    expect(precisionRequiresLocation('waterbody_county')).toBe(true);
    expect(precisionRequiresLocation('none')).toBe(false);
  });
});
