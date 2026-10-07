import { ApiError, requestApi, resolveMediaUrl } from './apiClient';
import {
  BsideGeneration,
  BsideStatusWire,
  CatchSaveDraft,
  CatchStatistics,
  RemoteCatch,
  UploadedCatchImage,
} from '../types/models';

/**
 * 鱼获仓储（新后端 03.鱼获记录）：
 *  - GET  /api/v1/catches?limit=      → FishCatchVO[]
 *  - POST /api/v1/catches             → FishCatchCreateVO{catch_id,saved,catch}
 *  - POST /api/v1/catches/upload-image (multipart image) → FishCatchUploadVO
 *  - GET  /api/v1/catches/statistics  → FishCatchStatisticsVO
 *  - POST /api/v1/catches/{id}/bside        → BsideGenerationVO（发起鱼获记忆生成）
 *  - GET  /api/v1/catches/{id}/bside-status → BsideGenerationVO（生成状态轮询）
 *  - 媒体：image_url 为相对路径（/api/v1/catches/.../media），读取需 Bearer 头。
 */

const UPLOAD_TIMEOUT_MS = 30000;
const CREATE_RETRY_BASE_MS = 1500;
const CREATE_RETRY_TIMES = 4;

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
  length_cm?: number | null;
  weight_kg?: number | null;
  location?: string | null;
  bside_status?: string | null;
  bside_uri?: string | null;
}

interface BsideGenerationJson {
  job_id?: string | null;
  status?: string | null;
  result_uri?: string | null;
}

interface CreateCatchResponse {
  catch_id?: string;
  saved?: boolean;
  catch?: CatchItemJson;
}

interface StatisticsJson {
  total_catches?: number;
  species_count?: number;
  top_species?: { species_id?: string; species?: string; count?: number }[];
  recent_species?: string;
}

/** 后端 wire 值 → 生命周期枚举（未知值按 NOT_GENERATED 处理）。 */
const parseBsideStatus = (value?: string | null): BsideStatusWire => {
  const normalized = (value ?? '').trim().toUpperCase();
  return normalized === 'GENERATING' || normalized === 'READY' || normalized === 'FAILED'
    ? normalized
    : 'NONE';
};

const optionalNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

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
    lengthCm: optionalNumber(item.length_cm),
    weightKg: optionalNumber(item.weight_kg),
    location: (item.location ?? '').toString().trim() || null,
    bsideStatus: parseBsideStatus(item.bside_status),
    bsideUri: (item.bside_uri ?? '').toString().trim() || null,
  };
}

function parseBsideGeneration(item: BsideGenerationJson): BsideGeneration {
  return {
    jobId: (item.job_id ?? '')?.toString().trim() || null,
    status: parseBsideStatus(item.status),
    resultUri: (item.result_uri ?? '')?.toString().trim() || null,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const catchService = {
  /** 鉴权由 apiClient 模块会话统一携带（AuthContext 登录时 setApiSession）。 */
  async uploadImage(filePath: string): Promise<UploadedCatchImage> {
    const form = new FormData();
    form.append('image', {
      uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
      name: 'catch.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    const data = await requestApi<UploadImageResponse>('/api/v1/catches/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
    const uploadId = (data?.image_upload_id ?? '').trim();
    if (!uploadId) {
      throw new ApiError(0, '图片上传响应缺少 image_upload_id');
    }
    // TODO(debug): 临时日志，排查 409 用，定位后删除
    console.log(
      `[catch] upload-image → uploadId=${uploadId} imageUrl=${data?.image_url ?? ''}`,
    );
    return { uploadId, imageUrl: data?.image_url ?? '' };
  },

  async saveCatch(upload: UploadedCatchImage, draft: CatchSaveDraft): Promise<RemoteCatch> {
    const payload = {
      image_upload_id: upload.uploadId,
      species_id: draft.speciesId,
      species_name: draft.speciesName,
      confidence: draft.confidence,
      model_version: draft.modelVersion,
      detector_result: draft.detectorResult ?? null,
      classifier_result: draft.classifierResult ?? null,
    };

    // 上传图片在服务端异步落存：A0603(媒体对象尚未就绪) 属暂态冲突，按退避重试。
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= CREATE_RETRY_TIMES; attempt += 1) {
      if (attempt > 0) {
        await sleep(CREATE_RETRY_BASE_MS * attempt);
      }
      try {
        // TODO(debug): 临时日志，排查 409 用，定位后删除
        console.log(
          `[catch] POST /api/v1/catches attempt=${attempt + 1}/${CREATE_RETRY_TIMES + 1} ` +
            `payload=${JSON.stringify(payload)}`,
        );
        const data = await requestApi<CreateCatchResponse>('/api/v1/catches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload),
          timeoutMs: UPLOAD_TIMEOUT_MS,
        });
        if (data?.catch) {
          return parseCatch(data.catch);
        }
        if (data?.catch_id) {
          // 重放成功但未回传明细：用已知字段构造最小记录
          return {
            id: data.catch_id,
            imageUrl: upload.imageUrl,
            speciesId: draft.speciesId,
            speciesName: draft.speciesName,
            confidence: draft.confidence,
            modelVersion: draft.modelVersion,
            capturedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          };
        }
        throw new ApiError(0, '保存响应缺少鱼获记录');
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ApiError &&
          (error.bizCode === 'A0603' || error.statusCode === 429 || error.statusCode >= 500);
        if (!retryable) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ApiError(0, '服务端媒体尚未就绪，请稍后重试');
  },

  async listCatches(limit = 50): Promise<RemoteCatch[]> {
    const data = await requestApi<CatchItemJson[]>(
      `/api/v1/catches?limit=${Math.max(1, Math.min(200, Math.round(limit)))}`,
    );
    return Array.isArray(data) ? data.map(parseCatch) : [];
  },

  async statistics(): Promise<CatchStatistics> {
    const data = await requestApi<StatisticsJson>('/api/v1/catches/statistics');
    const top = Array.isArray(data?.top_species) ? data.top_species : [];
    return {
      totalCatches: data?.total_catches ?? 0,
      speciesCount: data?.species_count ?? 0,
      topSpecies: top.map((item) => ({
        speciesId: item.species_id ?? '',
        speciesName: item.species ?? '',
        count: item.count ?? 0,
      })),
      recentSpecies: (data?.recent_species ?? '').trim() || undefined,
    };
  },

  /** 发起 B 面（鱼获记忆）生成任务；同一条记录同时只允许一个活跃任务。 */
  async createBsideJob(catchId: string): Promise<BsideGeneration> {
    const data = await requestApi<BsideGenerationJson>(
      `/api/v1/catches/${encodeURIComponent(catchId)}/bside`,
      { method: 'POST', timeoutMs: UPLOAD_TIMEOUT_MS },
    );
    return parseBsideGeneration(data ?? {});
  },

  /** 查询 B 面生成状态（GENERATING 期间轮询）。 */
  async bsideStatus(catchId: string): Promise<BsideGeneration> {
    const data = await requestApi<BsideGenerationJson>(
      `/api/v1/catches/${encodeURIComponent(catchId)}/bside-status`,
    );
    return parseBsideGeneration(data ?? {});
  },

  /** 相对媒体路径 → 绝对地址（读取仍需 Bearer 头，由 RemoteImage 携带）。 */
  resolveUrl(path?: string | null): string | null {
    return resolveMediaUrl(path);
  },
};
