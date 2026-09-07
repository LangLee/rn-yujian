import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 鱼获分享作品本地存储（分享与成长模块）。
 * 分享作品由真实鱼获数据在生成时快照而来（照片 URI、统计、文案），
 * 后端契约暂不承载作品，先落本地；生成后可再次查看 / 系统分享 / 删除。
 */

export type ShareTemplateId = 'score' | 'story';
export type ShareRangeKey = 'today' | 'week' | 'month' | 'custom';

/** 生成时的鱼获快照（一条聚合后的鱼种条目）。 */
export interface ShareSnapshotFish {
  name: string;
  count: number;
  lengthCm: number | null;
  weightKg: number | null;
  imageUri: string | null;
}

export interface ShareWork {
  id: string;
  /** 生成时间 ISO */
  createdAt: string;
  templateId: ShareTemplateId;
  layoutIndex: number;
  rangeKey: ShareRangeKey;
  /** 展示用范围文案：2026.09.01 - 09.07 */
  rangeLabel: string;
  /** 海报主标题：本周战绩 / 水边故事 */
  title: string;
  location: string | null;
  /** 尾鱼获 */
  count: number;
  /** 种鱼 */
  speciesCount: number;
  /** TOP 鱼获（按重量/条数排序，最多 3 条） */
  top: ShareSnapshotFish[];
  /** 其他鱼获（TOP 之外按条数排序） */
  others: ShareSnapshotFish[];
  /** 最大鱼获（可能不在 TOP 里重复展示时使用） */
  biggest: ShareSnapshotFish | null;
  /** 水边故事海报上的「我的记录」文案（取自私人鱼获记忆） */
  story: string | null;
  /** 海报照片（远程 URL 或本地 file://） */
  photoUris: (string | null)[];
  visibility: 'private' | 'public';
  /** 系统分享文案 */
  shareMessage: string;
}

const WORKS_KEY = '@yujian/share_works';

function sanitizeFish(raw: unknown): ShareSnapshotFish | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Partial<ShareSnapshotFish>;
  if (typeof item.name !== 'string' || !item.name) {
    return null;
  }
  return {
    name: item.name,
    count: typeof item.count === 'number' ? item.count : 1,
    lengthCm: typeof item.lengthCm === 'number' ? item.lengthCm : null,
    weightKg: typeof item.weightKg === 'number' ? item.weightKg : null,
    imageUri: typeof item.imageUri === 'string' ? item.imageUri : null,
  };
}

function parseWork(raw: unknown): ShareWork | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Partial<ShareWork>;
  if (typeof item.id !== 'string' || !item.id) {
    return null;
  }
  const templateId: ShareTemplateId = item.templateId === 'story' ? 'story' : 'score';
  const fishes = Array.isArray(item.top) ? item.top : [];
  const others = Array.isArray(item.others) ? item.others : [];
  return {
    id: item.id,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    templateId,
    layoutIndex: typeof item.layoutIndex === 'number' ? item.layoutIndex : 0,
    rangeKey:
      item.rangeKey === 'today' || item.rangeKey === 'week' || item.rangeKey === 'month'
        ? item.rangeKey
        : 'custom',
    rangeLabel: typeof item.rangeLabel === 'string' ? item.rangeLabel : '',
    title: typeof item.title === 'string' ? item.title : '鱼获分享',
    location: typeof item.location === 'string' ? item.location : null,
    count: typeof item.count === 'number' ? item.count : 0,
    speciesCount: typeof item.speciesCount === 'number' ? item.speciesCount : 0,
    top: fishes.map(sanitizeFish).filter((fish): fish is ShareSnapshotFish => fish !== null),
    others: others.map(sanitizeFish).filter((fish): fish is ShareSnapshotFish => fish !== null),
    biggest: sanitizeFish(item.biggest),
    story: typeof item.story === 'string' && item.story ? item.story : null,
    photoUris: Array.isArray(item.photoUris)
      ? item.photoUris.map((uri) => (typeof uri === 'string' ? uri : null))
      : [],
    visibility: item.visibility === 'public' ? 'public' : 'private',
    shareMessage: typeof item.shareMessage === 'string' ? item.shareMessage : '',
  };
}

export const shareWorkService = {
  async list(): Promise<ShareWork[]> {
    try {
      const raw = await AsyncStorage.getItem(WORKS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map(parseWork)
        .filter((work): work is ShareWork => work !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  },

  async save(work: ShareWork): Promise<void> {
    const works = await shareWorkService.list();
    const next = [work, ...works.filter((item) => item.id !== work.id)];
    await AsyncStorage.setItem(WORKS_KEY, JSON.stringify(next));
  },

  async remove(workId: string): Promise<void> {
    const works = await shareWorkService.list();
    await AsyncStorage.setItem(
      WORKS_KEY,
      JSON.stringify(works.filter((item) => item.id !== workId)),
    );
  },
};
