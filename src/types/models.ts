/**
 * 渔见领域类型 —— 与原 Android 工程 Kotlin 数据模型一一对应。
 *
 * 来源对照：
 *   model/Models.kt            -> FishSpecies / SelectedImageMeta / RecognitionPrediction
 *   catches/CatchRepository.kt -> RemoteCatch / CatchStatistics / CatchSaveDraft
 *   feedback/FeedbackRepository.kt -> FeedbackDraft
 *   ai/FishDetectionQualityGate.kt -> NormalizedFishBox / FishInputStatus / FishQualityLevel
 *   knowledge/FishKnowledgeModels.kt -> FishKnowledge* 全套
 */

// ---------------------------------------------------------------------------
// 基础枚举（wireName 与后端契约一致）
// ---------------------------------------------------------------------------

export type FishInputStatusWire =
  | 'ready'
  | 'no_fish'
  | 'uncertain'
  | 'multiple_fish'
  | 'incomplete_fish'
  | 'fish_too_small';

export type FishQualityLevelWire = 'good' | 'warning' | 'invalid';

// ---------------------------------------------------------------------------
// 模型 / 推理
// ---------------------------------------------------------------------------

export interface FishSpecies {
  key: string;
  name: string;
  aliases: string;
  category: string;
  habitat: string;
  diet: string;
  season: string;
  description: string;
  tip: string;
  discovered: boolean;
  catches: number;
}

// ---------------------------------------------------------------------------
// 位置（隐私与定位 13.2：钓点记录 / 地图选点）
// ---------------------------------------------------------------------------

/** 鱼获钓点：坐标（WGS-84，随鱼获记忆存储）+ 具体地址展示名 */
export interface CatchLocation {
  latitude: number;
  longitude: number;
  /** 具体地址（如「浙江省杭州市西湖区杨公堤」）；编码失败时为坐标退化文案 */
  label: string;
  /** 生成该位置的记录精度 */
  precision: 'precise' | 'waterbody_county';
  /** 地图手动选点标记（区别于自动定位） */
  manual?: boolean;
  /** 定位精度（米），仅系统自动定位携带 */
  accuracy?: number;
}

/** JS 侧只持有图片元信息；Bitmap 留在原生层。 */
export interface SelectedImageMeta {
  imageId: string;
  filePath: string;
  source: 'camera' | 'gallery' | string;
  width: number;
  height: number;
  /** 拍照页量尺测得的真实长度（cm）；仅相机拍摄时由 JS 附加，非原生字段。 */
  measuredLengthCm?: number | null;
  /** 拍照时自动定位 / 手动选点的钓点；仅相机拍摄时由 JS 附加，非原生字段。 */
  location?: CatchLocation | null;
}

export interface RecognitionCandidate {
  classIndex: number;
  speciesKey: string;
  speciesName: string;
  confidence: number;
}

export interface RecognitionPrediction {
  modelVersion: string;
  modelSha256: string;
  latencyMs: number;
  top1: RecognitionCandidate;
  candidates: RecognitionCandidate[];
  lowConfidence: boolean;
  /** 原生层导出的 224x224 letterbox 输入预览（file:// URI）。 */
  modelInputPath?: string;
}

export interface NormalizedFishBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FishDetectionDTO {
  confidence: number;
  className: string;
  box: NormalizedFishBox;
}

export interface DetectorRunDTO {
  modelVersion: string;
  onnxSha256: string;
  inputSize: number;
  latencyMs: number;
  detections: FishDetectionDTO[];
}

export interface FishInputAssessmentDTO {
  status: FishInputStatusWire;
  qualityLevel: FishQualityLevelWire;
  qualityReason: string;
  bboxAreaRatio: number;
  primary: FishDetectionDTO | null;
  cropBox: NormalizedFishBox | null;
  strongDetections: FishDetectionDTO[];
  weakDetections: FishDetectionDTO[];
}

/** 原生 recognize() 的完整返回（ProductionRecognitionResult 序列化）。 */
export interface ProductionRecognitionResultDTO {
  status: FishInputStatusWire;
  ready: boolean;
  totalLatencyMs: number;
  sourceWidth: number;
  sourceHeight: number;
  detectorRun: DetectorRunDTO;
  assessment: FishInputAssessmentDTO;
  prediction: RecognitionPrediction | null;
  cropPixels: [number, number, number, number] | number[] | null;
  cropPreviewPath?: string;
  modelInputPath?: string;
  debugReport: string;
}

export interface InferenceAssetMeta {
  recordPath: string;
  imagePath: string;
  cropPath?: string;
}

// ---------------------------------------------------------------------------
// 用户 / 会话
// ---------------------------------------------------------------------------

export interface UserSession {
  accessToken: string;
  userId: string;
  username: string;
  nickname: string;
}

// ---------------------------------------------------------------------------
// 鱼获
// ---------------------------------------------------------------------------

export interface RemoteCatch {
  id: string;
  imageUrl: string;
  speciesId: string;
  speciesName: string;
  confidence: number;
  modelVersion: string;
  capturedAt: string;
  createdAt: string;
}

export interface SpeciesCatchCount {
  speciesId: string;
  speciesName: string;
  count: number;
}

export interface CatchStatistics {
  totalCatches: number;
  speciesCount: number;
  topSpecies: SpeciesCatchCount[];
  recentSpecies?: string;
}

export interface UploadedCatchImage {
  uploadId: string;
  imageUrl: string;
}

export interface CatchSaveDraft {
  speciesId: string;
  speciesName: string;
  confidence: number;
  modelVersion: string;
  detectorResult?: Record<string, unknown> | null;
  classifierResult?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// 反馈
// ---------------------------------------------------------------------------

export type FeedbackTypeWire = 'confirmed' | 'corrected' | 'new_species_candidate';

export interface FeedbackDraft {
  sourceEventId: string;
  feedbackType: FeedbackTypeWire;
  modelVersion: string;
  predictedSpecies: string;
  confidence: number;
  correctedSpecies?: string | null;
  userNote?: string | null;
  imageId?: string | null;
}

// ---------------------------------------------------------------------------
// 鱼鉴知识库（Fish Knowledge）
// ---------------------------------------------------------------------------

export interface FishGuideItem {
  id: string;
  nameCn: string;
  summary: string;
  category: string;
  aliases?: string[];
  coverImage?: string | null;
  discovered?: boolean;
  catches?: number;
}

export interface FishKnowledgeSpecies {
  id: string;
  nameCn: string;
  aliases: string[];
  scientificName?: string | null;
  category: string;
  family?: string | null;
  genus?: string | null;
  summary: string;
  status: string;
  coverImage?: string | null;
}

export interface FishKnowledgeCover {
  imageUrl: string;
  style: string;
  title: string;
  status: string;
}

export interface FishKnowledgeFeature {
  title: string;
  text: string;
}

export interface FishKnowledgeSimilar {
  name: string;
  difference: string;
}

export interface FishKnowledgeCardContent {
  type: string;
  tag: string;
  rarity: number;
  power: number;
  challenge: number;
  description: string;
  features: FishKnowledgeFeature[];
  similar: FishKnowledgeSimilar[];
  habitat: string[];
  waterLayer: string;
  season: string;
  behavior: string;
  diet: string;
  method: string;
  rod: string;
  line: string;
  hook: string;
  bait: string[];
  find: string;
  attract: string;
  action: string;
  tip: string;
}

export interface FishKnowledgeCard {
  id: number;
  speciesId: string;
  cardType: string;
  title: string;
  imageUrl: string;
  description: string;
  content: FishKnowledgeCardContent;
  sortOrder: number;
  status: string;
}

export interface FishKnowledgeGalleryImage {
  id: number;
  type: string;
  url: string;
  title?: string | null;
  order: number;
}

export interface FishKnowledgeVideo {
  id: number;
  title: string;
  type: string;
  coverUrl?: string | null;
  videoUrl: string;
  duration: number;
  tags: string[];
}

export interface FishKnowledgeSimilarity {
  similarSpeciesId: string;
  similarSpeciesNameCn: string;
  difference: string;
}

export interface FishKnowledgeEcology {
  habitat: string[];
  waterLayer: string;
  season: string;
  behavior: string;
  diet: string;
}

export interface FishKnowledgeGear {
  method: string;
  rod: string;
  line: string;
  hook: string;
  bait: string[];
}

export interface FishKnowledgeSkill {
  find: string;
  attract: string;
  action: string;
  tip: string;
}

export interface FishKnowledgeStructured {
  displayTag?: string | null;
  ecology: FishKnowledgeEcology;
  gear: FishKnowledgeGear;
  skill: FishKnowledgeSkill;
}

export interface FishKnowledgeProfile {
  bodyShape?: string | null;
  features: string[];
  habitat: string[];
  food?: string | null;
  season: string[];
}

export interface FishKnowledgeFishing {
  waterLayer?: string | null;
  season: string[];
  bait: string[];
  method: string[];
  summary: string;
}

export interface FishKnowledgeDetail {
  species: FishKnowledgeSpecies;
  cover?: FishKnowledgeCover | null;
  cards: FishKnowledgeCard[];
  gallery: FishKnowledgeGalleryImage[];
  profile: FishKnowledgeProfile;
  fishing: FishKnowledgeFishing;
  videos: FishKnowledgeVideo[];
  similarity: FishKnowledgeSimilarity[];
  knowledge: FishKnowledgeStructured;
  dynamicAvailable: boolean;
}

// ---------------------------------------------------------------------------
// 演示数据（图鉴离线 fallback / 纠正选项）
// ---------------------------------------------------------------------------

export interface DemoCatchRecord {
  id: string;
  speciesKey: string;
  speciesName: string;
  weightKg: number;
  lengthCm: number;
  location: string;
  timeLabel: string;
  note: string;
  confidence: number;
  isNewRecord: boolean;
}

export type SharePeriodKey = 'SINGLE' | 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'ALL';
