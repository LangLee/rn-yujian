import Config from 'react-native-config';
import { demoSpecies } from '../constants/demoData';
import {
  FishGuideItem,
  FishKnowledgeCard,
  FishKnowledgeCardContent,
  FishKnowledgeDetail,
  FishKnowledgeFeature,
  FishKnowledgeSimilar,
} from '../types/models';

const DEFAULT_BASE_URL = 'https://yujian-model-factory-console-571785698442.asia-east1.run.app';

export const knowledgeBaseUrl = (): string =>
  ((Config.YUJIAN_FISH_KNOWLEDGE_BASE_URL ?? '').trim() || DEFAULT_BASE_URL);

const REQUEST_TIMEOUT_MS = 20000;

async function get(path: string): Promise<string> {
  const root = knowledgeBaseUrl().replace(/\/+$/, '');
  if (!root) {
    throw new Error('Fish Knowledge API 未配置');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(root + path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Fish Knowledge API ${response.status}: ${text}`);
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Fish Knowledge API 请求超时');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// JSON 解析辅助（与原 Kotlin 的 optString/optJSONArray 行为对齐）
// ---------------------------------------------------------------------------

function optString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeCardType(value: unknown): string {
  const raw = optString(value).trim().toUpperCase();
  if (raw === 'ECOLOGY') {
    return 'ECO';
  }
  if (raw === 'FISHING') {
    return 'SKILL';
  }
  if (raw === 'RECORD') {
    return 'GEAR';
  }
  return raw;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseFeatures(value: unknown): FishKnowledgeFeature[] {
  return asArray(value)
    .map((item) => {
      const object = asObject(item);
      return {
        title: optString(object?.title),
        text: optString(object?.text),
      };
    })
    .filter((item) => item.title || item.text);
}

function parseSimilar(value: unknown): FishKnowledgeSimilar[] {
  return asArray(value)
    .map((item) => {
      const object = asObject(item);
      return {
        name: optString(object?.name),
        difference: optString(object?.difference),
      };
    })
    .filter((item) => item.name || item.difference);
}

function parseCardContent(content: unknown, fallbackCardType: string): FishKnowledgeCardContent {
  const item = asObject(content) ?? {};
  return {
    type: normalizeCardType(optString(item.type) || fallbackCardType),
    tag: optString(item.tag),
    rarity: optNumber(item.rarity),
    power: optNumber(item.power),
    challenge: optNumber(item.challenge),
    description: optString(item.description),
    features: parseFeatures(item.features),
    similar: parseSimilar(item.similar),
    habitat: stringList(item.habitat),
    waterLayer: optString(item.water_layer),
    season: optString(item.season),
    behavior: optString(item.behavior),
    diet: optString(item.diet),
    method: optString(item.method),
    rod: optString(item.rod),
    line: optString(item.line),
    hook: optString(item.hook),
    bait: stringList(item.bait),
    find: optString(item.find),
    attract: optString(item.attract),
    action: optString(item.action),
    tip: optString(item.tip),
  };
}

function parseCards(value: unknown): FishKnowledgeCard[] {
  return asArray(value)
    .map((item, index) => {
      const object = asObject(item) ?? {};
      const cardType = optString(object.card_type) || optString(object.type);
      return {
        id: optNumber(object.id) || index,
        speciesId: optString(object.species_id),
        cardType: normalizeCardType(cardType),
        title: optString(object.title),
        imageUrl: optString(object.image_url),
        description: optString(object.description),
        content: parseCardContent(object.content, cardType),
        sortOrder: optNumber(object.sort_order),
        status: optString(object.status),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 与原 FishKnowledgeRepository.parseDetail 逐字段对应。 */
export function parseDetailJson(json: string): FishKnowledgeDetail {
  const root = (JSON.parse(json) ?? {}) as JsonObject;
  const species = asObject(root.species) ?? {};
  const profile = asObject(root.profile) ?? {};
  const fishing = asObject(root.fishing) ?? {};
  const gallery = asObject(root.gallery) ?? {};
  const cover = asObject(root.cover);
  const knowledge = asObject(root.knowledge);
  const ecology = asObject(knowledge?.ecology) ?? {};
  const gear = asObject(knowledge?.gear) ?? {};
  const skill = asObject(knowledge?.skill) ?? {};

  return {
    species: {
      id: optString(species.id),
      nameCn: optString(species.name_cn),
      aliases: stringList(species.alias),
      scientificName: optStringOrNull(species.scientific_name),
      category: optString(species.category),
      family: optStringOrNull(species.family),
      genus: optStringOrNull(species.genus),
      summary: optString(species.summary),
      status: optString(species.status),
      coverImage: optStringOrNull(species.cover_image),
    },
    cover: cover
      ? {
          imageUrl: optString(cover.image_url),
          style: optString(cover.style),
          title: optString(cover.title),
          status: optString(cover.status),
        }
      : null,
    cards: parseCards(root.cards),
    gallery: asArray(gallery.images)
      .map((item, index) => {
        const object = asObject(item) ?? {};
        return {
          id: optNumber(object.id) || index,
          type: optString(object.type),
          url: optString(object.url),
          title: optStringOrNull(object.title),
          order: optNumber(object.order),
        };
      })
      .sort((a, b) => a.order - b.order),
    profile: {
      bodyShape: optStringOrNull(profile.body_shape),
      features: stringList(profile.features),
      habitat: stringList(profile.habitat),
      food: optStringOrNull(profile.food),
      season: stringList(profile.season),
    },
    fishing: {
      waterLayer: optStringOrNull(fishing.water_layer),
      season: stringList(fishing.season),
      bait: stringList(fishing.bait),
      method: stringList(fishing.method),
      summary: optString(fishing.summary),
    },
    videos: asArray(root.videos)
      .map((item, index) => {
        const object = asObject(item) ?? {};
        return {
          id: optNumber(object.id) || index,
          title: optString(object.title),
          type: optString(object.type),
          coverUrl: optStringOrNull(object.cover_url),
          videoUrl: optString(object.video_url),
          duration: optNumber(object.duration),
          tags: stringList(object.tags),
        };
      })
      .filter((video) => video.videoUrl),
    similarity: asArray(root.similarity).map((item) => {
      const object = asObject(item) ?? {};
      return {
        similarSpeciesId: optString(object.similar_species_id),
        similarSpeciesNameCn: optString(object.similar_species_name_cn),
        difference: optString(object.difference),
      };
    }),
    knowledge: {
      displayTag: optStringOrNull(knowledge?.display_tag),
      ecology: {
        habitat: stringList(ecology.habitat),
        waterLayer: optString(ecology.water_layer),
        season: optString(ecology.season),
        behavior: optString(ecology.behavior),
        diet: optString(ecology.diet),
      },
      gear: {
        method: optString(gear.method),
        rod: optString(gear.rod),
        line: optString(gear.line),
        hook: optString(gear.hook),
        bait: stringList(gear.bait),
      },
      skill: {
        find: optString(skill.find),
        attract: optString(skill.attract),
        action: optString(skill.action),
        tip: optString(skill.tip),
      },
    },
    dynamicAvailable: Object.keys(asObject(root.dynamic) ?? {}).length > 0,
  };
}

/** 鱼鉴内容 API（对应原 FishKnowledgeRepository）。 */
export const fishKnowledgeService = {
  async listSpecies(): Promise<FishGuideItem[]> {
    const text = await get('/api/v1/fish/species');
    const array = JSON.parse(text);
    if (!Array.isArray(array)) {
      return [];
    }
    return (array as JsonObject[])
      .map((item) => ({
        id: optString(item.id),
        nameCn: optString(item.name_cn),
        summary: optString(item.summary),
        category: optString(item.category),
        coverImage: optStringOrNull(item.cover_image),
      }))
      .filter((item) => item.id && item.nameCn);
  },

  async getDetail(speciesId: string): Promise<FishKnowledgeDetail> {
    const encoded = encodeURIComponent(speciesId);
    const text = await get(`/api/v1/fish/species/${encoded}/detail`);
    return parseDetailJson(text);
  },

  resolveAssetUrl(asset?: string | null): string | null {
    const value = (asset ?? '').trim();
    if (!value) {
      return null;
    }
    if (value.startsWith('https://') || value.startsWith('http://')) {
      return value;
    }
    const base = knowledgeBaseUrl().replace(/\/+$/, '');
    if (!base) {
      return null;
    }
    return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`;
  },

  isConfigured(): boolean {
    return knowledgeBaseUrl().length > 0;
  },
};

// ---------------------------------------------------------------------------
// 图鉴本地 fallback（对应原 YujianApp.kt localGuideItems / mergeGuideItems
// 与 FishKnowledgeModels.kt toFallbackDetail）
// ---------------------------------------------------------------------------

export const localGuideItems = (): FishGuideItem[] =>
  demoSpecies.map((fish) => ({
    id: fish.key,
    nameCn: fish.name,
    aliases: fish.aliases
      .split('、')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    category: fish.category,
    summary: fish.description,
    discovered: fish.discovered,
    catches: fish.catches,
  }));

export const mergeGuideItems = (remote: FishGuideItem[]): FishGuideItem[] => {
  const local = new Map(localGuideItems().map((item) => [item.id, item]));
  return remote.map((item) => {
    const localItem = local.get(item.id);
    return {
      ...item,
      aliases: localItem ? localItem.aliases : item.aliases ?? [],
      category: item.category.length > 0 ? item.category : localItem?.category ?? '',
      discovered: localItem?.discovered ?? false,
      catches: localItem?.catches ?? 0,
    };
  });
};

export const toFallbackDetail = (item: FishGuideItem): FishKnowledgeDetail => {
  const local = demoSpecies.find((fish) => fish.key === item.id);
  const categoryParts = item.category.split(' · ');
  return {
    species: {
      id: item.id,
      nameCn: item.nameCn,
      aliases: item.aliases ?? [],
      scientificName: null,
      category: categoryParts[0] ?? '',
      family: categoryParts.length > 1 ? categoryParts[1] : null,
      genus: null,
      summary: item.summary,
      status: 'ACTIVE',
      coverImage: item.coverImage ?? null,
    },
    cover: null,
    cards: [],
    gallery: [],
    profile: {
      bodyShape: null,
      features: [],
      habitat: (local?.habitat ?? '')
        .split(' · ')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
      food: local?.diet ?? null,
      season: local?.season ? [local.season] : [],
    },
    fishing: {
      waterLayer: null,
      season: [],
      bait: [],
      method: [],
      summary: local?.tip ?? '',
    },
    videos: [],
    similarity: [],
    knowledge: {
      displayTag: null,
      ecology: { habitat: [], waterLayer: '', season: '', behavior: '', diet: '' },
      gear: { method: '', rod: '', line: '', hook: '', bait: [] },
      skill: { find: '', attract: '', action: '', tip: '' },
    },
    dynamicAvailable: false,
  };
};
