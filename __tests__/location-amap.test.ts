/**
 * 高德地名通道（配置 YUJIAN_AMAP_WEB_KEY 时）：
 * - 逆地理：WGS → GCJ 请求，结果映射为统一 ReverseGeocodePlace
 * - 高德失败 → 自动回落 Nominatim
 * - 搜索：POI 结果 GCJ → WGS
 */
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: { YUJIAN_AMAP_WEB_KEY: 'test-amap-key' },
  Config: { YUJIAN_AMAP_WEB_KEY: 'test-amap-key' },
}));

import { buildConcreteAddress, locationService } from '../src/services/locationService';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../src/utils/coordSys';

const jsonResponse = (body: unknown): Partial<Response> => ({
  ok: true,
  json: async () => body,
});

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('高德逆地理（reverseGeocodeAmap 优先）', () => {
  test('用 GCJ 坐标请求 restapi.amap.com，结果映射具体地址与行政区划字段', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: '1',
        regeocode: {
          formatted_address: '浙江省杭州市西湖区杨公堤1号附近',
          addressComponent: {
            province: '浙江省',
            city: [], // 直辖市/省直辖场景 city 为空数组
            district: '西湖区',
            township: '西湖街道',
            streetNumber: { street: '杨公堤' },
          },
        },
      }),
    );

    const place = await locationService.reverseGeocode(30.24, 120.13);

    const gcj = wgs84ToGcj02(30.24, 120.13);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('restapi.amap.com/v3/geocode/regeo');
    expect(url).toContain('key=test-amap-key');
    expect(url).toContain(`location=${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}`);

    expect(place).not.toBeNull();
    // 展示用具体地址：优先高德 formatted_address
    expect(buildConcreteAddress(place)).toBe('浙江省杭州市西湖区杨公堤1号附近');
    expect(place!.road).toBe('杨公堤');
    expect(place!.county).toBe('西湖区');
    expect(place!.suburb).toBe('西湖街道');
    // city 为空数组时回退到省级
    expect(place!.city).toBe('浙江省');
  });

  test('高德失败（status 0）→ 回落 Nominatim', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: '0' }))
      .mockResolvedValueOnce(
        jsonResponse({
          name: '千岛湖',
          display_name: '千岛湖, 淳安县, 杭州市, 浙江省',
          address: { lake: '千岛湖', county: '淳安县', city: '杭州市', state: '浙江省' },
        }),
      );

    const place = await locationService.reverseGeocode(29.6, 119.03);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('nominatim.openstreetmap.org/reverse');
    expect(place!.water).toBe('千岛湖');
    expect(place!.county).toBe('淳安县');
  });
});

describe('高德关键字搜索（searchPlacesAmap 优先）', () => {
  test('POI 的 GCJ location 转换为 WGS 后返回', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: '1',
        pois: [
          {
            id: 'B0FFF00XXX',
            name: '千岛湖',
            location: '119.031400,29.604700',
            pname: '浙江省',
            cityname: '杭州市',
            adname: '淳安县',
            address: '千岛湖风景区',
          },
        ],
      }),
    );

    const items = await locationService.searchPlaces('千岛湖');

    expect(items).toHaveLength(1);
    const wgs = gcj02ToWgs84(29.6047, 119.0314);
    expect(items[0].latitude).toBeCloseTo(wgs.latitude, 8);
    expect(items[0].longitude).toBeCloseTo(wgs.longitude, 8);
    expect(items[0].name).toBe('千岛湖');
    expect(items[0].detail).toContain('淳安县');
  });

  test('高德无结果 → 回落 Nominatim 搜索', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: '1', pois: [] }))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            place_id: 123,
            lat: '30.2741',
            lon: '120.1551',
            name: '西湖',
            display_name: '西湖, 杭州市, 浙江省',
          },
        ]),
      );

    const items = await locationService.searchPlaces('西湖');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('nominatim.openstreetmap.org/search');
    expect(items[0].name).toBe('西湖');
    expect(items[0].latitude).toBeCloseTo(30.2741, 8);
  });
});
