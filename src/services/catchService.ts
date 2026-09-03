import { ApiError, apiBaseUrl } from './authService';
import {
  CatchSaveDraft,
  CatchStatistics,
  RemoteCatch,
  UploadedCatchImage,
} from '../types/models';

const UPLOAD_TIMEOUT_MS = 30000;

interface UploadImageResponse {
  image_upload_id?: string;
  image_url?: string;
}

interface CatchItemJson {
  id?: string;
  image_url?: string;
  species_id?: string;
  species_name?: string;
  confidence?: number;
  model_version?: string;
  captured_at?: string;
  created_at?: string;
}

interface StatisticsJson {
  total_catches?: number;
  species_count?: number;
  top_species?: { species_id?: string; species?: string; count?: number }[];
  recent_species?: string;
}

function parseCatch(item: CatchItemJson): RemoteCatch {
  return {
    id: item.id ?? '',
    imageUrl: item.image_url ?? '',
    speciesId: item.species_id ?? '',
    speciesName: item.species_name ?? '',
    confidence: typeof item.confidence === 'number' ? item.confidence : Number(item.confidence ?? 0),
    modelVersion: item.model_version ?? '',
    capturedAt: item.captured_at ?? '',
    createdAt: item.created_at ?? '',
  };
}

async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const root = apiBaseUrl().replace(/\/+$/, '');
  if (!root) {
    throw new ApiError(0, '用户服务未配置');
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.method === 'POST' ? UPLOAD_TIMEOUT_MS : UPLOAD_TIMEOUT_MS,
  );
  try {
    const response = await fetch(root + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      let detail = '';
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail ?? '';
      } catch {
        detail = '';
      }
      throw new ApiError(response.status, detail || `请求失败 (${response.status})`);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, '请求超时，请检查网络后重试');
    }
    throw new ApiError(0, error instanceof Error ? error.message : '网络请求失败');
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, token, init);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** 鱼获仓储（对应原 CatchRepository）。 */
export const catchService = {
  async uploadImage(token: string, filePath: string): Promise<UploadedCatchImage> {
    const form = new FormData();
    form.append('image', {
      uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
      name: 'catch.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    const response = await requestJson<UploadImageResponse>(
      '/api/v1/catches/upload-image',
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: form,
      },
    );
    const uploadId = (response.image_upload_id ?? '').trim();
    if (!uploadId) {
      throw new ApiError(0, '图片上传响应缺少 image_upload_id');
    }
    return { uploadId, imageUrl: response.image_url ?? '' };
  },

  async saveCatch(
    token: string,
    upload: UploadedCatchImage,
    draft: CatchSaveDraft,
  ): Promise<RemoteCatch> {
    const response = await requestJson<{ catch?: CatchItemJson }>('/api/v1/catches', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        image_upload_id: upload.uploadId,
        species_id: draft.speciesId,
        species_name: draft.speciesName,
        confidence: draft.confidence,
        model_version: draft.modelVersion,
        detector_result: draft.detectorResult ?? null,
        classifier_result: draft.classifierResult ?? null,
      }),
    });
    if (!response.catch) {
      throw new ApiError(0, '保存响应缺少鱼获记录');
    }
    return parseCatch(response.catch);
  },

  async listCatches(token: string): Promise<RemoteCatch[]> {
    const response = await requestJson<CatchItemJson[]>('/api/v1/catches', token);
    return Array.isArray(response) ? response.map(parseCatch) : [];
  },

  async statistics(token: string): Promise<CatchStatistics> {
    const response = await requestJson<StatisticsJson>('/api/v1/catches/statistics', token);
    const top = Array.isArray(response.top_species) ? response.top_species : [];
    return {
      totalCatches: response.total_catches ?? 0,
      speciesCount: response.species_count ?? 0,
      topSpecies: top.map((item) => ({
        speciesId: item.species_id ?? '',
        speciesName: item.species ?? '',
        count: item.count ?? 0,
      })),
      recentSpecies: (response.recent_species ?? '').trim() || undefined,
    };
  },

  resolveUrl(path?: string | null): string | null {
    const value = (path ?? '').trim();
    if (!value) {
      return null;
    }
    if (value.startsWith('https://') || value.startsWith('http://')) {
      return value;
    }
    const root = apiBaseUrl().replace(/\/+$/, '');
    if (!root) {
      return null;
    }
    return value.startsWith('/') ? `${root}${value}` : `${root}/${value}`;
  },
};
