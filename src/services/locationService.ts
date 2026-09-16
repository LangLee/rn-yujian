import { PermissionsAndroid, Platform } from 'react-native';
import Config from 'react-native-config';
import { RecordPrecision } from '../contexts/PreferencesContext';
import { yujianLocation, NativePosition } from '../native/yujianLocation';
import { CatchLocation } from '../types/models';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../utils/coordSys';

export type { CatchLocation };

/**
 * 定位服务（设计文档 13.2 隐私与定位 / 18.5 Privacy Contract）：
 * - 权限：PermissionsAndroid 统一申请 fine + coarse；
 * - 定位：原生 LocationManager 一次性定位；
 * - 地名：高德 Web 服务（国内可达，需在 .env 配 YUJIAN_AMAP_WEB_KEY，免Key额度充足）
 *   → OSM Nominatim 兜底（海外可达，免 Key）→ 均失败退化为坐标文案；
 * - 精度收敛：按用户设置的记录精度生成钓点展示名。
 * 所有失败路径静默降级，绝不阻塞拍照识鱼主流程。
 * 高德系坐标为 GCJ-02，出入均做 WGS-84 转换，存储统一 WGS-84。
 */

export type LocationPermissionStatus =
  /** 已授权（fine 或 coarse 任一） */
  | 'granted'
  /** 未授权（可再次系统弹窗） */
  | 'denied'
  /** 已拒绝且勾选不再询问（只能去系统设置） */
  | 'blocked'
  /** 平台 / 原生模块不可用（iOS 预留） */
  | 'unavailable';

/** Nominatim / 高德逆地理编码结果（子字段按需取用） */
export interface ReverseGeocodePlace {
  name?: string;
  road?: string;
  /** 水域名：湖 / 江 / 水库等（钓点最相关） */
  water?: string;
  suburb?: string;
  cityDistrict?: string;
  county?: string;
  city?: string;
  state?: string;
  /** 服务端拼好的完整具体地址（高德 formatted_addresses / Nominatim display_name） */
  formattedAddress?: string;
}

export interface PlaceSearchItem {
  id: string;
  /** 主名：如「千岛湖」 */
  name: string;
  /** 副名：如「浙江省杭州市淳安县」 */
  detail: string;
  latitude: number;
  longitude: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const AMAP_BASE = 'https://restapi.amap.com';
const REQUEST_HEADERS: Record<string, string> = {
  // Nominatim 使用政策要求标识来源 UA
  'User-Agent': 'YujianAI/1.0 (fish-catch-recorder; react-native)',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};
const FETCH_TIMEOUT_MS = 8000;

/** 高德 Web 服务 Key（.env：YUJIAN_AMAP_WEB_KEY，选填）；未配置时走 Nominatim */
const amapKey = (): string => String(Config?.YUJIAN_AMAP_WEB_KEY ?? '').trim();

/** 钓点展示地址最大长度（与识别结果页输入框 maxLength 一致） */
export const LOCATION_LABEL_MAX = 60;

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** 逆地理结果 → 最具体的定位名（水域 / 道路 / 兴趣点） */
const pickPreciseName = (place: ReverseGeocodePlace): string | undefined =>
  place.water || place.road || place.name;

/**
 * 生成具体地址（纯函数，便于测试）：坐标仅存储，展示一律用具体地址。
 * - 优先服务端拼好的 formattedAddress（高德 formatted_addresses / Nominatim display_name）；
 * - 缺失时按 省+市+区县+乡镇+道路/水域 顺序拼接，如「浙江省杭州市西湖区杨公堤」；
 * - 均无返回 null，由调用方退化为坐标文案。
 */
export const buildConcreteAddress = (place: ReverseGeocodePlace | null): string | null => {
  if (!place) {
    return null;
  }
  const formatted = place.formattedAddress?.trim();
  if (formatted) {
    return formatted.slice(0, LOCATION_LABEL_MAX);
  }
  const parts = [
    place.state,
    place.city,
    place.county ?? place.cityDistrict,
    place.suburb,
    pickPreciseName(place),
  ];
  const joined = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('');
  return joined ? joined.slice(0, LOCATION_LABEL_MAX) : null;
};

/** 编码不可用时的坐标退化文案：`30.25°N 120.13°E` */
export const formatCoordLabel = (latitude: number, longitude: number): string => {
  const lat = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat} ${lon}`;
};

export const locationService = {
  /** 当前定位权限状态（不发系统弹窗的静默检查） */
  async getPermissionStatus(): Promise<LocationPermissionStatus> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }
    try {
      const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const coarse = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
      return fine || coarse ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  },

  /**
   * 申请定位权限（fine + coarse 一起弹）。
   * 返回值仅区分能否继续定位与是否只能去系统设置。
   */
  async requestPermission(): Promise<LocationPermissionStatus> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      const values = Object.values(result);
      if (values.some((value) => value === 'granted')) {
        return 'granted';
      }
      if (values.length > 0 && values.every((value) => value === 'never_ask_again')) {
        return 'blocked';
      }
      return 'denied';
    } catch {
      return 'unavailable';
    }
  },

  /** 系统定位服务（GPS/网络）是否开启 */
  isServiceEnabled(): Promise<boolean> {
    return yujianLocation.isServiceEnabled();
  },

  /**
   * 高德逆地理（需 Key；WGS 入参 → GCJ 请求）。
   * 高德 regeo 无独立水域名，道路 / 乡镇 / 区县足够钓点标签。
   */
  async reverseGeocodeAmap(latitude: number, longitude: number): Promise<ReverseGeocodePlace | null> {
    const key = amapKey();
    if (!key) {
      return null;
    }
    const gcj = wgs84ToGcj02(latitude, longitude);
    const url =
      `${AMAP_BASE}/v3/geocode/regeo?extensions=base` +
      `&location=${gcj.longitude.toFixed(6)},${gcj.latitude.toFixed(6)}&key=${key}`;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as {
        status?: string;
        regeocode?: {
          formatted_address?: string;
          addressComponent?: {
            province?: string | string[];
            city?: string | string[];
            district?: string | string[];
            township?: string | string[];
            streetNumber?: { street?: string };
          };
        };
      };
      const component = data.regeocode?.addressComponent;
      if (data.status !== '1' || !component) {
        return null;
      }
      // 直辖市等场景 city 可能为空数组
      const text = (value?: string | string[]): string | undefined =>
        typeof value === 'string' && value ? value : undefined;
      return {
        formattedAddress: data.regeocode?.formatted_address,
        road: component.streetNumber?.street || undefined,
        suburb: text(component.township),
        county: text(component.district),
        city: text(component.city) ?? text(component.province),
        state: text(component.province),
      };
    } catch {
      return null;
    }
  },

  /** Nominatim 逆地理（免 Key；国内网络可能不可达，作兜底） */
  async reverseGeocodeNominatim(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodePlace | null> {
    const url =
      `${NOMINATIM_BASE}/reverse?format=jsonv2&zoom=16&lat=${latitude}&lon=${longitude}` +
      `&accept-language=zh-CN`;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as {
        name?: string;
        display_name?: string;
        address?: Record<string, string>;
      };
      if (!data || !data.address) {
        return null;
      }
      const address = data.address;
      return {
        name: data.name,
        road: address.road ?? address.pedestrian ?? address.footway,
        water: address.river ?? address.lake ?? address.water ?? address.bay ?? address.reservoir,
        suburb: address.suburb ?? address.town ?? address.village,
        cityDistrict: address.city_district,
        county: address.county ?? address.district,
        city: address.city ?? address.municipality,
        state: address.state,
        formattedAddress: data.display_name,
      };
    } catch {
      return null;
    }
  },

  /** 逆地理编码（坐标 → 地名）：高德（有 Key）优先 → Nominatim 兜底；失败返回 null */
  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodePlace | null> {
    return (
      (await this.reverseGeocodeAmap(latitude, longitude)) ??
      (await this.reverseGeocodeNominatim(latitude, longitude))
    );
  },

  /** 高德关键字搜索（需 Key；结果 GCJ → WGS） */
  async searchPlacesAmap(query: string): Promise<PlaceSearchItem[]> {
    const key = amapKey();
    if (!key) {
      return [];
    }
    const url =
      `${AMAP_BASE}/v3/place/text?keywords=${encodeURIComponent(query)}` +
      `&offset=8&page=1&extensions=base&key=${key}`;
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as {
        status?: string;
        pois?: Array<{
          id?: string;
          name?: string;
          location?: string;
          pname?: string;
          cityname?: string;
          adname?: string;
          address?: string;
        }>;
      };
      if (data.status !== '1' || !Array.isArray(data.pois)) {
        return [];
      }
      return data.pois
        .filter((poi) => poi.location && poi.name)
        .map((poi) => {
          const [gcjLon, gcjLat] = poi.location!.split(',').map(Number);
          const wgs = gcj02ToWgs84(gcjLat, gcjLon);
          const region = `${poi.pname ?? ''}${poi.cityname ?? ''}${poi.adname ?? ''}`;
          return {
            id: poi.id ?? `${poi.location}`,
            name: poi.name!,
            detail: `${region}${poi.address && poi.address !== poi.name ? poi.address : ''}` || region,
            latitude: wgs.latitude,
            longitude: wgs.longitude,
          };
        });
    } catch {
      return [];
    }
  },

  /** Nominatim 关键字搜索（免 Key 兜底） */
  async searchPlacesNominatim(
    query: string,
    near?: { latitude: number; longitude: number },
  ): Promise<PlaceSearchItem[]> {
    const text = query.trim();
    if (!text) {
      return [];
    }
    const params = [
      `q=${encodeURIComponent(text)}`,
      'format=jsonv2',
      'limit=8',
      'accept-language=zh-CN',
    ];
    if (near) {
      // 偏向当前位置附近的结果（不强制框选）
      const delta = 2;
      params.push(
        `viewbox=${[near.longitude - delta, near.latitude + delta, near.longitude + delta, near.latitude - delta].join(',')}`,
        'bounded=0',
      );
    }
    try {
      const response = await fetchWithTimeout(`${NOMINATIM_BASE}/search?${params.join('&')}`);
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as Array<{
        place_id?: number;
        lat: string;
        lon: string;
        name?: string;
        display_name: string;
      }>;
      return (Array.isArray(data) ? data : []).map((item) => ({
        id: String(item.place_id ?? `${item.lat},${item.lon}`),
        name: item.name?.trim() || item.display_name.split(',')[0]?.trim() || text,
        detail: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }));
    } catch {
      return [];
    }
  },

  /** 地点搜索（地图选点页顶部搜索框）：高德（有 Key）优先 → Nominatim 兜底；失败返回空列表 */
  async searchPlaces(
    query: string,
    near?: { latitude: number; longitude: number },
  ): Promise<PlaceSearchItem[]> {
    const amap = await this.searchPlacesAmap(query);
    if (amap.length > 0) {
      return amap;
    }
    return this.searchPlacesNominatim(query, near);
  },

  /**
   * 一次性定位 + 编码为钓点（不打扰用户，任何失败返回 null）。
   * 优先实时定位；超时（默认 8s）回落最后已知位置。
   * 坐标随 CatchLocation 存储，label 为具体地址（编码失败退化为坐标文案）。
   */
  async resolveCurrentLocation(
    precision: 'precise' | 'waterbody_county',
    options?: { timeoutMs?: number },
  ): Promise<CatchLocation | null> {
    const status = await this.getPermissionStatus();
    if (status !== 'granted') {
      return null;
    }
    let position: NativePosition | null = null;
    try {
      position = await yujianLocation.getCurrentPosition(options?.timeoutMs ?? 8000);
    } catch {
      position = await yujianLocation.getLastKnownPosition();
    }
    if (!position) {
      return null;
    }
    const place = await this.reverseGeocode(position.latitude, position.longitude);
    const label =
      buildConcreteAddress(place) ??
      formatCoordLabel(position.latitude, position.longitude);
    return {
      latitude: position.latitude,
      longitude: position.longitude,
      label,
      precision,
      accuracy: position.accuracy,
    };
  },

  /** 地图选点结果统一走此出口构造 CatchLocation（坐标必存，地址展示；编码失败退化为坐标文案） */
  async fromManualPick(
    latitude: number,
    longitude: number,
    precision: 'precise' | 'waterbody_county',
  ): Promise<CatchLocation> {
    const place = await this.reverseGeocode(latitude, longitude);
    const label = buildConcreteAddress(place) ?? formatCoordLabel(latitude, longitude);
    return { latitude, longitude, label, precision, manual: true };
  },
};

/** 记录精度设置是否需要自动定位（'none' = 用户明确不记录位置） */
export const precisionRequiresLocation = (precision: RecordPrecision): boolean =>
  precision === 'precise' || precision === 'waterbody_county';
