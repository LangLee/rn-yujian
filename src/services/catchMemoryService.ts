/**
 * 鱼获记忆本地存储（Catch Memory，设计文档 08）。
 * 故事文字与补充媒体属于私人记忆，默认不公开；
 * 后端契约暂不承载长度/重量/地点，先落本地，字段结构对齐 18.2。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CatchMemoryMedia {
  id: string;
  /** file:// 或远程 URL */
  uri: string;
  kind: 'photo' | 'video';
  /** 视频时长（秒，由选择器返回） */
  durationSec?: number;
  /** 加入时间 ISO */
  addedAt: string;
}

export interface CatchMemoryData {
  /** 关于这次鱼获（私人，默认不公开） */
  story: string;
  /** 长度 cm / 重量 kg / 地点（可空，详情态无值则隐藏） */
  lengthCm?: number | null;
  weightKg?: number | null;
  location?: string | null;
  /** 媒体（照片 / 视频平级；视频 V1 暂缺在线播放，详情页展示封面 + 时长） */
  media: CatchMemoryMedia[];
}

export const EMPTY_MEMORY: CatchMemoryData = {
  story: '',
  lengthCm: null,
  weightKg: null,
  location: null,
  media: [],
};

const keyFor = (catchId: string) => `@yujian/catch_memory/${catchId}`;
const RECENT_SPECIES_KEY = '@yujian/recent_species';

export const catchMemoryService = {
  async load(catchId: string): Promise<CatchMemoryData> {
    try {
      const raw = await AsyncStorage.getItem(keyFor(catchId));
      if (!raw) {
        return { ...EMPTY_MEMORY, media: [] };
      }
      const parsed = JSON.parse(raw) as Partial<CatchMemoryData>;
      return {
        story: typeof parsed.story === 'string' ? parsed.story : '',
        lengthCm: typeof parsed.lengthCm === 'number' ? parsed.lengthCm : null,
        weightKg: typeof parsed.weightKg === 'number' ? parsed.weightKg : null,
        location: typeof parsed.location === 'string' ? parsed.location : null,
        media: Array.isArray(parsed.media) ? parsed.media : [],
      };
    } catch {
      return { ...EMPTY_MEMORY, media: [] };
    }
  },

  async save(catchId: string, data: CatchMemoryData): Promise<void> {
    await AsyncStorage.setItem(keyFor(catchId), JSON.stringify(data));
  },

  async remove(catchId: string): Promise<void> {
    await AsyncStorage.removeItem(keyFor(catchId));
  },

  /** 最近选择的鱼种（鱼种选择器「最近选择」）。 */
  async loadRecentSpecies(): Promise<{ key: string; name: string }[]> {
    try {
      const raw = await AsyncStorage.getItem(RECENT_SPECIES_KEY);
      const parsed = raw ? (JSON.parse(raw) as { key: string; name: string }[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async rememberSpecies(key: string, name: string): Promise<void> {
    try {
      const list = await catchMemoryService.loadRecentSpecies();
      const next = [
        { key, name },
        ...list.filter((item) => item.key !== key),
      ].slice(0, 8);
      await AsyncStorage.setItem(RECENT_SPECIES_KEY, JSON.stringify(next));
    } catch {
      // 忽略存储失败
    }
  },
};
